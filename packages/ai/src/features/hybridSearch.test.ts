import type { RerankModelOutput } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { createMockEmbeddingProvider } from '../providers/embeddings/mock.js';
import { createMockProvider } from '../providers/mock/index.js';
import type { EmbeddingProvider, GenerateRequest, LlmProvider } from '../providers/types.js';
import { ProviderUnavailableError } from '../providers/types.js';
import { book, createFakePorts, createFakeState, genre, reader } from '../testing/index.js';
import { syncEmbeddings } from './embeddings.js';
import {
  DEFAULT_MIN_SIMILARITY,
  RERANK_TOOL,
  hybridSearch,
  matchReasons,
  minSimilarityFor,
  reciprocalRankFusion,
  similarBooks,
} from './hybridSearch.js';

const fantasy = genre(1, 'Fantasy', 'fantasy');
const scifi = genre(2, 'Science Fiction', 'science-fiction');
const g = (x: typeof fantasy) => ({ id: x.id, name: x.name, slug: x.slug });
const books = [
  book(1, {
    title: 'Dune',
    author: 'Frank Herbert',
    genres: [g(scifi)],
    synopsis: 'A desert planet with giant sandworms and a spice everyone wants.',
  }),
  book(2, {
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    genres: [g(fantasy)],
    synopsis: 'A hobbit, a dragon and a long journey there and back again.',
  }),
  book(3, {
    title: 'Desert Solitaire',
    author: 'Edward Abbey',
    genres: [g(scifi)],
    synopsis: 'A season in the canyon wilderness.',
  }),
  book(4, {
    title: 'A Wizard of Earthsea',
    author: 'Ursula K. Le Guin',
    genres: [g(fantasy)],
    synopsis: 'A boy at a school of wizards on an island.',
  }),
  book(5, {
    title: 'Archived Planet',
    author: 'Nobody',
    genres: [g(scifi)],
    synopsis: 'A desert planet nobody can see.',
    archivedAt: '2026-02-01T00:00:00.000Z',
  }),
];

const setup = async (embeddings: EmbeddingProvider = createMockEmbeddingProvider(64)) => {
  const ports = createFakePorts(createFakeState({ books, genres: [fantasy, scifi] }));
  await syncEmbeddings(await ports.catalog.listBooksForEmbedding(), embeddings, ports.vectorStore);
  return { ports, embeddings };
};

const reranker = (answer: (request: GenerateRequest) => unknown): LlmProvider =>
  createMockProvider({ tools: { [RERANK_TOOL]: answer } });

describe('reciprocalRankFusion', () => {
  it('sums 1/(k + rank) over the lists, k = 60, ties by best rank then id', () => {
    const fused = reciprocalRankFusion([
      [10, 20, 30],
      [30, 10],
    ]);
    expect(fused.map(f => f.id)).toEqual([10, 30, 20]);
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 62, 10);
    expect(fused[1]!.score).toBeCloseTo(1 / 63 + 1 / 61, 10);
    expect(reciprocalRankFusion([[2], [1]]).map(f => f.id)).toEqual([1, 2]);
  });
});

describe('hybridSearch', () => {
  it('finds by description what the lexical leg cannot, and never returns archived books', async () => {
    const { ports, embeddings } = await setup();
    const { value, meta } = await hybridSearch(
      { llm: createMockProvider(), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'desert planet sandworms', limit: 5, rerank: false }
    );
    expect(value.items[0]!.book.id).toBe(1);
    expect(value.items[0]!.scores.lexical).toBeNull();
    expect(value.items[0]!.scores.semantic).toBeGreaterThan(0);
    expect(value.items.map(i => i.book.id)).not.toContain(5);
    expect(value.reranked).toBe(false);
    expect(meta).toMatchObject({
      feature: 'HYBRID_SEARCH',
      model: 'mock-embedding',
      fallbackUsed: false,
    });
    expect(meta!.tokensIn).toBeGreaterThan(0);
    expect(ports.state.runs).toHaveLength(1);
  });

  it('embeds the search as a query', async () => {
    const { ports, embeddings } = await setup();
    const purposes: unknown[] = [];
    const spy = {
      ...embeddings,
      embed: (texts: string[], signal?: AbortSignal, options?: { purpose?: string }) => {
        purposes.push(options?.purpose);
        return embeddings.embed(texts, signal);
      },
    };
    await hybridSearch(
      { llm: createMockProvider(), embeddings: spy, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'dune', limit: 3, rerank: false }
    );
    expect(purposes).toEqual(['query']);
  });

  it('a title match ranks first through the lexical leg and both scores are reported', async () => {
    const { ports, embeddings } = await setup();
    const { value } = await hybridSearch(
      { llm: createMockProvider(), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'hobbit', limit: 3, rerank: false }
    );
    expect(value.items[0]).toMatchObject({ book: { id: 2 }, scores: { lexical: 1 } });
    expect(value.items[0]!.scores.fused).toBeGreaterThan(value.items[1]!.scores.fused);
  });

  it('says why each hit matched: fused rank, semantic rank and what the words matched', async () => {
    const { ports, embeddings } = await setup();
    const { value } = await hybridSearch(
      { llm: createMockProvider(), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'hobbit', limit: 3, rerank: false }
    );
    const [top] = value.items;
    expect(top!.match).toMatchObject({ fusedRank: 1, rerankedRank: null });
    expect(top!.match!.matchedOn).toContain('title');
    for (const item of value.items)
      expect(item.match!.semanticRank === null).toBe(item.scores.semantic === null);
    expect(value.items.map(i => i.match!.fusedRank)).toEqual([1, 2, 3]);
  });

  it('rerank output is a permutation subset of candidates', async () => {
    const { ports, embeddings } = await setup();
    const seen: GenerateRequest[] = [];
    let calls = 0;
    const { value, meta, rerank } = await hybridSearch(
      {
        llm: reranker(request => {
          seen.push(request);
          calls += 1;
          return calls === 1
            ? { order: [4, 5, 4] }
            : ({ order: [4, 2] } satisfies RerankModelOutput);
        }),
        embeddings,
        ports,
        minSimilarity: 0,
      },
      { actor: reader, requestId: 'r' },
      { q: 'a boy at a school of wizards', limit: 4, rerank: true }
    );
    expect(calls).toBe(2);
    expect(value.reranked).toBe(true);
    expect(rerank).toBe('applied');
    expect(value.items.slice(0, 2).map(i => i.book.id)).toEqual([4, 2]);
    expect(value.items.map(i => i.match!.rerankedRank)).toEqual(value.items.map((_, i) => i + 1));
    expect(value.items.every(i => i.match!.fusedRank >= 1)).toBe(true);
    expect(new Set(value.items.map(i => i.book.id)).size).toBe(value.items.length);
    expect(meta!.fallbackUsed).toBe(false);
    const variable = seen[0]!.system
      .filter(b => !b.cache)
      .map(b => b.text)
      .join('\n');
    expect(variable).toContain('<data name="candidates">');
    expect(variable).toContain('school of wizards');
  });

  it('an invalid rerank twice keeps the fused order, flagged as a fallback', async () => {
    const { ports, embeddings } = await setup();
    const fused = await hybridSearch(
      { llm: createMockProvider(), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'desert', limit: 4, rerank: false }
    );
    const { value, meta, rerank } = await hybridSearch(
      { llm: reranker(() => ({ order: [999] })), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'desert', limit: 4, rerank: true }
    );
    expect(value.reranked).toBe(false);
    expect(meta!.fallbackUsed).toBe(true);
    expect(value.items.map(i => i.book.id)).toEqual(fused.value.items.map(i => i.book.id));
    expect(rerank).toBe('invalid');
    expect(fused.rerank).toBe('off');
  });

  it('a rerank the provider cannot answer (quota, outage) keeps the fused order and says unavailable', async () => {
    const { ports, embeddings } = await setup();
    const throttled: LlmProvider = {
      ...createMockProvider(),
      generate: () => Promise.reject(new ProviderUnavailableError('429 Too many requests')),
    };
    const outcome = await hybridSearch(
      { llm: throttled, embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'desert', limit: 4, rerank: true }
    );
    expect(outcome.value.reranked).toBe(false);
    expect(outcome.rerank).toBe('unavailable');
    expect(outcome.meta!.fallbackUsed).toBe(true);
  });

  it('when the embedding provider is down, the lexical leg alone answers (fallback, not an error)', async () => {
    const { ports } = await setup();
    const down: EmbeddingProvider = {
      ...createMockEmbeddingProvider(64),
      embed: () => Promise.reject(new ProviderUnavailableError('titan: throttled')),
    };
    const { value, meta } = await hybridSearch(
      { llm: createMockProvider(), embeddings: down, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'hobbit', limit: 5, rerank: false }
    );
    expect(value.items.map(i => i.book.id)).toEqual([2]);
    expect(value.items[0]!.scores.semantic).toBeNull();
    expect(meta!.fallbackUsed).toBe(true);
  });

  it('filters both legs by genre', async () => {
    const { ports, embeddings } = await setup();
    const { value } = await hybridSearch(
      { llm: createMockProvider(), embeddings, ports, minSimilarity: 0 },
      { actor: reader, requestId: 'r' },
      { q: 'desert planet', limit: 5, genre: 'fantasy', rerank: false }
    );
    expect(value.items.every(i => i.book.genres.some(x => x.slug === 'fantasy'))).toBe(true);
  });
});

describe('minimum similarity', () => {
  it('drops semantic hits below the cutoff: gibberish gets nothing, a real description still finds its book', async () => {
    const { ports, embeddings } = await setup(createMockEmbeddingProvider(384));
    const search = (q: string, minSimilarity: number) =>
      hybridSearch(
        { llm: createMockProvider(), embeddings, ports, minSimilarity },
        { actor: reader, requestId: 'r' },
        { q, limit: 5, rerank: false }
      );
    expect((await search('xqzv plorbt wuggle', 0)).value.items.length).toBeGreaterThan(0);
    expect((await search('xqzv plorbt wuggle', 0.3)).value.items).toEqual([]);
    const real = await search('desert planet sandworms', 0.3);
    expect(real.value.items[0]!.book.id).toBe(1);
    expect(
      real.value.items.every(i => i.scores.lexical !== null || i.scores.semantic! >= 0.3)
    ).toBe(true);
  });

  it('defaults per embedding model, and an explicit value wins', () => {
    expect(minSimilarityFor('amazon.titan-embed-text-v2:0')).toBe(
      DEFAULT_MIN_SIMILARITY['amazon.titan-embed-text-v2:0']
    );
    expect(minSimilarityFor('mock-embedding')).toBe(DEFAULT_MIN_SIMILARITY['mock-embedding']);
    expect(minSimilarityFor('some-other-model')).toBe(0);
    expect(minSimilarityFor('mock-embedding', 0.42)).toBe(0.42);
  });
});

describe('similarBooks', () => {
  it('ranks the nearest active books to the stored vector, without the book itself', async () => {
    const { ports, embeddings } = await setup();
    const similar = await similarBooks(
      { embeddings, ports },
      { actor: reader },
      { bookId: 1, limit: 3 }
    );
    expect(similar.map(s => s.book.id)).not.toContain(1);
    expect(similar.map(s => s.book.id)).not.toContain(5);
    expect(similar).toHaveLength(3);
    expect(similar[0]!.scores.semantic).toBeGreaterThanOrEqual(similar[1]!.scores.semantic!);
  });

  it('is empty for a book that has no vector (or another model’s)', async () => {
    const { ports } = await setup();
    expect(
      await similarBooks(
        { embeddings: createMockEmbeddingProvider(32), ports },
        { actor: reader },
        { bookId: 1, limit: 3 }
      )
    ).toEqual([]);
    expect(
      await similarBooks(
        { embeddings: createMockEmbeddingProvider(64), ports },
        { actor: reader },
        { bookId: 99, limit: 3 }
      )
    ).toEqual([]);
  });
});

describe('matchReasons', () => {
  const book = { title: "L'Étranger", author: 'Albert Camus' };

  it('names the field holding a query word, accents and case aside', () => {
    expect(matchReasons('etranger camus', book, { keyword: true, meaning: false })).toEqual([
      'title',
      'author',
    ]);
  });

  it('a keyword hit with no word in either field came from the typo-tolerant match', () => {
    expect(matchReasons('Kamus', book, { keyword: true, meaning: true })).toEqual([
      'spelling',
      'meaning',
    ]);
  });

  it('a meaning-only hit says so; short words do not count', () => {
    expect(matchReasons('de la', book, { keyword: false, meaning: true })).toEqual(['meaning']);
  });
});
