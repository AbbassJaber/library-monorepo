import {
  FOR_YOUR_SHELVES_MAX,
  RecommendModelOutput,
  BookSort,
  AiFeature,
} from '@library/contracts';
import type {
  AiMeta,
  BookSummary,
  ChatLocale,
  ExplainedRecommendation,
  ReadingListEntry,
} from '@library/contracts';
import { domain } from '@library/domain-config';
import { BUDGETS, TRUNCATION } from '../cost/budgets.js';
import type { Actor, Ports } from '../ports/index.js';
import { composeSystem } from '../prompts/ordering.js';
import type { MockToolHandler } from '../providers/mock/index.js';
import type { GenerateRequest, LlmProvider } from '../providers/types.js';
import { generateValidated } from '../safety/generateValidated.js';
import { clip, dataBlock } from '../safety/untrusted.js';
import { inputJsonSchema } from '../tools/registry.js';
import { runFeature } from './run.js';

export const RECOMMEND_TOOL = 'recommend_books';

export interface RecommendDeps {
  llm: LlmProvider;
  ports: Ports;
  embeddingModel?: string;
}

export type RecommendReason = 'ok' | 'no-history' | 'no-candidates' | 'fallback';

export interface RecommendOutcome {
  value: ExplainedRecommendation[];
  meta: AiMeta | null;
  reason: RecommendReason;
}

const LANGUAGE = { en: 'English', fr: 'French' } as const;

const instructions = (
  locale: ChatLocale
) => `You recommend books from this library's catalog to one reader.

You see three data blocks: "shelf" (the reader's reading list: entryId, title, author, state, genres), "favorites" (their favourite genres, in order) and "candidates" (the books you may recommend).

- Choose up to ${FOR_YOUR_SHELVES_MAX} candidates the reader is most likely to enjoy, best first. Fewer is fine when the others are weak matches.
- For each, write one or two sentences (at most 300 characters) that name the shelf books it follows from and why (same author, theme, period, style or genre). Cite those shelf entries by entryId in citedEntryIds.
- Recommend only books from the candidates block, cite only entryIds from the shelf block. Never invent books, authors or facts.
- Finished and currently-read books say most about taste; a "want to read" entry shows interest.
- Write the explanations in ${LANGUAGE[locale]}; keep book titles as they are.

Answer only by calling ${RECOMMEND_TOOL}.`;

const shelfRow = (entry: ReadingListEntry) => ({
  entryId: entry.id,
  title: entry.book.title,
  author: entry.book.author,
  state: entry.state,
  genres: entry.book.genres.map(g => g.name),
});

const centroid = (vectors: number[][]): number[] | null => {
  if (vectors.length === 0) return null;
  const sum = new Array<number>(vectors[0]!.length).fill(0);
  for (const vector of vectors) for (let i = 0; i < sum.length; i++) sum[i]! += vector[i] ?? 0;
  return sum.map(value => value / vectors.length);
};

export const recommend = async (
  deps: RecommendDeps,
  ctx: { actor: Actor; requestId: string | null },
  input: { locale: ChatLocale }
): Promise<RecommendOutcome> => {
  const budget = BUDGETS.RECOMMEND;
  const maxCandidates = budget.maxCandidates ?? 12;
  const [shelfAll, favorites] = await Promise.all([
    deps.ports.catalog.getShelf(ctx.actor),
    deps.ports.catalog.getFavoriteGenres(ctx.actor),
  ]);
  const shelf = shelfAll
    .filter(entry => entry.available !== false)
    .slice(0, TRUNCATION.shelfEntries);
  if (shelf.length === 0) return { value: [], meta: null, reason: 'no-history' };
  const onShelf = new Set(shelfAll.map(entry => entry.book.id));

  const byGenre =
    favorites.length > 0
      ? await deps.ports.catalog.searchBooks(ctx.actor, {
          genre: favorites.map(f => f.genre.slug).slice(0, 5),
          sort: BookSort.enum.rating,
          limit: 10,
        })
      : [];
  let byMeaning: BookSummary[] = [];
  if (deps.embeddingModel) {
    const vectors = (
      await Promise.all(shelf.map(entry => deps.ports.vectorStore.vectorOf(entry.book.id)))
    ).filter((vector): vector is number[] => vector !== null);
    const point = centroid(vectors);
    if (point) {
      const hits = await deps.ports.vectorStore.knn(point, {
        limit: maxCandidates + shelf.length,
        model: deps.embeddingModel,
      });
      byMeaning = await deps.ports.catalog.booksByIds(
        ctx.actor,
        hits.map(hit => hit.bookId)
      );
    }
  }
  const candidates: BookSummary[] = [];
  for (
    let i = 0;
    candidates.length < maxCandidates && (i < byGenre.length || i < byMeaning.length);
    i++
  )
    for (const book of [byGenre[i], byMeaning[i]])
      if (
        book &&
        !onShelf.has(book.id) &&
        !candidates.some(c => c.id === book.id) &&
        candidates.length < maxCandidates
      )
        candidates.push(book);
  if (candidates.length === 0) return { value: [], meta: null, reason: 'no-candidates' };

  const details = await Promise.all(
    candidates.map(book => deps.ports.catalog.getBook(ctx.actor, book.id))
  );
  const candidateRows = candidates.map((book, i) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    year: book.publishedYear,
    genres: book.genres.map(g => g.name),
    synopsis: clip(details[i]?.synopsis ?? '', 300),
  }));

  let reason: RecommendReason = 'ok';
  const outcome = await runFeature(
    {
      feature: AiFeature.enum.RECOMMEND,
      llm: deps.llm,
      trace: deps.ports.trace,
      actor: ctx.actor,
      requestId: ctx.requestId,
    },
    async signal => {
      const result = await generateValidated(
        deps.llm,
        {
          tier: budget.tier,
          system: composeSystem({
            instructions: instructions(input.locale),
            vocabulary: domain.prompts.vocabulary,
            dataBlocks: [
              dataBlock('shelf', shelf.map(shelfRow)),
              dataBlock(
                'favorites',
                favorites.map(f => f.genre.name)
              ),
              dataBlock('candidates', candidateRows),
            ],
          }),
          messages: [{ role: 'user', content: 'Recommend books for this reader.' }],
          maxOutputTokens: budget.maxOutputTokens,
          signal,
        },
        {
          name: RECOMMEND_TOOL,
          description: 'Recommendations for the reader.',
          schema: RecommendModelOutput,
        },
        inputJsonSchema
      );
      if (!result.ok) {
        reason = 'fallback';
        return {
          value: [] as ExplainedRecommendation[],
          attempts: result.attempts,
          fallbackUsed: true,
        };
      }
      const byId = new Map(candidates.map(book => [book.id, book]));
      const entries = new Map(shelf.map(entry => [entry.id, entry]));
      const picked: ExplainedRecommendation[] = [];
      for (const rec of result.value.recommendations) {
        const book = byId.get(rec.bookId);
        const cited = [...new Set(rec.citedEntryIds)].filter(id => entries.has(id));
        if (!book || cited.length === 0 || picked.some(p => p.book.id === book.id)) continue;
        picked.push({
          book,
          explanation: rec.explanation,
          citedEntryIds: cited,
          citedBooks: cited.map(id => ({
            bookId: entries.get(id)!.book.id,
            title: entries.get(id)!.book.title,
          })),
        });
      }
      return {
        value: picked.slice(0, FOR_YOUR_SHELVES_MAX),
        attempts: result.attempts,
        fallbackUsed: false,
      };
    }
  );
  return { value: outcome.value, meta: outcome.meta, reason };
};

const block = <T>(request: GenerateRequest, name: string): T | null => {
  const text = request.system.map(b => b.text).join('\n');
  const start = text.indexOf(`<data name="${name}">`);
  if (start < 0) return null;
  const from = text.indexOf('\n', start) + 1;
  try {
    return JSON.parse(text.slice(from, text.indexOf('\n</data>', from))) as T;
  } catch {
    return null;
  }
};

export const recommendMockHandler: MockToolHandler = request => {
  const fr = request.system.some(b => b.text.includes('in French'));
  const shelf = block<Array<ReturnType<typeof shelfRow>>>(request, 'shelf') ?? [];
  const candidates = block<Array<{ id: number; genres: string[] }>>(request, 'candidates') ?? [];
  const recommendations = [];
  for (const candidate of candidates) {
    for (const genre of candidate.genres) {
      const entry = shelf.find(row => row.genres.includes(genre));
      if (!entry) continue;
      recommendations.push({
        bookId: candidate.id,
        explanation: fr
          ? `${genre}, comme ${entry.title} dans votre liste.`
          : `${genre}, like ${entry.title} on your list.`,
        citedEntryIds: [entry.entryId],
      });
      break;
    }
    if (recommendations.length === FOR_YOUR_SHELVES_MAX) break;
  }
  return { recommendations };
};
