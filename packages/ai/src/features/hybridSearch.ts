import {
  RERANK_CANDIDATES_MAX,
  RerankModelOutput,
  MatchReason,
  AiFeature,
} from '@library/contracts';
import type {
  AiMeta,
  BookSummary,
  HybridSearchQuery,
  HybridSearchResponse,
  ScoredBook,
} from '@library/contracts';
import { domain } from '@library/domain-config';
import { BUDGETS, TRUNCATION } from '../cost/budgets.js';
import type { Actor, Ports } from '../ports/index.js';
import { composeSystem } from '../prompts/ordering.js';
import { lastUserText } from '../providers/mock/index.js';
import type { MockToolHandler } from '../providers/mock/index.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { EmbeddingProvider, GenerateResult, LlmProvider } from '../providers/types.js';
import { isPermutationSubset } from '../safety/allowlist.js';
import { generateValidated } from '../safety/generateValidated.js';
import { clip, dataBlock } from '../safety/untrusted.js';
import { inputJsonSchema } from '../tools/registry.js';
import { runFeature } from './run.js';

export const RERANK_TOOL = 'rerank_books';
export const RRF_K = 60;
export const LEG_DEPTH = 20;

export const reciprocalRankFusion = (
  lists: number[][],
  k = RRF_K
): Array<{ id: number; score: number; bestRank: number }> => {
  const fused = new Map<number, { score: number; bestRank: number }>();
  for (const list of lists)
    list.forEach((id, index) => {
      const rank = index + 1;
      const entry = fused.get(id) ?? { score: 0, bestRank: Number.POSITIVE_INFINITY };
      fused.set(id, {
        score: entry.score + 1 / (k + rank),
        bestRank: Math.min(entry.bestRank, rank),
      });
    });
  return [...fused.entries()]
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank || a.id - b.id);
};

const INSTRUCTIONS = `You rank catalog books for a reader's search. The candidates are given as data.
Answer only by calling the ${RERANK_TOOL} tool, once, with "order": the ids of the candidates that match the search, best match first.
Rules:
- Use only ids from the candidates block, each at most once.
- Judge by title, author, year, genres and synopsis. A search may describe the plot, setting, theme or a translated title instead of naming the book.
- Leave out candidates that clearly do not match.`;

export const DEFAULT_MIN_SIMILARITY: Record<string, number> = {
  'cohere.embed-multilingual-v3': 0.44,
  'eu.cohere.embed-v4:0': 0.3,
  'amazon.titan-embed-text-v2:0': 0,
  'mock-embedding': 0.33,
};

export const minSimilarityFor = (model: string, override?: number): number =>
  override ?? DEFAULT_MIN_SIMILARITY[model] ?? 0;

export interface HybridSearchDeps {
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
  ports: Ports;
  minSimilarity?: number;
}

export type RerankStatus = 'off' | 'applied' | 'invalid' | 'unavailable';

export interface HybridSearchOutcome {
  value: HybridSearchResponse;
  meta: AiMeta | null;
  rerank: RerankStatus;
}

const embeddingAttempt = (
  embeddings: EmbeddingProvider,
  tokens: number,
  latencyMs: number
): GenerateResult => ({
  provider: embeddings.name,
  model: embeddings.model,
  text: '',
  toolCalls: [],
  stopReason: 'other',
  usage: { tokensIn: tokens, tokensOut: 0, tokensCachedRead: 0, tokensCachedWrite: 0 },
  latencyMs,
  forcedToolChoiceFallback: false,
});

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
const MATCH_WORD_MIN = 3;

export const matchReasons = (
  q: string,
  book: Pick<BookSummary, 'title' | 'author'>,
  legs: { keyword: boolean; meaning: boolean }
): MatchReason[] => {
  const reasons: MatchReason[] = [];
  if (legs.keyword) {
    const words = fold(q)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length >= MATCH_WORD_MIN);
    const inTitle = words.some(word => fold(book.title).includes(word));
    const inAuthor = words.some(word => fold(book.author).includes(word));
    if (inTitle) reasons.push(MatchReason.enum.title);
    if (inAuthor) reasons.push(MatchReason.enum.author);
    if (!inTitle && !inAuthor) reasons.push(MatchReason.enum.spelling);
  }
  if (legs.meaning) reasons.push(MatchReason.enum.meaning);
  return reasons;
};

export const hybridSearch = async (
  deps: HybridSearchDeps,
  ctx: { actor: Actor; requestId: string | null },
  input: Pick<HybridSearchQuery, 'q' | 'limit' | 'genre'> & { rerank: boolean }
): Promise<HybridSearchOutcome> => {
  const lexical = await deps.ports.catalog.searchBooks(ctx.actor, {
    q: input.q,
    limit: LEG_DEPTH,
    ...(input.genre ? { genre: [input.genre] } : {}),
  });
  const outcome = await runFeature(
    {
      feature: AiFeature.enum.HYBRID_SEARCH,
      llm: deps.llm,
      trace: deps.ports.trace,
      actor: ctx.actor,
      requestId: ctx.requestId,
    },
    async signal => {
      const attempts: GenerateResult[] = [];
      let fallbackUsed = false;
      let semantic: Array<{ bookId: number; score: number }> = [];
      const started = Date.now();
      try {
        const { vectors, tokens } = await deps.embeddings.embed([input.q], signal, {
          purpose: 'query',
        });
        attempts.push(embeddingAttempt(deps.embeddings, tokens, Date.now() - started));
        const floor = minSimilarityFor(deps.embeddings.model, deps.minSimilarity);
        semantic = (
          await deps.ports.vectorStore.knn(vectors[0]!, {
            limit: LEG_DEPTH,
            model: deps.embeddings.model,
            ...(input.genre ? { genreSlug: input.genre } : {}),
          })
        ).filter(hit => hit.score >= floor);
      } catch (error) {
        if (!(error instanceof ProviderUnavailableError)) throw error;
        fallbackUsed = true;
      }
      const fused = reciprocalRankFusion([lexical.map(b => b.id), semantic.map(h => h.bookId)]);
      const known = new Map<number, BookSummary>(lexical.map(b => [b.id, b]));
      const missing = fused.map(f => f.id).filter(id => !known.has(id));
      for (const summary of await deps.ports.catalog.booksByIds(ctx.actor, missing))
        known.set(summary.id, summary);
      const lexicalRank = new Map(lexical.map((b, index) => [b.id, index + 1]));
      const cosine = new Map(semantic.map(h => [h.bookId, h.score]));
      const semanticRank = new Map(semantic.map((h, index) => [h.bookId, index + 1]));
      let ordered = fused.filter(f => known.has(f.id));
      const fusedRank = new Map(ordered.map((f, index) => [f.id, index + 1]));
      let reranked = false;
      let rerank: RerankStatus = 'off';

      if (input.rerank && ordered.length > 1) {
        const candidates = ordered.slice(0, RERANK_CANDIDATES_MAX);
        const ids = candidates.map(c => c.id);
        const details = await Promise.all(ids.map(id => deps.ports.catalog.getBook(ctx.actor, id)));
        const shown = candidates.map((c, i) => {
          const book = known.get(c.id)!;
          return {
            id: c.id,
            title: book.title,
            author: book.author,
            year: book.publishedYear,
            genres: book.genres.map(x => x.name),
            synopsis: clip(details[i]?.synopsis ?? '', TRUNCATION.synopsisChars / 2),
          };
        });
        try {
          const result = await generateValidated(
            deps.llm,
            {
              tier: BUDGETS.RERANK.tier,
              system: composeSystem({
                instructions: INSTRUCTIONS,
                vocabulary: domain.prompts.vocabulary,
                dataBlocks: [dataBlock('candidates', shown)],
              }),
              messages: [{ role: 'user', content: `Search: ${input.q}` }],
              maxOutputTokens: BUDGETS.RERANK.maxOutputTokens,
              signal,
            },
            {
              name: RERANK_TOOL,
              description: 'Candidate ids that match the search, best first.',
              schema: RerankModelOutput.refine(output => isPermutationSubset(output.order, ids), {
                message: 'order must use only candidate ids, each at most once',
              }),
            },
            inputJsonSchema
          );
          attempts.unshift(...result.attempts);
          if (result.ok) {
            const byId = new Map(ordered.map(f => [f.id, f]));
            const head = result.value.order.map(id => byId.get(id)!);
            const rest = ordered.filter(f => !result.value.order.includes(f.id));
            ordered = [...head, ...rest];
            reranked = true;
            rerank = 'applied';
          } else {
            fallbackUsed = true;
            rerank = 'invalid';
          }
        } catch (error) {
          if (!(error instanceof ProviderUnavailableError)) throw error;
          fallbackUsed = true;
          rerank = 'unavailable';
        }
      }

      const items: ScoredBook[] = ordered.slice(0, input.limit).map((f, index) => {
        const book = known.get(f.id)!;
        return {
          book,
          scores: {
            lexical: lexicalRank.get(f.id) ?? null,
            semantic: cosine.get(f.id) ?? null,
            fused: f.score,
          },
          match: {
            semanticRank: semanticRank.get(f.id) ?? null,
            fusedRank: fusedRank.get(f.id)!,
            rerankedRank: reranked ? index + 1 : null,
            matchedOn: matchReasons(input.q, book, {
              keyword: lexicalRank.has(f.id),
              meaning: cosine.has(f.id),
            }),
          },
        };
      });
      return { value: { value: { items, reranked }, rerank }, attempts, fallbackUsed };
    }
  );
  return { value: outcome.value.value, meta: outcome.meta, rerank: outcome.value.rerank };
};

export const similarBooks = async (
  deps: { embeddings: EmbeddingProvider; ports: Ports },
  ctx: { actor: Actor },
  input: { bookId: number; limit: number }
): Promise<ScoredBook[]> => {
  const stored = (await deps.ports.vectorStore.hashes()).get(input.bookId);
  if (
    !stored ||
    stored.model !== deps.embeddings.model ||
    stored.dimensions !== deps.embeddings.dimensions
  )
    return [];
  const vector = await deps.ports.vectorStore.vectorOf(input.bookId);
  if (!vector) return [];
  const hits = await deps.ports.vectorStore.knn(vector, {
    limit: input.limit,
    model: deps.embeddings.model,
    excludeBookId: input.bookId,
  });
  const books = new Map(
    (
      await deps.ports.catalog.booksByIds(
        ctx.actor,
        hits.map(h => h.bookId)
      )
    ).map(b => [b.id, b])
  );
  return hits
    .filter(hit => books.has(hit.bookId))
    .map(hit => ({
      book: books.get(hit.bookId)!,
      scores: { lexical: null, semantic: hit.score, fused: hit.score },
    }));
};

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length > 2)
  );

export const rerankMockHandler: MockToolHandler = request => {
  const text = request.system.map(block => block.text).join('\n');
  const match = /<data name="candidates">\n([\s\S]*?)\n<\/data>/.exec(text);
  const candidates = match?.[1]
    ? (JSON.parse(match[1]) as Array<{
        id: number;
        title: string;
        author: string;
        synopsis: string;
      }>)
    : [];
  const query = words(lastUserText(request.messages).replace(/^Search:\s*/, ''));
  const overlap = (c: (typeof candidates)[number]) =>
    [...words(`${c.title} ${c.author} ${c.synopsis}`)].filter(word => query.has(word)).length;
  return {
    order: candidates
      .map((c, index) => ({ id: c.id, index, overlap: overlap(c) }))
      .sort((a, b) => b.overlap - a.overlap || a.index - b.index)
      .map(c => c.id),
  } satisfies RerankModelOutput;
};
