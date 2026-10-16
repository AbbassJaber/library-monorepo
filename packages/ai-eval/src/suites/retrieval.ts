import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpApiError, createHttpCatalog } from '@library/ai';
import type { HttpClient } from '@library/ai';
import { AiMeta, apiPaths, Role } from '@library/contracts';
import type { HybridSearchResponse } from '@library/contracts';
import { z } from 'zod';
import { caseScore } from '../metrics/cutoff.js';
import type { CalibrationRow } from '../metrics/cutoff.js';
import { DEFAULT_THROTTLE, retryThrottled } from './throttle.js';
import type { ThrottlePolicy } from './throttle.js';

const RetrievalCase = z.object({
  id: z.string(),
  query: z.string().min(1),
  expected: z.array(z.number().int().positive()),
  kind: z.string(),
});

export type RetrievalCase = z.infer<typeof RetrievalCase>;

export const loadRetrievalCases = (): RetrievalCase[] =>
  z
    .object({
      cases: z
        .array(
          RetrievalCase.refine(c => (c.kind === 'nonsense') === (c.expected.length === 0), {
            message: 'nonsense cases expect nothing; every other case expects a book',
          })
        )
        .min(20),
    })
    .parse(
      JSON.parse(readFileSync(join(import.meta.dirname, '../../src/cases/retrieval.json'), 'utf8'))
    ).cases;

export type RetrievalMode = 'lexical' | 'hybrid' | 'rerank';

export interface RetrievalRow {
  id: string;
  query: string;
  kind: string;
  mode: RetrievalMode;
  expected: number[];
  top: number[];
  recall: number;
  latencyMs: number;
  modelLatencyMs: number;
  costUsd: number;
  reranked: boolean;
  rerankStatus: string;
  rank: number | null;
  throttleRetries: number;
  fallbackUsed: boolean;
  error: string | null;
}

export const K = 5;

const base = (c: RetrievalCase, mode: RetrievalMode): RetrievalRow => ({
  id: c.id,
  query: c.query,
  kind: c.kind,
  mode,
  expected: c.expected,
  top: [],
  recall: 0,
  latencyMs: 0,
  modelLatencyMs: 0,
  costUsd: 0,
  reranked: false,
  rerankStatus: 'off',
  rank: null,
  throttleRetries: 0,
  fallbackUsed: false,
  error: null,
});

const rankOf = (expected: number[], top: number[]): number | null => {
  const index = top.findIndex(id => expected.includes(id));
  return index === -1 ? null : index + 1;
};

const message = (error: unknown) =>
  error instanceof HttpApiError
    ? `${error.status} ${error.code}`
    : String((error as Error).message);

export const runRetrievalHttp = async (
  cases: RetrievalCase[],
  client: HttpClient
): Promise<RetrievalRow[]> => {
  const catalog = createHttpCatalog(client);
  const rows: RetrievalRow[] = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      const hits = await catalog.searchBooks(
        { id: 0, role: Role.enum.READER },
        { q: c.query, limit: K }
      );
      const top = hits.map(hit => hit.id);
      rows.push({
        ...base(c, 'lexical'),
        top,
        recall: caseScore(c.expected, top, K),
        rank: rankOf(c.expected, top),
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      rows.push({ ...base(c, 'lexical'), latencyMs: Date.now() - started, error: message(error) });
    }
  }
  return rows;
};

export const runRetrievalHybridHttp = async (
  cases: RetrievalCase[],
  client: HttpClient,
  rerank: boolean,
  throttle: ThrottlePolicy = DEFAULT_THROTTLE
): Promise<RetrievalRow[]> => {
  const mode: RetrievalMode = rerank ? 'rerank' : 'hybrid';
  const rows: RetrievalRow[] = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      const params = new URLSearchParams({ q: c.query, limit: String(K), rerank: String(rerank) });
      let attemptStarted = started;
      const { value: envelope, retries } = await retryThrottled(async () => {
        attemptStarted = Date.now();
        const answer = await client.get<HybridSearchResponse>(
          `${apiPaths.ai.search}?${params.toString()}`
        );
        if (rerank && rerankStatusOf(answer.meta) === 'unavailable')
          throw new Error('429 rerank unavailable');
        return answer;
      }, throttle);
      const meta = AiMeta.safeParse((envelope.meta as { ai?: unknown } | undefined)?.ai);
      const top = envelope.data.items.map(item => item.book.id);
      rows.push({
        ...base(c, mode),
        top,
        recall: caseScore(c.expected, top, K),
        rank: rankOf(c.expected, top),
        latencyMs: Date.now() - attemptStarted,
        modelLatencyMs: meta.success ? meta.data.latencyMs : 0,
        costUsd: meta.success ? meta.data.costUsd : 0,
        reranked: envelope.data.reranked,
        rerankStatus: rerankStatusOf(envelope.meta),
        throttleRetries: retries,
        fallbackUsed: meta.success ? meta.data.fallbackUsed : false,
      });
    } catch (error) {
      const { retries } = error as { retries?: number };
      rows.push({
        ...base(c, mode),
        latencyMs: Date.now() - started,
        throttleRetries: retries ?? 0,
        error: message(error),
      });
    }
  }
  return rows;
};

const rerankStatusOf = (meta: unknown): string =>
  (meta as { rerank?: string } | undefined)?.rerank ?? 'off';

const CALIBRATION_LIMIT = 20;

export const runRetrievalCalibrationHttp = async (
  cases: RetrievalCase[],
  client: HttpClient
): Promise<CalibrationRow[]> => {
  const rows: CalibrationRow[] = [];
  for (const c of cases) {
    const params = new URLSearchParams({
      q: c.query,
      limit: String(CALIBRATION_LIMIT),
      rerank: 'false',
    });
    const envelope = await client.get<HybridSearchResponse>(
      `${apiPaths.ai.search}?${params.toString()}`
    );
    rows.push({
      id: c.id,
      kind: c.kind,
      expected: c.expected,
      items: envelope.data.items.map(item => ({
        id: item.book.id,
        lexical: item.scores.lexical,
        semantic: item.scores.semantic,
      })),
    });
  }
  return rows;
};
