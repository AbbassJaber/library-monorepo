import type {
  ChatMessage,
  ChatResponse,
  PendingAction,
  SearchBooksInput,
} from '@library/contracts';
import { AiFeature, PendingActionStatus, Role, VALIDATION_CODES } from '@library/contracts';
import { domain } from '@library/domain-config';
import { BUDGETS, estimateTokens } from '../cost/budgets.js';
import { composeSystem } from '../prompts/ordering.js';
import type {
  GenerateRequest,
  GenerateResult,
  Message,
  MessageContent,
} from '../providers/types.js';
import { clip, dataBlock } from '../safety/untrusted.js';
import { ToolError } from '../tools/registry.js';
import type { ToolContext } from '../tools/registry.js';
import {
  AGENT_INSTRUCTIONS,
  AGENT_TOOL_RESULT,
  CONTEXT_BLOCK,
  CONTEXT_NOTE,
  CONTEXT_SYNOPSIS_MAX_CHARS,
  TEXT,
  TOOL_RESULT_MAX_CHARS,
} from './agentText.js';
import type { AgentContext, AgentDeps, AgentInput } from './agentTypes.js';
import { collectBooks, extractCitations } from './citations.js';
import { MERGE_TOOL, mergedChanges, proposeAction } from './proposals.js';
import { runFeature } from './run.js';
import type { RunOutcome } from './run.js';

const toolResult = (toolUseId: string, value: unknown, isError = false): MessageContent => ({
  type: 'tool_result',
  toolUseId,
  content: clip(dataBlock(AGENT_TOOL_RESULT, value), TOOL_RESULT_MAX_CHARS),
  ...(isError ? { isError: true } : {}),
});

export const invalidIsbnResult = (
  error: unknown,
  input: unknown
): Record<string, unknown> | null => {
  if (!(error instanceof ToolError) || error.code !== 'INVALID_INPUT') return null;
  const issues = Array.isArray(error.details)
    ? (error.details as Array<{ message?: unknown }>)
    : [];
  if (!issues.some(issue => issue.message === VALIDATION_CODES.isbnInvalid)) return null;
  const isbn = (input as { isbn?: unknown } | null)?.isbn;
  return {
    error: 'INVALID_ISBN',
    isbn: typeof isbn === 'string' ? clip(isbn, 40) : null,
    message: 'Not a valid ISBN-10 or ISBN-13 (wrong length or check digit); nothing was looked up.',
    next: 'Do not end the turn: ask the user to repeat the ISBN, digit by digit, or offer to search the catalog by title instead.',
  };
};

const errorOf = (error: unknown, input?: unknown): Record<string, unknown> =>
  invalidIsbnResult(error, input) ??
  (error instanceof ToolError
    ? { error: error.code, message: error.message }
    : { error: 'FAILED', message: clip(String((error as Error).message ?? error), 300) });

const historyOf = (messages: AgentInput['messages'], maxTokens: number): Message[] => {
  let kept = messages.map(message => ({ role: message.role, content: message.content }));
  while (kept.length > 1 && estimateTokens(JSON.stringify(kept)) > maxTokens) kept = kept.slice(1);
  const first = kept.findIndex(message => message.role === 'user');
  return kept.slice(first < 0 ? kept.length : first);
};

const promptTokens = (request: Pick<GenerateRequest, 'system' | 'tools' | 'messages'>): number =>
  estimateTokens(JSON.stringify([request.system, request.tools ?? [], request.messages]));

export const agentTurn = async (
  deps: AgentDeps,
  ctx: AgentContext,
  input: AgentInput
): Promise<RunOutcome<ChatResponse>> => {
  const budget = BUDGETS.AGENT_CHAT;
  const maxSteps = budget.maxSteps ?? 6;
  const tier = deps.tier ?? budget.tier;
  const t = TEXT[input.locale];
  const search = deps.search;
  const toolCtx: ToolContext = {
    actor: ctx.actor,
    ports: deps.ports,
    requestId: ctx.requestId,
    ...(search ? { search: (query: SearchBooksInput) => search(ctx.actor, query) } : {}),
  };
  const outcome = await runFeature(
    {
      feature: AiFeature.enum.AGENT_CHAT,
      llm: deps.llm,
      trace: deps.ports.trace,
      actor: ctx.actor,
      requestId: ctx.requestId,
      tier,
    },
    async signal => {
      const contextBook = input.context
        ? await deps.ports.catalog.getBook(ctx.actor, input.context.bookId)
        : null;
      const system = composeSystem({
        instructions: AGENT_INSTRUCTIONS,
        vocabulary: domain.prompts.vocabulary,
        perUserContext: [
          `The user is a ${ctx.actor.role === Role.enum.LIBRARIAN ? 'librarian' : 'reader'}. ${t.reply}`,
          contextBook ? CONTEXT_NOTE : '',
        ]
          .filter(Boolean)
          .join(' '),
        ...(contextBook
          ? {
              dataBlocks: [
                dataBlock(CONTEXT_BLOCK, {
                  id: contextBook.id,
                  title: contextBook.title,
                  author: contextBook.author,
                  year: contextBook.publishedYear,
                  genres: contextBook.genres.map(genre => genre.name),
                  synopsis: clip(contextBook.synopsis, CONTEXT_SYNOPSIS_MAX_CHARS),
                }),
              ],
            }
          : {}),
      });
      const tools = deps.registry.specs(ctx.actor);
      const messages = historyOf(input.messages, Math.floor(budget.maxInputTokens / 2));
      const attempts: GenerateResult[] = [];
      const toolCalls: NonNullable<ChatMessage['toolCalls']> = [];
      const books = new Map<number, string>();
      if (contextBook) books.set(contextBook.id, contextBook.title);
      let pendingAction: PendingAction | undefined;
      let finalText: string | null = null;

      for (let step = 0; step < maxSteps && finalText === null; step++) {
        if (step > 0 && promptTokens({ system, tools, messages }) > budget.maxInputTokens) break;
        const result = await deps.llm.generate({
          tier,
          system,
          messages: [...messages],
          tools,
          toolChoice: { type: 'auto' },
          maxOutputTokens: budget.maxOutputTokens,
          signal,
        });
        attempts.push(result);
        if (result.toolCalls.length === 0) {
          finalText = result.text;
          break;
        }
        messages.push({
          role: 'assistant',
          content: [
            ...(result.text ? [{ type: 'text' as const, text: result.text }] : []),
            ...result.toolCalls.map(call => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.name,
              input: call.input,
            })),
          ],
        });
        const results: MessageContent[] = [];
        for (const call of result.toolCalls) {
          const definition = deps.registry.get(call.name);
          try {
            if (definition?.mutates) {
              const merged = pendingAction ? mergedChanges(pendingAction, call) : null;
              if (pendingAction && !merged) throw new ToolError('INVALID_INPUT', t.onePending);
              const previous = pendingAction;
              pendingAction = await proposeAction(deps, ctx, {
                name: merged ? MERGE_TOOL : call.name,
                input: merged ? { changes: merged } : call.input,
                locale: input.locale,
                knownTitles: books,
              });
              if (previous)
                await deps.ports.pendingActions.decide(
                  previous.id,
                  ctx.actor.id,
                  PendingActionStatus.enum.cancelled
                );
              results.push(
                toolResult(call.id, {
                  status: 'PENDING_CONFIRMATION',
                  summary: pendingAction.summary,
                  note: merged
                    ? 'Combined with your earlier proposal into one change. Nothing has changed yet; ask the user to confirm it.'
                    : 'Nothing has changed yet. The user sees Confirm and Cancel buttons; ask them to confirm.',
                })
              );
            } else {
              const output = await deps.registry.call(toolCtx, call.name, call.input);
              collectBooks(output, books);
              results.push(toolResult(call.id, output));
            }
            toolCalls.push({ name: call.name, input: call.input, ok: true });
          } catch (error) {
            results.push(toolResult(call.id, errorOf(error, call.input), true));
            toolCalls.push({ name: call.name, input: call.input, ok: false });
          }
        }
        messages.push({ role: 'user', content: results });
      }

      const exhausted = finalText === null;
      const { content, citations } = extractCitations(
        exhausted ? t.couldNotFinish : finalText || t.empty,
        books
      );
      const message: ChatMessage = {
        role: 'assistant',
        content: clip(content || t.empty, 4000),
        ...(citations.length > 0 ? { citations } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
      const value: ChatResponse = {
        message,
        ...(pendingAction ? { pendingAction } : {}),
        runIds: [],
      };
      return { value, attempts, fallbackUsed: exhausted };
    }
  );
  return {
    value: { ...outcome.value, runIds: outcome.meta.runId === null ? [] : [outcome.meta.runId] },
    meta: outcome.meta,
  };
};
