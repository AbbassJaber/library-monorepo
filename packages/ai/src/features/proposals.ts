import { randomUUID } from 'node:crypto';
import type {
  ChatLocale,
  PendingAction,
  ReadingListBatchBody,
  ReadingListChange,
} from '@library/contracts';
import {
  ChangeReadingListInput,
  ReadingState,
  RemoveFromReadingListInput,
  ToolName,
  UpdateReadingStateInput,
} from '@library/contracts';
import { domain } from '@library/domain-config';
import { issueConfirmToken } from '../safety/confirmToken.js';
import { ToolError } from '../tools/registry.js';
import { TEXT } from './agentText.js';
import type { AgentContext, AgentDeps } from './agentTypes.js';

const stateLabel = (state: ReadingState, locale: ChatLocale): string =>
  domain.labels[locale].states[state] ?? state;

export const proposeAction = async (
  deps: Pick<AgentDeps, 'ports' | 'registry' | 'confirmSecret'>,
  ctx: AgentContext,
  call: {
    name: string;
    input: unknown;
    locale: ChatLocale;
    knownTitles?: ReadonlyMap<number, string>;
  }
): Promise<PendingAction> => {
  const { tool, input } = deps.registry.prepare(ctx, call.name, call.input);
  if (!tool.mutates) throw new ToolError('INVALID_INPUT', `Tool "${tool.name}" changes nothing`);
  const t = TEXT[call.locale];
  if (tool.name === ToolName.enum.changeReadingList)
    return storeProposal(
      deps,
      ctx,
      tool.name,
      input,
      await batchSummary(deps, ctx, input, call.locale),
      call.locale
    );
  const { bookId, state } = input as { bookId: number; state?: ReadingState };
  const onShelf =
    tool.name === ToolName.enum.addToReadingList
      ? null
      : (await deps.ports.catalog.getShelf(ctx.actor)).find(entry => entry.book.id === bookId);
  const title =
    onShelf?.book.title ??
    call.knownTitles?.get(bookId) ??
    (await deps.ports.catalog.getBook(ctx.actor, bookId))?.title;
  if (title === undefined) throw new ToolError('INVALID_INPUT', t.notFound(bookId));
  if (onShelf === undefined)
    throw new ToolError(
      'INVALID_INPUT',
      tool.name === ToolName.enum.updateReadingState
        ? `"${title}" is not on the reading list yet: use addToReadingList with the state instead`
        : `"${title}" is not on the reading list, so there is nothing to remove`
    );
  const summary =
    tool.name === ToolName.enum.addToReadingList
      ? t.add(title, stateLabel(state ?? ReadingState.enum.WANT_TO_READ, call.locale))
      : tool.name === ToolName.enum.removeFromReadingList
        ? t.remove(title)
        : t.update(title, stateLabel(state ?? ReadingState.enum.WANT_TO_READ, call.locale));
  return storeProposal(deps, ctx, tool.name, input, summary, call.locale);
};

export const MERGE_TOOL = ToolName.enum.changeReadingList;

const asBatchChanges = (tool: string, input: unknown): ReadingListChange[] | null => {
  if (tool === ToolName.enum.updateReadingState) {
    const parsed = UpdateReadingStateInput.safeParse(input);
    return parsed.success
      ? [{ action: 'setState', bookId: parsed.data.bookId, state: parsed.data.state }]
      : null;
  }
  if (tool === ToolName.enum.removeFromReadingList) {
    const parsed = RemoveFromReadingListInput.safeParse(input);
    return parsed.success ? [{ action: 'remove', bookId: parsed.data.bookId }] : null;
  }
  if (tool === MERGE_TOOL) {
    const parsed = ChangeReadingListInput.safeParse(input);
    return parsed.success ? parsed.data.changes : null;
  }
  return null;
};

export const mergedChanges = (
  pending: Pick<PendingAction, 'tool' | 'input'>,
  call: { name: string; input: unknown }
): ReadingListChange[] | null => {
  const first = asBatchChanges(pending.tool, pending.input);
  const next = asBatchChanges(call.name, call.input);
  if (!first || !next) return null;
  const books = new Set(first.map(change => change.bookId));
  if (next.some(change => books.has(change.bookId))) return null;
  return [...first, ...next];
};

const batchSummary = async (
  deps: Pick<AgentDeps, 'ports'>,
  ctx: AgentContext,
  input: unknown,
  locale: ChatLocale
): Promise<string> => {
  const { changes } = input as ReadingListBatchBody;
  const shelf = await deps.ports.catalog.getShelf(ctx.actor);
  const entry = (bookId: number) => shelf.find(e => e.book.id === bookId);
  const missing = changes.filter(change => !entry(change.bookId)).map(change => change.bookId);
  if (missing.length > 0)
    throw new ToolError(
      'INVALID_INPUT',
      `Not on the reading list: book ${missing.join(', ')}. A batch only changes books already on the list (getReadingList shows them); adding is one book at a time.`
    );
  const locked = changes.filter(
    change => change.action === 'setState' && entry(change.bookId)!.available === false
  );
  if (locked.length > 0)
    throw new ToolError(
      'INVALID_INPUT',
      `Archived, so its state is locked: ${locked.map(change => `"${entry(change.bookId)!.book.title}"`).join(', ')} (it can still be removed)`
    );
  const items = changes.map(change => ({
    title: entry(change.bookId)!.book.title,
    state: change.action === 'setState' ? stateLabel(change.state, locale) : null,
  }));
  const t = TEXT[locale];
  if (items.length === 1)
    return items[0]!.state === null
      ? t.remove(items[0]!.title)
      : t.update(items[0]!.title, items[0]!.state);
  return t.batch(items);
};

const storeProposal = async (
  deps: Pick<AgentDeps, 'ports' | 'confirmSecret'>,
  ctx: AgentContext,
  toolName: string,
  input: unknown,
  summary: string,
  locale: ChatLocale
): Promise<PendingAction> => {
  const id = randomUUID();
  const { token, expiresAt } = issueConfirmToken(deps.confirmSecret, {
    tool: toolName,
    input,
    actorId: ctx.actor.id,
    actionId: id,
  });
  await deps.ports.pendingActions.create({
    id,
    actorId: ctx.actor.id,
    tool: toolName,
    input,
    summary,
    locale,
    expiresAt,
  });
  return { id, tool: toolName, input, summary, token, expiresAt };
};
