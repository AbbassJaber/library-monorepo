import { describe, expect, it } from 'vitest';
import {
  ReadingState,
  ChatLocale,
  PendingActionStatus,
  AiFeature,
  AiProviderName,
  type Book,
  type Genre,
} from '@library/contracts';
import type { Actor, Ports } from '../ports/index.js';

export interface PortContractSeed {
  reader: Actor;
  librarian: Actor;
  activeBook: Pick<Book, 'id' | 'title'>;
  archivedBook: Pick<Book, 'id'>;
  genre: Pick<Genre, 'id' | 'slug'>;
}

export const runPortContract = (
  name: string,
  setup: () => Promise<{ ports: Ports; seed: PortContractSeed }>
): void => {
  describe(`port contract: ${name}`, () => {
    it('searchBooks finds the active book by a title fragment and never an archived one', async () => {
      const { ports, seed } = await setup();
      const hits = await ports.catalog.searchBooks(seed.reader, {
        q: seed.activeBook.title.slice(0, 6),
        limit: 10,
      });
      expect(hits.map(h => h.id)).toContain(seed.activeBook.id);
      expect(hits.map(h => h.id)).not.toContain(seed.archivedBook.id);
    });

    it('getBook hides archived books from readers but not from librarians', async () => {
      const { ports, seed } = await setup();
      expect(await ports.catalog.getBook(seed.reader, seed.archivedBook.id)).toBeNull();
      expect((await ports.catalog.getBook(seed.librarian, seed.archivedBook.id))?.id).toBe(
        seed.archivedBook.id
      );
      expect((await ports.catalog.getBook(seed.reader, seed.activeBook.id))?.id).toBe(
        seed.activeBook.id
      );
    });

    it('listGenres includes the seeded genre with its slug', async () => {
      const { ports, seed } = await setup();
      const genres = await ports.catalog.listGenres(seed.reader);
      expect(genres.find(g => g.id === seed.genre.id)?.slug).toBe(seed.genre.slug);
    });

    it('addToReadingList is idempotent and updateReadingState changes the state', async () => {
      const { ports, seed } = await setup();
      const first = await ports.catalog.addToReadingList(seed.reader, {
        bookId: seed.activeBook.id,
        state: ReadingState.enum.WANT_TO_READ,
      });
      const second = await ports.catalog.addToReadingList(seed.reader, {
        bookId: seed.activeBook.id,
        state: ReadingState.enum.WANT_TO_READ,
      });
      expect(second.id).toBe(first.id);
      const updated = await ports.catalog.updateReadingState(
        seed.reader,
        seed.activeBook.id,
        ReadingState.enum.READING
      );
      expect(updated.state).toBe('READING');
      const shelf = await ports.catalog.getShelf(seed.reader);
      expect(shelf.filter(e => e.book.id === seed.activeBook.id)).toHaveLength(1);
    });

    it('removeFromReadingList takes the book off the shelf; removing it again is refused', async () => {
      const { ports, seed } = await setup();
      await ports.catalog.addToReadingList(seed.reader, {
        bookId: seed.activeBook.id,
        state: ReadingState.enum.WANT_TO_READ,
      });
      await ports.catalog.removeFromReadingList(seed.reader, seed.activeBook.id);
      const shelf = await ports.catalog.getShelf(seed.reader);
      expect(shelf.some(e => e.book.id === seed.activeBook.id)).toBe(false);
      await expect(
        ports.catalog.removeFromReadingList(seed.reader, seed.activeBook.id)
      ).rejects.toThrow();
    });

    it('changeReadingList applies a batch in one go, and nothing when one change cannot apply', async () => {
      const { ports, seed } = await setup();
      await ports.catalog.addToReadingList(seed.reader, {
        bookId: seed.activeBook.id,
        state: ReadingState.enum.WANT_TO_READ,
      });
      await expect(
        ports.catalog.changeReadingList(seed.reader, [
          { action: 'setState', bookId: seed.activeBook.id, state: ReadingState.enum.FINISHED },
          { action: 'remove', bookId: seed.archivedBook.id },
        ])
      ).rejects.toThrow();
      expect(
        (await ports.catalog.getShelf(seed.reader)).find(e => e.book.id === seed.activeBook.id)
          ?.state
      ).toBe('WANT_TO_READ');
      const result = await ports.catalog.changeReadingList(seed.reader, [
        { action: 'setState', bookId: seed.activeBook.id, state: ReadingState.enum.FINISHED },
      ]);
      expect(result.updated.map(e => [e.book.id, e.state])).toEqual([
        [seed.activeBook.id, 'FINISHED'],
      ]);
      const removed = await ports.catalog.changeReadingList(seed.reader, [
        { action: 'remove', bookId: seed.activeBook.id },
      ]);
      expect(removed).toMatchObject({ removed: [seed.activeBook.id], updated: [] });
      expect(
        (await ports.catalog.getShelf(seed.reader)).some(e => e.book.id === seed.activeBook.id)
      ).toBe(false);
    });

    it('adding an archived book is refused for readers', async () => {
      const { ports, seed } = await setup();
      await expect(
        ports.catalog.addToReadingList(seed.reader, {
          bookId: seed.archivedBook.id,
          state: ReadingState.enum.WANT_TO_READ,
        })
      ).rejects.toThrow();
    });

    it('listBooksForEmbedding returns active books with a stable content hash', async () => {
      const { ports, seed } = await setup();
      const first = await ports.catalog.listBooksForEmbedding();
      const second = await ports.catalog.listBooksForEmbedding();
      expect(first.map(s => s.id)).toContain(seed.activeBook.id);
      expect(first.map(s => s.id)).not.toContain(seed.archivedBook.id);
      expect(first.find(s => s.id === seed.activeBook.id)?.contentHash).toBe(
        second.find(s => s.id === seed.activeBook.id)?.contentHash
      );
    });

    it('vectorStore upserts, reports hashes and ranks the nearest active book first', async () => {
      const { ports, seed } = await setup();
      const dims = 8;
      const unit = (i: number) => Array.from({ length: dims }, (_, j) => (j === i ? 1 : 0));
      await ports.vectorStore.upsert([
        {
          bookId: seed.activeBook.id,
          vector: unit(0),
          contentHash: 'h1',
          model: 'test',
          dimensions: dims,
        },
        {
          bookId: seed.archivedBook.id,
          vector: unit(0),
          contentHash: 'h2',
          model: 'test',
          dimensions: dims,
        },
      ]);
      const hashes = await ports.vectorStore.hashes();
      expect(hashes.get(seed.activeBook.id)).toEqual({
        contentHash: 'h1',
        model: 'test',
        dimensions: dims,
      });
      const hits = await ports.vectorStore.knn(unit(0), { limit: 5, model: 'test' });
      expect(hits[0]?.bookId).toBe(seed.activeBook.id);
      expect(hits.map(h => h.bookId)).not.toContain(seed.archivedBook.id);
      expect(await ports.vectorStore.vectorOf(seed.activeBook.id)).toEqual(unit(0));
      await ports.vectorStore.upsert([
        {
          bookId: seed.activeBook.id,
          vector: unit(1),
          contentHash: 'h3',
          model: 'test',
          dimensions: dims,
        },
      ]);
      expect((await ports.vectorStore.hashes()).get(seed.activeBook.id)?.contentHash).toBe('h3');
    });

    it('knn compares only vectors of the query model (same dimensions, other model: ignored)', async () => {
      const { ports, seed } = await setup();
      const dims = 8;
      const unit = (i: number) => Array.from({ length: dims }, (_, j) => (j === i ? 1 : 0));
      await ports.vectorStore.upsert([
        {
          bookId: seed.activeBook.id,
          vector: unit(2),
          contentHash: 'h',
          model: 'other',
          dimensions: dims,
        },
      ]);
      expect(await ports.vectorStore.knn(unit(2), { limit: 5, model: 'test' })).toEqual([]);
      expect((await ports.vectorStore.knn(unit(2), { limit: 5, model: 'other' }))[0]?.bookId).toBe(
        seed.activeBook.id
      );
    });

    it('booksByIds returns active books in the order asked, without archived or unknown ids', async () => {
      const { ports, seed } = await setup();
      for (const actor of [seed.reader, seed.librarian]) {
        const books = await ports.catalog.booksByIds(actor, [
          999_999,
          seed.archivedBook.id,
          seed.activeBook.id,
        ]);
        expect(books.map(b => b.id)).toEqual([seed.activeBook.id]);
        expect(books[0]?.title).toBe(seed.activeBook.title);
      }
      expect(await ports.catalog.booksByIds(seed.reader, [])).toEqual([]);
    });

    it('a pending action is decided once: the first decide wins, later ones and other users get null', async () => {
      const { ports, seed } = await setup();
      const id = `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await ports.pendingActions.create({
        id,
        actorId: seed.reader.id,
        tool: 'addToReadingList',
        input: { bookId: seed.activeBook.id, state: 'WANT_TO_READ' },
        summary: 'Add it',
        locale: ChatLocale.enum.en,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(
        await ports.pendingActions.decide(id, seed.librarian.id, PendingActionStatus.enum.confirmed)
      ).toBeNull();
      const decisions = await Promise.all([
        ports.pendingActions.decide(id, seed.reader.id, PendingActionStatus.enum.confirmed),
        ports.pendingActions.decide(id, seed.reader.id, PendingActionStatus.enum.confirmed),
      ]);
      expect(decisions.filter(Boolean)).toHaveLength(1);
      expect(decisions.find(Boolean)).toMatchObject({ id, tool: 'addToReadingList', locale: 'en' });
      expect(
        await ports.pendingActions.decide(id, seed.reader.id, PendingActionStatus.enum.cancelled)
      ).toBeNull();
      await ports.pendingActions.finish(id, { ok: true });
    });

    it('trace records a run and returns an id (or null)', async () => {
      const { ports, seed } = await setup();
      const id = await ports.trace.record({
        userId: seed.reader.id,
        feature: AiFeature.enum.NL_SEARCH,
        provider: AiProviderName.enum.mock,
        model: 'mock-small',
        tokensIn: 10,
        tokensOut: 5,
        tokensCachedRead: 0,
        tokensCachedWrite: 0,
        costUsd: 0,
        latencyMs: 3,
        success: true,
        fallbackUsed: false,
        errorCode: null,
        requestId: null,
      });
      expect(id === null || Number.isInteger(id)).toBe(true);
    });
  });
};
