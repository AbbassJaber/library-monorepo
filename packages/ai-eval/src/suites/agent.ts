import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentTurn,
  catalogTools,
  costUsd,
  createToolRegistry,
  hybridSearch,
  syncEmbeddings,
} from '@library/ai';
import type { EmbeddingProvider, LlmProvider, ToolRegistry } from '@library/ai';
import {
  book,
  createFakePorts,
  createFakeState,
  genre,
  librarian,
  reader,
} from '@library/ai/testing';
import { ReadingState } from '@library/contracts';
import type { ChatResponse } from '@library/contracts';
import { lookupFixtureRecords, seedBooks, seedGenres } from '@library/domain-config/seed';
import { z } from 'zod';
import { judgeAnswer } from '../metrics/judge.js';
import type { JudgeVerdict } from '../metrics/judge.js';
import { DEFAULT_THROTTLE, retryThrottled } from './throttle.js';
import type { ThrottlePolicy } from './throttle.js';

const Case = z.object({
  id: z.string(),
  set: z.enum(['tuned', 'holdout']).default('tuned'),
  language: z.enum(['en', 'fr']),
  actor: z.enum(['reader', 'librarian']),
  text: z.string().min(1).max(4000),
  shelf: z.array(z.number().int()).optional(),
  expect: z.object({
    tools: z.array(z.string()).optional(),
    notTools: z.array(z.string()).optional(),
    pending: z
      .object({
        tool: z.string(),
        input: z.record(z.string(), z.unknown()).optional(),
        changes: z
          .object({
            action: z.enum(['remove', 'setState']),
            state: ReadingState.optional(),
            bookIds: z.array(z.number().int()).min(1),
          })
          .optional(),
      })
      .optional(),
    noPending: z.boolean().optional(),
    cite: z.array(z.number().int()).optional(),
  }),
});
export type AgentCase = z.input<typeof Case>;

export type AgentCaseSet = 'tuned' | 'holdout' | 'all';

const FILES = { tuned: 'agent.json', holdout: 'agent.holdout.json' } as const;

const loadFile = (set: 'tuned' | 'holdout'): AgentCase[] =>
  z
    .object({ cases: z.array(Case).min(set === 'tuned' ? 15 : 8) })
    .parse(
      JSON.parse(readFileSync(join(import.meta.dirname, `../../src/cases/${FILES[set]}`), 'utf8'))
    )
    .cases.map(c => ({ ...c, set }));

export const loadAgentCases = (set: AgentCaseSet = 'tuned'): AgentCase[] =>
  set === 'all' ? [...loadFile('tuned'), ...loadFile('holdout')] : loadFile(set);

export interface AgentChecks {
  tools: boolean;
  pending: boolean;
  noMutation: boolean;
  cited: boolean;
}

export interface AgentRow {
  id: string;
  set: 'tuned' | 'holdout';
  language: string;
  actor: string;
  checks: AgentChecks;
  judge: JudgeVerdict | null;
  judgeIssues: string[];
  answer: string;
  citations: number[];
  toolCalls: string[];
  pending: { tool: string; input: unknown } | null;
  costUsd: number;
  judgeCostUsd: number;
  latencyMs: number;
  wallMs: number;
  throttleRetries: number;
  error: string | null;
}

export interface AgentRunOptions {
  tier?: 'small' | 'strong';
  embeddings?: EmbeddingProvider;
  minSimilarity?: number;
  maxUsd?: number;
  perCaseWorstUsd?: number;
}

export const seedState = () => {
  const genres = seedGenres.map((entry, i) => genre(i + 1, entry.name, entry.slug));
  const bySlug = new Map(genres.map(g => [g.slug, g]));
  const books = seedBooks.map((entry, i) =>
    book(i + 1, {
      title: entry.title,
      author: entry.author,
      publishedYear: entry.year,
      synopsis: entry.synopsis,
      isbn: entry.isbn ?? null,
      rating: entry.rating,
      genres: entry.genres
        .map(slug => bySlug.get(slug))
        .filter(g => g !== undefined)
        .map(g => ({ id: g.id, name: g.name, slug: g.slug })),
    })
  );
  return createFakeState({ books, genres, lookup: lookupFixtureRecords() });
};

const recording = (
  registry: ToolRegistry,
  evidence: Array<{ tool: string; input: unknown; ok: boolean; output: unknown }>
): ToolRegistry => ({
  ...registry,
  async call(ctx, name, input) {
    try {
      const output = await registry.call(ctx, name, input);
      evidence.push({ tool: name, input, ok: true, output });
      return output;
    } catch (error) {
      evidence.push({ tool: name, input, ok: false, output: String((error as Error).message) });
      throw error;
    }
  },
});

const sameChanges = (
  expected: NonNullable<NonNullable<AgentCase['expect']['pending']>['changes']>,
  actual: unknown
): boolean => {
  const changes = (actual as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) return false;
  const rows = changes as Array<{ action?: unknown; bookId?: unknown; state?: unknown }>;
  const ids = rows.map(change => change.bookId);
  return (
    rows.every(
      change =>
        change.action === expected.action &&
        (expected.state === undefined || change.state === expected.state)
    ) &&
    ids.length === expected.bookIds.length &&
    expected.bookIds.every(id => ids.includes(id))
  );
};

const subset = (expected: Record<string, unknown>, actual: unknown): boolean =>
  typeof actual === 'object' &&
  actual !== null &&
  Object.entries(expected).every(
    ([key, value]) => (actual as Record<string, unknown>)[key] === value
  );

export const scoreChecks = (
  c: AgentCase,
  value: ChatResponse,
  shelfUnchanged: boolean
): AgentChecks => {
  const calls = value.message.toolCalls ?? [];
  const succeeded = new Set(calls.filter(call => call.ok).map(call => call.name));
  const tools =
    (c.expect.tools === undefined ||
      (c.expect.tools.length === 0
        ? calls.length === 0
        : c.expect.tools.every(tool => succeeded.has(tool)))) &&
    (c.expect.notTools ?? []).every(tool => !succeeded.has(tool));
  const action = value.pendingAction;
  const pending = c.expect.pending
    ? action !== undefined &&
      action.tool === c.expect.pending.tool &&
      subset(c.expect.pending.input ?? {}, action.input) &&
      (c.expect.pending.changes === undefined ||
        sameChanges(c.expect.pending.changes, action.input))
    : c.expect.noPending
      ? action === undefined
      : true;
  const cited = c.expect.cite
    ? (value.message.citations ?? []).some(citation => c.expect.cite!.includes(citation.bookId))
    : true;
  return { tools, pending, noMutation: shelfUnchanged, cited };
};

export const runAgentInProcess = async (
  cases: AgentCase[],
  llm: LlmProvider,
  judge: LlmProvider | null,
  throttle: ThrottlePolicy = DEFAULT_THROTTLE,
  options: AgentRunOptions = {}
): Promise<AgentRow[]> => {
  const rows: AgentRow[] = [];
  let spent = 0;
  const embedded = seedState();
  if (options.embeddings) {
    const fake = createFakePorts(embedded);
    await syncEmbeddings(
      await fake.catalog.listBooksForEmbedding(),
      options.embeddings,
      fake.vectorStore
    );
  }
  for (const c of cases) {
    const base: Omit<AgentRow, 'checks' | 'judge'> = {
      judgeIssues: [],
      id: c.id,
      set: c.set ?? 'tuned',
      language: c.language,
      actor: c.actor,
      answer: '',
      citations: [],
      toolCalls: [],
      pending: null,
      costUsd: 0,
      judgeCostUsd: 0,
      latencyMs: 0,
      wallMs: 0,
      throttleRetries: 0,
      error: null,
    };
    const failed: AgentChecks = { tools: false, pending: false, noMutation: true, cited: false };
    if (options.maxUsd !== undefined && spent + (options.perCaseWorstUsd ?? 0) > options.maxUsd) {
      rows.push({ ...base, checks: failed, judge: null, error: 'skipped: spending cap reached' });
      continue;
    }
    const state = seedState();
    state.vectors = new Map(embedded.vectors);
    const ports = createFakePorts(state);
    const actor = c.actor === 'librarian' ? librarian : reader;
    for (const bookId of c.shelf ?? [])
      await ports.catalog.addToReadingList(actor, {
        bookId,
        state: ReadingState.enum.WANT_TO_READ,
      });
    const shelfBefore = JSON.stringify(state.shelf.get(actor.id) ?? []);
    const evidence: Array<{ tool: string; input: unknown; ok: boolean; output: unknown }> = [];
    const registry = recording(createToolRegistry(catalogTools), evidence);
    const embeddings = options.embeddings;
    const started = Date.now();
    try {
      const { value: outcome, retries } = await retryThrottled(() => {
        evidence.length = 0;
        return agentTurn(
          {
            llm,
            ports,
            registry,
            confirmSecret: 'eval-confirm-secret-eval-confirm-secret',
            ...(options.tier ? { tier: options.tier } : {}),
            ...(embeddings
              ? {
                  search: async (who, input) =>
                    (
                      await hybridSearch(
                        { llm, embeddings, ports, minSimilarity: options.minSimilarity ?? 0 },
                        { actor: who, requestId: null },
                        { q: input.q ?? '', limit: input.limit, rerank: false }
                      )
                    ).value.items.map(item => item.book),
                }
              : {}),
          },
          { actor, requestId: `eval-${c.id}` },
          { messages: [{ role: 'user', content: c.text }], locale: c.language }
        );
      }, throttle);
      const value = outcome.value;
      const shelfUnchanged = JSON.stringify(state.shelf.get(actor.id) ?? []) === shelfBefore;
      const checks = scoreChecks(c, value, shelfUnchanged);
      let verdict: JudgeVerdict | null = null;
      let judgeIssues: string[] = [];
      let judgeCostUsd = 0;
      if (judge) {
        const { value: judged } = await retryThrottled(
          () =>
            judgeAnswer(judge, {
              question: c.text,
              answer: value.message.content,
              citations: value.message.citations ?? [],
              evidence,
              pendingAction: value.pendingAction
                ? { tool: value.pendingAction.tool, summary: value.pendingAction.summary }
                : null,
              actor: c.actor,
            }),
          throttle
        );
        verdict = judged.verdict;
        judgeIssues = judged.issues;
        judgeCostUsd = judged.attempts.reduce(
          (sum, attempt) => sum + costUsd(attempt.model, attempt.usage),
          0
        );
      }
      spent += outcome.meta.costUsd + judgeCostUsd;
      rows.push({
        ...base,
        checks,
        judge: verdict,
        judgeIssues,
        answer: value.message.content,
        citations: (value.message.citations ?? []).map(citation => citation.bookId),
        toolCalls: (value.message.toolCalls ?? []).map(
          call => `${call.name}${call.ok ? '' : ' (refused)'}`
        ),
        pending: value.pendingAction
          ? { tool: value.pendingAction.tool, input: value.pendingAction.input }
          : null,
        costUsd: outcome.meta.costUsd,
        judgeCostUsd,
        latencyMs: outcome.meta.latencyMs,
        wallMs: Date.now() - started,
        throttleRetries: retries,
      });
    } catch (error) {
      rows.push({
        ...base,
        checks: failed,
        judge: null,
        wallMs: Date.now() - started,
        throttleRetries: (error as { retries?: number }).retries ?? 0,
        error: String((error as Error).message).slice(0, 300),
      });
    }
  }
  return rows;
};
