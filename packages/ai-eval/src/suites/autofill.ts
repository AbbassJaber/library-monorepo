import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autofill } from '@library/ai';
import type { LlmProvider, LookupPort } from '@library/ai';
import { createFakePorts, createFakeState, genre, librarian } from '@library/ai/testing';
import type { BookDraft, FieldSource } from '@library/contracts';
import { domain } from '@library/domain-config';
import type { ExternalRecord } from '@library/domain-config';
import type { LookupFixtureEntry } from '@library/domain-config/seed';
import { z } from 'zod';
import { compareDraft } from '../metrics/draftAccuracy.js';
import type { DraftResult, ExpectedDraft } from '../metrics/draftAccuracy.js';
import { DEFAULT_THROTTLE, isThrottle, retryThrottled } from './throttle.js';
import type { ThrottlePolicy } from './throttle.js';

const Case = z.object({
  id: z.string(),
  language: z.enum(['en', 'fr', 'ar']),
  note: z.string().optional(),
  input: z.object({
    isbn: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
  }),
  expected: z.object({
    title: z.array(z.string()).nullable(),
    author: z.array(z.string()).nullable(),
    year: z.array(z.number().int()).nullable(),
    genres: z.array(z.string()),
    acceptableGenres: z.array(z.string()).optional(),
    synopsis: z.boolean(),
  }),
});
export type AutofillCase = z.infer<typeof Case>;

export const loadAutofillCases = (): AutofillCase[] =>
  z
    .object({ cases: z.array(Case).min(20) })
    .parse(
      JSON.parse(readFileSync(join(import.meta.dirname, '../../src/cases/autofill.json'), 'utf8'))
    ).cases;

const queryKey = (query: LookupFixtureEntry['query']) =>
  'isbn' in query ? `isbn:${query.isbn}` : `title:${query.title}|${query.author ?? ''}`;

export const createReplayLookup = (entries: LookupFixtureEntry[]): LookupPort => {
  const byKey = new Map(entries.map(entry => [queryKey(entry.query), entry.record]));
  return {
    byIsbn: async isbn => byKey.get(queryKey({ isbn })) ?? null,
    byTitle: async (title, author) => {
      const record = byKey.get(queryKey({ title, author: author ?? null }));
      return record ? [record] : [];
    },
  };
};

export const createRecordingLookup = (
  inner: LookupPort,
  into: LookupFixtureEntry[]
): LookupPort => {
  const seen = new Map<string, ExternalRecord | null>();
  const remember = (query: LookupFixtureEntry['query'], record: ExternalRecord | null) => {
    const key = queryKey(query);
    if (!seen.has(key)) {
      seen.set(key, record);
      into.push({ query, record });
    }
    return record;
  };
  return {
    byIsbn: async isbn => {
      const key = queryKey({ isbn });
      if (seen.has(key)) return seen.get(key) ?? null;
      return remember({ isbn }, await inner.byIsbn(isbn));
    },
    byTitle: async (title, author) => {
      const query = { title, author: author ?? null };
      const key = queryKey(query);
      if (seen.has(key)) {
        const record = seen.get(key);
        return record ? [record] : [];
      }
      const [first] = await inner.byTitle(title, author);
      const record = remember(query, first ?? null);
      return record ? [record] : [];
    },
  };
};

export const createLiveLookup = (timeoutMs = 5000): LookupPort => {
  const deps = () => ({ fetch, signal: AbortSignal.timeout(timeoutMs) });
  return {
    byIsbn: isbn => domain.lookup.byIsbn(isbn, deps()),
    byTitle: (title, author) => domain.lookup.byTitle(title, author, deps()),
  };
};

type Sources = Record<'title' | 'author' | 'year' | 'synopsis' | 'genres', FieldSource>;

export interface AutofillRow {
  id: string;
  language: string;
  input: AutofillCase['input'];
  expected: ExpectedDraft;
  draft: BookDraft | null;
  fields: DraftResult;
  sources: Sources | null;
  lookupHit: boolean;
  modelCalled: boolean;
  fallbackUsed: boolean;
  aiUnavailable: boolean;
  costUsd: number;
  latencyMs: number;
  totalMs: number;
  tokensIn: number;
  tokensOut: number;
  tokensCachedRead: number;
  tokensCachedWrite: number;
  throttleRetries: number;
  error: string | null;
}

const NO_FIELDS: DraftResult = {
  title: false,
  author: false,
  year: false,
  genres: false,
  synopsis: false,
  exact: false,
  genresLenient: false,
  exactLenient: false,
};

export const runAutofillInProcess = async (
  cases: AutofillCase[],
  llm: LlmProvider,
  lookup: LookupPort,
  throttle: ThrottlePolicy = DEFAULT_THROTTLE
): Promise<AutofillRow[]> => {
  const genres = domain.genres.map((g, i) => genre(i + 1, g.name, g.slug));
  const slugById = new Map(genres.map(g => [g.id, g.slug]));
  const ports = { ...createFakePorts(createFakeState({ genres })), lookup };
  const rows: AutofillRow[] = [];
  for (const c of cases) {
    const started = Date.now();
    const input = Object.fromEntries(
      Object.entries(c.input).filter(([, value]) => value !== undefined)
    ) as { isbn?: string; title?: string; author?: string };
    let attemptStarted = started;
    try {
      const { value: outcome, retries } = await retryThrottled(async () => {
        attemptStarted = Date.now();
        const result = await autofill(
          { llm, ports },
          { actor: librarian, requestId: `eval-${c.id}` },
          input
        );
        if (result.aiUnavailable && isThrottle(result.unavailableReason ?? ''))
          throw new Error(result.unavailableReason ?? '429');
        return result;
      }, throttle);
      const draft = outcome.value;
      rows.push({
        id: c.id,
        language: c.language,
        input: c.input,
        expected: c.expected,
        draft,
        fields: compareDraft(c.expected, draft, slugById),
        sources: {
          title: draft.title.source,
          author: draft.author.source,
          year: draft.publishedYear.source,
          synopsis: draft.synopsis.source,
          genres: draft.genreIds.source,
        },
        lookupHit: outcome.lookupHit,
        modelCalled: outcome.meta !== null || outcome.aiUnavailable,
        fallbackUsed: outcome.meta?.fallbackUsed ?? false,
        aiUnavailable: outcome.aiUnavailable,
        costUsd: outcome.meta?.costUsd ?? 0,
        latencyMs: outcome.meta?.latencyMs ?? 0,
        totalMs: Date.now() - attemptStarted,
        tokensIn: outcome.meta?.tokensIn ?? 0,
        tokensOut: outcome.meta?.tokensOut ?? 0,
        tokensCachedRead: outcome.meta?.tokensCachedRead ?? 0,
        tokensCachedWrite: outcome.meta?.tokensCachedWrite ?? 0,
        throttleRetries: retries,
        error: outcome.aiUnavailable ? `AI_UNAVAILABLE: ${outcome.unavailableReason}` : null,
      });
    } catch (error) {
      const { message, retries } = error as Error & { retries?: number };
      rows.push({
        id: c.id,
        language: c.language,
        input: c.input,
        expected: c.expected,
        draft: null,
        fields: NO_FIELDS,
        sources: null,
        lookupHit: false,
        modelCalled: true,
        fallbackUsed: false,
        aiUnavailable: true,
        costUsd: 0,
        latencyMs: 0,
        totalMs: Date.now() - started,
        tokensIn: 0,
        tokensOut: 0,
        tokensCachedRead: 0,
        tokensCachedWrite: 0,
        throttleRetries: retries ?? 0,
        error: message,
      });
    }
  }
  return rows;
};
