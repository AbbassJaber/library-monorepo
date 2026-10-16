import { API_PREFIX, apiPaths } from '@library/contracts';
import type { ScoredBook } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api, createTestV1, serve } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createReader } from '../../test/factories.js';
import { createApp } from '../../app.js';
import { silentLogger } from '../../test/logger.js';

const searchPath = `${API_PREFIX}${apiPaths.ai.search}`;
const similarPath = (id: number) => `${API_PREFIX}${apiPaths.books.similar(id)}`;

const seeded = async () => {
  const v1 = createTestV1();
  const genre = await createGenre({ name: 'Science Fiction', slug: 'science-fiction' });
  const dune = await createBook({
    title: 'Dune',
    author: 'Frank Herbert',
    synopsis: 'A desert planet, giant sandworms and the spice everyone wants.',
    genreIds: [genre.id],
  });
  const arrakis = await createBook({
    title: 'Children of the Sands',
    author: 'A. Writer',
    synopsis: 'Sandworms cross a desert planet at night.',
    genreIds: [genre.id],
  });
  const other = await createBook({
    title: 'Kitchen Arithmetic',
    author: 'Dana Okafor',
    synopsis: 'Essays on cooking for one.',
    genreIds: [genre.id],
  });
  const archived = await createBook({
    title: 'Hidden Desert Planet',
    author: 'Nobody',
    synopsis: 'A desert planet with sandworms nobody may read about.',
    genreIds: [genre.id],
    archivedAt: new Date(),
  });
  await v1.embeddingSync.syncAll();
  const app = createApp({ ping: async () => undefined, logger: silentLogger, apis: [v1.api] });
  return { client: () => api(serve(app)), dune, arrakis, other, archived };
};

describe('GET /ai/search', () => {
  it('fuses the lexical and semantic legs: a description query finds the book its title does not name', async () => {
    const { client, dune, archived } = await seeded();
    const res = await (
      await (await client()).as(await createReader())
    )
      .get(searchPath)
      .query({ q: 'giant sandworms on a desert planet', limit: 5 });
    expect(res.status).toBe(200);
    const ids = (res.body.data.items as Array<{ book: { id: number } }>).map(i => i.book.id);
    expect(ids).toContain(dune.id);
    expect(ids).not.toContain(archived.id);
    const hit = (res.body.data.items as ScoredBook[]).find(i => i.book.id === dune.id);
    expect(hit?.match).toMatchObject({ rerankedRank: null, matchedOn: ['meaning'] });
    expect(hit?.match?.semanticRank).toBeGreaterThanOrEqual(1);
    expect(res.body.data.reranked).toBe(false);
    expect(res.body.meta.rerank).toBe('off');
    expect(res.body.meta.ai).toMatchObject({ feature: 'HYBRID_SEARCH', provider: 'mock' });
    expect(
      await testPrisma().aiRun.findFirst({ where: { feature: 'HYBRID_SEARCH' } })
    ).toMatchObject({
      success: true,
    });
  });

  it('reranks on request (the Mock reranker), and validates the query', async () => {
    const { client } = await seeded();
    const reader = await (await client()).as(await createReader());
    const res = await reader.get(searchPath).query({ q: 'desert planet', rerank: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.data.reranked).toBe(true);
    expect(res.body.meta.rerank).toBe('applied');
    const ranks = (res.body.data.items as ScoredBook[]).map(i => i.match?.rerankedRank);
    expect(ranks).toEqual(ranks.map((_, index) => index + 1));
    expect((await reader.get(searchPath).query({ q: 'x' })).status).toBe(400);
    expect((await reader.get(searchPath).query({ q: 'dune', limit: 21 })).status).toBe(400);
    const anonymous = await (await client()).anonymous();
    expect((await anonymous.get(searchPath).query({ q: 'dune' })).status).toBe(401);
  });
});

describe('GET /books/:id/similar', () => {
  it('returns the nearest active books, never the book itself or an archived one', async () => {
    const { client, dune, arrakis, archived } = await seeded();
    const res = await (await (await client()).as(await createReader())).get(similarPath(dune.id));
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ book: { id: number } }>).map(i => i.book.id);
    expect(ids[0]).toBe(arrakis.id);
    expect(ids).not.toContain(dune.id);
    expect(ids).not.toContain(archived.id);
  });

  it('an archived book is not found for readers; an unknown id is 404', async () => {
    const { client, archived } = await seeded();
    const reader = await (await client()).as(await createReader());
    expect((await reader.get(similarPath(archived.id))).status).toBe(404);
    expect((await reader.get(similarPath(999_999))).status).toBe(404);
  });
});
