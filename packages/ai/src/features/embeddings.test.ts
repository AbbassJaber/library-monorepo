import { describe, expect, it } from 'vitest';
import { createMockEmbeddingProvider } from '../providers/embeddings/mock.js';
import { book, createFakePorts, createFakeState } from '../testing/index.js';
import { contentHash, syncEmbeddings } from './embeddings.js';

describe('syncEmbeddings', () => {
  it('embeds only missing or changed books, and re-embeds when the model or dimensions change', async () => {
    const state = createFakeState({
      books: [book(1), book(2), book(3, { archivedAt: '2026-02-01T00:00:00.000Z' })],
    });
    const ports = createFakePorts(state);
    const small = createMockEmbeddingProvider(32);
    const sources = await ports.catalog.listBooksForEmbedding();
    expect(sources.map(s => s.id)).toEqual([1, 2]);

    const first = await syncEmbeddings(sources, small, ports.vectorStore, { batchSize: 1 });
    expect(first).toMatchObject({
      considered: 2,
      embedded: 2,
      skipped: 0,
      model: 'mock-embedding',
    });
    expect(first.tokens).toBeGreaterThan(0);
    expect(first.costUsd).toBe(0);
    expect(await syncEmbeddings(sources, small, ports.vectorStore)).toMatchObject({
      considered: 2,
      embedded: 0,
      skipped: 2,
      tokens: 0,
    });

    state.books[0]!.synopsis = 'Rewritten.';
    const edited = await ports.catalog.listBooksForEmbedding();
    expect(await syncEmbeddings(edited, small, ports.vectorStore)).toMatchObject({
      considered: 2,
      embedded: 1,
      skipped: 1,
    });

    const other = createMockEmbeddingProvider(64);
    expect(await syncEmbeddings(edited, other, ports.vectorStore)).toMatchObject({ embedded: 2 });
    expect((await ports.vectorStore.hashes()).get(1)).toMatchObject({ dimensions: 64 });
  });

  it('contentHash is stable and sensitive to every character', () => {
    expect(contentHash('a')).toBe(contentHash('a'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });

  it('embeds catalog text as documents (Cohere embeds documents and queries differently)', async () => {
    const ports = createFakePorts(createFakeState({ books: [book(1)] }));
    const purposes: unknown[] = [];
    const base = createMockEmbeddingProvider(16);
    const spy = {
      ...base,
      embed: (texts: string[], signal?: AbortSignal, options?: { purpose?: string }) => {
        purposes.push(options?.purpose);
        return base.embed(texts, signal);
      },
    };
    await syncEmbeddings(await ports.catalog.listBooksForEmbedding(), spy, ports.vectorStore);
    expect(purposes).toEqual(['document']);
  });
});
