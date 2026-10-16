import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFakePorts, createFakeState, genre, reader } from '@library/ai/testing';
import { HttpApiError, nlSearch } from '@library/ai';
import type { HttpClient, LlmProvider } from '@library/ai';
import { AiMeta, apiPaths } from '@library/contracts';
import type { ParsedSearch } from '@library/contracts';
import { domain } from '@library/domain-config';
import { z } from 'zod';
import { compareQuery } from '../metrics/filterAccuracy.js';
import { DEFAULT_THROTTLE, retryThrottled } from './throttle.js';
import type { ThrottlePolicy } from './throttle.js';
import type { ExpectedQuery, FieldResult } from '../metrics/filterAccuracy.js';

const Case = z.object({
  id: z.string(),
  text: z.string().min(1),
  expected: z.object({
    q: z.string().nullable().optional(),
    genre: z.array(z.string()).optional(),
    yearFrom: z.number().int().optional(),
    yearTo: z.number().int().optional(),
    sort: z.enum(['newest', 'title', 'rating']).optional(),
  }),
});
const CaseFile = z.object({ language: z.enum(['en', 'fr', 'ar']), cases: z.array(Case).min(1) });

export interface NlCase extends z.infer<typeof Case> {
  language: 'en' | 'fr' | 'ar';
}

export const loadNlCases = (): NlCase[] =>
  (['en', 'fr', 'ar'] as const).flatMap(language => {
    const file = CaseFile.parse(
      JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../../src/cases/nl-search.${language}.json`),
          'utf8'
        )
      )
    );
    return file.cases.map(c => ({ ...c, language }));
  });

export interface NlRow {
  id: string;
  language: string;
  text: string;
  expected: ExpectedQuery;
  actual: ExpectedQuery | null;
  fields: FieldResult;
  costUsd: number;
  latencyMs: number;
  tokensIn: number;
  tokensCachedRead: number;
  tokensCachedWrite: number;
  fallbackUsed: boolean;
  throttleRetries: number;
  error: string | null;
}

const pick = (query: ParsedSearch['query']): ExpectedQuery => ({
  q: query.q ?? null,
  ...(query.genre ? { genre: query.genre } : {}),
  ...(query.yearFrom !== undefined ? { yearFrom: query.yearFrom } : {}),
  ...(query.yearTo !== undefined ? { yearTo: query.yearTo } : {}),
  ...(query.sort ? { sort: query.sort } : {}),
});

const failed = (c: NlCase, error: string, latencyMs: number): NlRow => ({
  id: c.id,
  language: c.language,
  text: c.text,
  expected: c.expected,
  actual: null,
  fields: { q: false, genre: false, yearFrom: false, yearTo: false, sort: false, exact: false },
  costUsd: 0,
  latencyMs,
  tokensIn: 0,
  tokensCachedRead: 0,
  tokensCachedWrite: 0,
  fallbackUsed: false,
  throttleRetries: 0,
  error,
});

const row = (c: NlCase, value: ParsedSearch, meta: AiMeta, latencyMs: number): NlRow => {
  const actual = pick(value.query);
  return {
    id: c.id,
    language: c.language,
    text: c.text,
    expected: c.expected,
    actual,
    fields: compareQuery(c.expected, actual),
    costUsd: meta.costUsd,
    latencyMs,
    tokensIn: meta.tokensIn,
    tokensCachedRead: meta.tokensCachedRead,
    tokensCachedWrite: meta.tokensCachedWrite,
    fallbackUsed: meta.fallbackUsed,
    throttleRetries: 0,
    error: null,
  };
};

export const runNlSearchInProcess = async (
  cases: NlCase[],
  llm: LlmProvider,
  cachePadding: boolean,
  throttle: ThrottlePolicy = DEFAULT_THROTTLE
): Promise<NlRow[]> => {
  const ports = createFakePorts(
    createFakeState({ genres: domain.genres.map((g, i) => genre(i + 1, g.name, g.slug)) })
  );
  const rows: NlRow[] = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      const { value: outcome, retries } = await retryThrottled(
        () =>
          nlSearch(
            { llm, ports, cachePadding },
            { actor: reader, requestId: `eval-${c.id}` },
            { text: c.text }
          ),
        throttle
      );
      rows.push({
        ...row(c, outcome.value, outcome.meta, outcome.meta.latencyMs),
        throttleRetries: retries,
      });
    } catch (error) {
      const { message, retries } = error as Error & { retries?: number };
      rows.push({ ...failed(c, message, Date.now() - started), throttleRetries: retries ?? 0 });
    }
  }
  return rows;
};

export const runNlSearchHttp = async (cases: NlCase[], client: HttpClient): Promise<NlRow[]> => {
  const rows: NlRow[] = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      const envelope = await client.post<ParsedSearch>(apiPaths.ai.parseSearch, { text: c.text });
      const meta = AiMeta.parse((envelope.meta as { ai?: unknown } | undefined)?.ai);
      rows.push(row(c, envelope.data, meta, Date.now() - started));
    } catch (error) {
      rows.push(
        failed(
          c,
          error instanceof HttpApiError
            ? `${error.status} ${error.code}`
            : String((error as Error).message),
          Date.now() - started
        )
      );
    }
  }
  return rows;
};
