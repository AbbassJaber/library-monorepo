import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECOMMEND_TOOL, recommend, syncEmbeddings } from '@library/ai';
import type { EmbeddingProvider, GenerateResult, LlmProvider } from '@library/ai';
import { createFakePorts, reader } from '@library/ai/testing';
import { ReadingState, ChatLocale } from '@library/contracts';
import { z } from 'zod';
import { seedState } from './agent.js';
import { DEFAULT_THROTTLE, retryThrottled } from './throttle.js';
import type { ThrottlePolicy } from './throttle.js';

const Case = z.object({
  id: z.string(),
  language: z.enum(['en', 'fr']),
  shelf: z.array(z.object({ bookId: z.number().int(), state: ReadingState })).min(1),
  favorites: z.array(z.string()),
  expectAny: z.array(z.number().int()).optional(),
});
export type RecommendCase = z.infer<typeof Case>;

export const loadRecommendCases = (): RecommendCase[] =>
  z
    .object({ cases: z.array(Case).min(10) })
    .parse(
      JSON.parse(readFileSync(join(import.meta.dirname, '../../src/cases/recommend.json'), 'utf8'))
    ).cases;

export interface RecommendRow {
  id: string;
  language: string;
  reason: string;
  recommended: number[];
  rawDropped: number;
  rawCount: number;
  violations: number;
  expectedHit: boolean | null;
  relevance: number;
  mentionsCited: number;
  languageOk: boolean;
  explanations: string[];
  costUsd: number;
  latencyMs: number;
  fallbackUsed: boolean;
  throttleRetries: number;
  error: string | null;
}

const FRENCH = /\b(le|la|les|de|des|du|et|un|une|vous|votre|qui|dans|comme)\b/i;
const ENGLISH = /\b(the|and|you|your|with|like|which|this)\b/i;

const recording = (llm: LlmProvider, raw: unknown[]): LlmProvider => ({
  ...llm,
  get tiers() {
    return llm.tiers;
  },
  async generate(request) {
    const result: GenerateResult = await llm.generate(request);
    for (const call of result.toolCalls) if (call.name === RECOMMEND_TOOL) raw.push(call.input);
    return result;
  },
});

export const runRecommendInProcess = async (
  cases: RecommendCase[],
  llm: LlmProvider,
  options: { embeddings?: EmbeddingProvider; throttle?: ThrottlePolicy } = {}
): Promise<RecommendRow[]> => {
  const embedded = seedState();
  if (options.embeddings) {
    const fake = createFakePorts(embedded);
    await syncEmbeddings(
      await fake.catalog.listBooksForEmbedding(),
      options.embeddings,
      fake.vectorStore
    );
  }
  const rows: RecommendRow[] = [];
  for (const c of cases) {
    const state = seedState();
    state.vectors = new Map(embedded.vectors);
    const ports = createFakePorts(state);
    for (const entry of c.shelf) await ports.catalog.addToReadingList(reader, entry);
    state.favorites.set(
      reader.id,
      c.favorites.map((slug, position) => {
        const genre = state.genres.find(g => g.slug === slug)!;
        return { genre: { id: genre.id, name: genre.name, slug: genre.slug }, position };
      })
    );
    const raw: unknown[] = [];
    const started = Date.now();
    try {
      const { value: outcome, retries } = await retryThrottled(() => {
        raw.length = 0;
        return recommend(
          {
            llm: recording(llm, raw),
            ports,
            ...(options.embeddings ? { embeddingModel: options.embeddings.model } : {}),
          },
          { actor: reader, requestId: `eval-${c.id}` },
          { locale: c.language }
        );
      }, options.throttle ?? DEFAULT_THROTTLE);
      const shelf = state.shelf.get(reader.id) ?? [];
      const shelfIds = new Set(shelf.map(entry => entry.book.id));
      const entryIds = new Set(shelf.map(entry => entry.id));
      const genresOf = (bookId: number) =>
        state.books.find(b => b.id === bookId)?.genres.map(g => g.slug) ?? [];
      const affinity = new Set([
        ...c.favorites,
        ...shelf.flatMap(entry => genresOf(entry.book.id)),
      ]);
      const last = raw.at(-1) as
        { recommendations?: Array<{ bookId: number; citedEntryIds: number[] }> } | undefined;
      const rawRecs = Array.isArray(last?.recommendations) ? last.recommendations : [];
      const finalIds = outcome.value.map(rec => rec.book.id);
      const violations = outcome.value.filter(
        rec => shelfIds.has(rec.book.id) || rec.citedEntryIds.some(id => !entryIds.has(id))
      ).length;
      const share = (pred: (index: number) => boolean) =>
        outcome.value.length === 0
          ? 0
          : outcome.value.filter((_, i) => pred(i)).length / outcome.value.length;
      const explanations = outcome.value.map(rec => rec.explanation);
      rows.push({
        id: c.id,
        language: c.language,
        reason: outcome.reason,
        recommended: finalIds,
        rawCount: rawRecs.length,
        rawDropped: rawRecs.length - outcome.value.length,
        violations,
        expectedHit: c.expectAny ? finalIds.some(id => c.expectAny!.includes(id)) : null,
        relevance: share(i => genresOf(finalIds[i]!).some(slug => affinity.has(slug))),
        mentionsCited: share(i =>
          outcome.value[i]!.citedBooks.some(book =>
            explanations[i]!.toLowerCase().includes(book.title.toLowerCase())
          )
        ),
        languageOk:
          explanations.length > 0 &&
          explanations.every(text =>
            c.language === ChatLocale.enum.fr ? FRENCH.test(text) : ENGLISH.test(text)
          ),
        explanations,
        costUsd: outcome.meta?.costUsd ?? 0,
        latencyMs: outcome.meta?.latencyMs ?? Date.now() - started,
        fallbackUsed: outcome.meta?.fallbackUsed ?? false,
        throttleRetries: retries,
        error: null,
      });
    } catch (error) {
      rows.push({
        id: c.id,
        language: c.language,
        reason: 'error',
        recommended: [],
        rawCount: 0,
        rawDropped: 0,
        violations: 0,
        expectedHit: c.expectAny ? false : null,
        relevance: 0,
        mentionsCited: 0,
        languageOk: false,
        explanations: [],
        costUsd: 0,
        latencyMs: Date.now() - started,
        fallbackUsed: false,
        throttleRetries: (error as { retries?: number }).retries ?? 0,
        error: String((error as Error).message).slice(0, 300),
      });
    }
  }
  return rows;
};
