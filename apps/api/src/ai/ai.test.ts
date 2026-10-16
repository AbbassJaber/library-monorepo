import {
  apiPaths,
  API_PREFIX,
  Role,
  AiFeature,
  EmbeddingExpansion,
  AiTier,
} from '@library/contracts';
import { runFeature, syncEmbeddings } from '@library/ai';
import { runPortContract } from '@library/ai/testing';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createV1 } from '../modules/v1.js';
import { api, createTestV1, serve, testAiEnv, testModuleDeps } from '../test/client.js';
import { testPrisma } from '../test/db.js';
import { createBook, createGenre, createLibrarian, createReader } from '../test/factories.js';
import { createEmbeddingSync } from './embeddingSync.js';
import { silentLogger } from '../test/logger.js';

const v1 = (path: string) => `${API_PREFIX}${path}`;

runPortContract('API adapters', async () => {
  const { ai } = createTestV1();
  const reader = await createReader();
  const librarian = await createLibrarian();
  const genre = await createGenre({ name: 'Contract Genre', slug: 'contract-genre' });
  const activeBook = await createBook({ title: 'Contract Active Book', genreIds: [genre.id] });
  const archivedBook = await createBook({ genreIds: [genre.id], archivedAt: new Date() });
  return {
    ports: ai.ports,
    seed: {
      reader: { id: reader.id, role: Role.enum.READER },
      librarian: { id: librarian.id, role: Role.enum.LIBRARIAN },
      activeBook,
      archivedBook,
      genre,
    },
  };
});

describe('vector store (real pgvector)', () => {
  it('KNN returns the nearest active book first, ignores other models, dimension counts and archived rows', async () => {
    const { ai } = createTestV1();
    const genre = await createGenre();
    const near = await createBook({ genreIds: [genre.id] });
    const far = await createBook({ genreIds: [genre.id] });
    const archived = await createBook({ genreIds: [genre.id], archivedAt: new Date() });
    const otherDims = await createBook({ genreIds: [genre.id] });
    const otherModel = await createBook({ genreIds: [genre.id] });
    await ai.ports.vectorStore.upsert([
      { bookId: near.id, vector: [1, 0, 0, 0], contentHash: 'a', model: 'm', dimensions: 4 },
      { bookId: far.id, vector: [0, 1, 0, 0], contentHash: 'b', model: 'm', dimensions: 4 },
      { bookId: archived.id, vector: [1, 0, 0, 0], contentHash: 'c', model: 'm', dimensions: 4 },
      { bookId: otherDims.id, vector: [1, 0, 0], contentHash: 'd', model: 'm', dimensions: 3 },
      { bookId: otherModel.id, vector: [1, 0, 0, 0], contentHash: 'e', model: 'n', dimensions: 4 },
    ]);
    const hits = await ai.ports.vectorStore.knn([0.9, 0.1, 0, 0], { limit: 10, model: 'm' });
    expect(hits.map(h => h.bookId)).toEqual([near.id, far.id]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(
      await ai.ports.vectorStore.knn([1, 0, 0, 0], {
        limit: 10,
        model: 'm',
        excludeBookId: near.id,
      })
    ).toEqual([{ bookId: far.id, score: expect.any(Number) as number }]);
    const other = await createGenre();
    expect(
      await ai.ports.vectorStore.knn([1, 0, 0, 0], { limit: 10, model: 'm', genreSlug: other.slug })
    ).toEqual([]);
  });
});

describe('embedding sync', () => {
  it('is single-flight: concurrent calls (interval, /ready probes) share one run', async () => {
    const { ai } = createTestV1();
    const genre = await createGenre();
    await createBook({ genreIds: [genre.id] });
    await createBook({ genreIds: [genre.id] });
    const sync = createEmbeddingSync(ai, testPrisma(), silentLogger);
    const runs = await Promise.all([sync.syncAll(), sync.syncAll(), sync.syncAll()]);
    expect(runs.map(r => r.embedded)).toEqual([2, 2, 2]);
    expect(await testPrisma().aiRun.count({ where: { feature: 'EMBEDDING' } })).toBe(1);
    expect(await sync.syncAll()).toMatchObject({ embedded: 0, skipped: 2 });
  });

  it('embeds only changed books (hash) and treats another model or dimension count as stale', async () => {
    const { ai } = createTestV1();
    const genre = await createGenre();
    const a = await createBook({ genreIds: [genre.id] });
    await createBook({ genreIds: [genre.id] });
    const sync = createEmbeddingSync(ai, testPrisma(), silentLogger);
    const first = await sync.syncAll();
    expect(first).toMatchObject({
      considered: 2,
      embedded: 2,
      skipped: 0,
      model: ai.embeddings.model,
    });
    expect(first.tokens).toBeGreaterThan(0);
    expect(await sync.syncAll()).toMatchObject({
      considered: 2,
      embedded: 0,
      skipped: 2,
      tokens: 0,
    });
    expect(await testPrisma().aiRun.findMany()).toEqual([
      expect.objectContaining({
        feature: 'EMBEDDING',
        model: ai.embeddings.model,
        tokensIn: first.tokens,
        success: true,
      }),
    ]);

    await testPrisma().book.update({ where: { id: a.id }, data: { synopsis: 'A new synopsis.' } });
    expect(await sync.syncAll()).toMatchObject({ considered: 2, embedded: 1, skipped: 1 });

    await ai.ports.vectorStore.upsert([
      {
        bookId: a.id,
        vector: new Array(16).fill(0.25),
        contentHash: 'other',
        model: 'other-model',
        dimensions: 16,
      },
    ]);
    const sources = await ai.ports.catalog.listBooksForEmbedding();
    expect(await syncEmbeddings(sources, ai.embeddings, ai.ports.vectorStore)).toMatchObject({
      embedded: 1,
      skipped: 1,
    });
    expect((await ai.ports.vectorStore.hashes()).get(a.id)).toMatchObject({
      model: ai.embeddings.model,
      dimensions: ai.embeddings.dimensions,
    });
    expect(await testPrisma().bookEmbedding.count()).toBe(2);
  });

  it('with document expansion, books are embedded with stored FR/AR summaries, regenerated only on change', async () => {
    const v1 = createV1({
      ...testModuleDeps(),
      ai: { ...testAiEnv, EMBEDDING_EXPANSION: EmbeddingExpansion.enum['fr-ar'] },
    });
    const genre = await createGenre();
    const a = await createBook({ genreIds: [genre.id] });
    await createBook({ genreIds: [genre.id] });
    expect(await v1.embeddingSync.syncAll()).toMatchObject({ embedded: 2 });
    expect(await testPrisma().bookExpansion.count()).toBe(2);
    const expansions = await testPrisma().aiRun.count({ where: { feature: 'EXPANSION' } });
    expect(expansions).toBe(2);
    expect(await v1.embeddingSync.syncAll()).toMatchObject({ embedded: 0 });
    expect(await testPrisma().aiRun.count({ where: { feature: 'EXPANSION' } })).toBe(2);
    await testPrisma().book.update({
      where: { id: a.id },
      data: { synopsis: 'A brand new synopsis.' },
    });
    expect(await v1.embeddingSync.syncAll()).toMatchObject({ embedded: 1 });
    expect(await testPrisma().aiRun.count({ where: { feature: 'EXPANSION' } })).toBe(3);
    expect((await testPrisma().bookExpansion.findUnique({ where: { bookId: a.id } }))?.fr).toMatch(
      /^Résumé/
    );
  });

  it('editing a synopsis re-embeds only that book', async () => {
    const v1 = createTestV1();
    const genre = await createGenre();
    const edited = await createBook({ genreIds: [genre.id] });
    const untouched = await createBook({ genreIds: [genre.id] });
    await v1.embeddingSync.syncAll();
    const before = await v1.ai.ports.vectorStore.hashes();
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [v1.api],
    });
    const res = await (
      await api(serve(app)).as(await createLibrarian())
    )
      .patch(`/api/v1/books/${edited.id}`)
      .send({ synopsis: 'A different synopsis entirely.', version: edited.version });
    expect(res.status).toBe(200);
    for (let i = 0; i < 50; i++) {
      const now = (await v1.ai.ports.vectorStore.hashes()).get(edited.id)?.contentHash;
      if (now !== before.get(edited.id)?.contentHash) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const after = await v1.ai.ports.vectorStore.hashes();
    expect(after.get(edited.id)?.contentHash).not.toBe(before.get(edited.id)?.contentHash);
    expect(after.get(untouched.id)).toEqual(before.get(untouched.id));
    const runs = await testPrisma().aiRun.findMany({ orderBy: { id: 'asc' } });
    expect(runs.at(-1)).toMatchObject({ feature: 'EMBEDDING', success: true });
  });

  it('a librarian write re-embeds that book; archiving drops its row', async () => {
    const { ai, embeddingSync } = createTestV1();
    const genre = await createGenre();
    const book = await createBook({ genreIds: [genre.id] });
    await embeddingSync.syncBook(book.id);
    const before = (await ai.ports.vectorStore.hashes()).get(book.id)?.contentHash;
    await testPrisma().book.update({ where: { id: book.id }, data: { title: 'Renamed' } });
    await embeddingSync.syncBook(book.id);
    expect((await ai.ports.vectorStore.hashes()).get(book.id)?.contentHash).not.toBe(before);
    await testPrisma().book.update({ where: { id: book.id }, data: { archivedAt: new Date() } });
    await embeddingSync.syncBook(book.id);
    expect((await ai.ports.vectorStore.hashes()).has(book.id)).toBe(false);
  });
});

describe('tracing', () => {
  it('writes one AiRun row per feature call and exposes it through /ai/runs for librarians', async () => {
    const { ai } = createTestV1();
    const reader = await createReader();
    const outcome = await runFeature(
      {
        feature: AiFeature.enum.NL_SEARCH,
        llm: ai.llm,
        trace: ai.ports.trace,
        actor: { id: reader.id, role: Role.enum.READER },
        requestId: 'req-1',
      },
      async () => {
        const attempt = await ai.llm.generate({
          tier: AiTier.enum.small,
          system: [],
          messages: [{ role: 'user', content: 'x' }],
          maxOutputTokens: 5,
        });
        return { value: 1, attempts: [attempt], fallbackUsed: false };
      }
    );
    expect(outcome.meta.runId).toEqual(expect.any(Number));
    const rows = await testPrisma().aiRun.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: 'NL_SEARCH',
      provider: 'mock',
      model: 'mock-small',
      success: true,
      userId: reader.id,
      requestId: 'req-1',
    });

    const librarian = await createLibrarian();
    const res = await (await api().as(librarian)).get(v1(apiPaths.ai.runs));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totals).toEqual({ runs: 1, costUsd: 0, failures: 0 });
  });
});

describe('GET /ai/status', () => {
  it('echoes the configured provider, model ids and embedding dimensions', async () => {
    const res = await (await api().anonymous()).get(v1(apiPaths.ai.status));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      provider: 'mock',
      models: { small: 'mock-small', strong: 'mock-strong' },
      cachingSupported: false,
      forcedToolChoice: 'forced',
      tiers: {
        small: {
          provider: 'mock',
          model: 'mock-small',
          cachingSupported: false,
          forcedToolChoice: 'forced',
        },
        strong: {
          provider: 'mock',
          model: 'mock-strong',
          cachingSupported: false,
          forcedToolChoice: 'forced',
        },
      },
      embeddings: { provider: 'mock', model: 'mock-embedding', dimensions: 32 },
      features: {
        EMBEDDING: true,
        NL_SEARCH: true,
        AUTOFILL: true,
        HYBRID_SEARCH: true,
        SIMILAR: true,
        RERANK: false,
      },
      search: { minSimilarity: 0.33 },
      chat: { tier: 'small' },
      voiceMode: 'off',
    });
  });
});
