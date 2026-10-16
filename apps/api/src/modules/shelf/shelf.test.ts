import { AUDIT_ACTIONS, AuditEntityType, ReadingState } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createEntry, createLibrarian, createReader } from '../../test/factories.js';

const SHELF = '/api/v1/me/reading-list';

describe('GET /api/v1/me/reading-list', () => {
  it('lists my active entries, newest first, with the book summary and availability', async () => {
    const reader = await createReader();
    const other = await createReader();
    const live = await createBook({ title: 'Live' });
    const archived = await createBook({ title: 'Archived', archivedAt: new Date() });
    const removed = await createBook({ title: 'Removed' });
    await createEntry(reader.id, live.id, ReadingState.enum.READING);
    await createEntry(reader.id, archived.id, ReadingState.enum.WANT_TO_READ);
    await testPrisma().readingListEntry.create({
      data: { userId: reader.id, bookId: removed.id, removedAt: new Date() },
    });
    await createEntry(other.id, live.id);

    const res = await (await api().as(reader)).get(SHELF);

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((e: { book: { title: string }; available: boolean; state: string }) => [
        e.book.title,
        e.available,
        e.state,
      ])
    ).toEqual([
      ['Archived', false, 'WANT_TO_READ'],
      ['Live', true, 'READING'],
    ]);
  });

  it('requires authentication', async () => {
    expect((await (await api().anonymous()).get(SHELF)).status).toBe(401);
  });
});

describe('POST /api/v1/me/reading-list', () => {
  it('adds a book with the default state and writes an audit row', async () => {
    const reader = await createReader();
    const book = await createBook();
    const res = await (await api().as(reader)).post(SHELF).send({ bookId: book.id });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      state: 'WANT_TO_READ',
      available: true,
      book: { id: book.id },
    });
    const audit = await testPrisma().auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.shelfAdd },
    });
    expect(audit).toMatchObject({
      actorId: reader.id,
      entityType: AuditEntityType.enum.reading_list_entry,
    });
  });

  it('adding an archived book is not found for readers', async () => {
    const reader = await createReader();
    const book = await createBook({ archivedAt: new Date() });
    const res = await (await api().as(reader)).post(SHELF).send({ bookId: book.id });
    expect(res.status).toBe(404);
  });

  it('adding an archived book is a BOOK_ARCHIVED conflict for librarians, who can see it', async () => {
    const librarian = await createLibrarian();
    const book = await createBook({ archivedAt: new Date() });
    const res = await (await api().as(librarian)).post(SHELF).send({ bookId: book.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOK_ARCHIVED');
  });

  it('re-adding a removed book reactivates the same row', async () => {
    const reader = await createReader();
    const book = await createBook();
    const client = await api().as(reader);
    const first = await client.post(SHELF).send({ bookId: book.id, state: 'READING' });
    await client.delete(`${SHELF}/${book.id}`);
    expect((await client.get(SHELF)).body.data).toEqual([]);

    const again = await client.post(SHELF).send({ bookId: book.id });

    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.body.data.state).toBe('WANT_TO_READ');
    expect(await testPrisma().readingListEntry.count({ where: { userId: reader.id } })).toBe(1);
  });

  it('adding a book that is already on the shelf is idempotent', async () => {
    const reader = await createReader();
    const book = await createBook();
    const client = await api().as(reader);
    await client.post(SHELF).send({ bookId: book.id, state: 'FINISHED' });
    const res = await client.post(SHELF).send({ bookId: book.id });
    expect(res.status).toBe(201);
    expect(res.body.data.state).toBe('FINISHED');
    expect(await testPrisma().readingListEntry.count({ where: { userId: reader.id } })).toBe(1);
  });

  it('rejects an unknown book and unknown fields', async () => {
    const client = await api().as(await createReader());
    expect((await client.post(SHELF).send({ bookId: 9999 })).status).toBe(404);
    const book = await createBook();
    expect((await client.post(SHELF).send({ bookId: book.id, userId: 1 })).status).toBe(400);
  });
});

describe('PATCH /api/v1/me/reading-list/:bookId', () => {
  it('changes the reading state', async () => {
    const reader = await createReader();
    const book = await createBook();
    await createEntry(reader.id, book.id);
    const res = await (
      await api().as(reader)
    )
      .patch(`${SHELF}/${book.id}`)
      .send({ state: 'FINISHED' });
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('FINISHED');
  });

  it('state change on an archived entry is 409 BOOK_ARCHIVED', async () => {
    const reader = await createReader();
    const book = await createBook({ archivedAt: new Date() });
    await createEntry(reader.id, book.id);
    const res = await (
      await api().as(reader)
    )
      .patch(`${SHELF}/${book.id}`)
      .send({ state: 'FINISHED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOK_ARCHIVED');
  });

  it('is 404 for a book not on my shelf, including another reader’s entry', async () => {
    const reader = await createReader();
    const other = await createReader();
    const book = await createBook();
    await createEntry(other.id, book.id);
    const res = await (
      await api().as(reader)
    )
      .patch(`${SHELF}/${book.id}`)
      .send({ state: 'READING' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/me/reading-list/:bookId', () => {
  it('an archived entry can still be removed, and removal is soft', async () => {
    const reader = await createReader();
    const book = await createBook({ archivedAt: new Date() });
    await createEntry(reader.id, book.id);

    const res = await (await api().as(reader)).delete(`${SHELF}/${book.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ removed: true });
    const row = await testPrisma().readingListEntry.findFirst({
      where: { userId: reader.id, bookId: book.id },
    });
    expect(row?.removedAt).not.toBeNull();
  });

  it('removing something not on the shelf is 404', async () => {
    const reader = await createReader();
    const book = await createBook();
    expect((await (await api().as(reader)).delete(`${SHELF}/${book.id}`)).status).toBe(404);
  });
});

describe('POST /api/v1/me/reading-list/batch', () => {
  it('removes and re-states several books in one transaction, one audit row per change', async () => {
    const reader = await createReader();
    const [a, b, c] = [await createBook(), await createBook(), await createBook()];
    await createEntry(reader.id, a.id, ReadingState.enum.WANT_TO_READ);
    await createEntry(reader.id, b.id, ReadingState.enum.READING);
    await createEntry(reader.id, c.id, ReadingState.enum.READING);

    const res = await (await api().as(reader)).post(`${SHELF}/batch`).send({
      changes: [
        { action: 'remove', bookId: a.id },
        { action: 'setState', bookId: b.id, state: 'FINISHED' },
        { action: 'remove', bookId: c.id },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toEqual([a.id, c.id]);
    expect(res.body.data.updated).toEqual([
      expect.objectContaining({ state: 'FINISHED', book: expect.objectContaining({ id: b.id }) }),
    ]);
    const shelf = await (await api().as(reader)).get(SHELF);
    expect(shelf.body.data.map((e: { book: { id: number } }) => e.book.id)).toEqual([b.id]);
    const audit = await testPrisma().auditLog.findMany({
      where: { action: { in: [AUDIT_ACTIONS.shelfRemove, AUDIT_ACTIONS.shelfUpdate] } },
    });
    expect(audit).toHaveLength(3);
  });

  it('applies nothing when one change cannot apply (a book not on my shelf, an archived state change)', async () => {
    const reader = await createReader();
    const mine = await createBook();
    const notMine = await createBook();
    const archived = await createBook({ archivedAt: new Date() });
    await createEntry(reader.id, mine.id, ReadingState.enum.READING);
    await createEntry(reader.id, archived.id, ReadingState.enum.READING);
    const agent = await api().as(reader);

    const missing = await agent.post(`${SHELF}/batch`).send({
      changes: [
        { action: 'remove', bookId: mine.id },
        { action: 'remove', bookId: notMine.id },
      ],
    });
    expect(missing.status).toBe(404);
    const locked = await agent.post(`${SHELF}/batch`).send({
      changes: [
        { action: 'remove', bookId: mine.id },
        { action: 'setState', bookId: archived.id, state: 'FINISHED' },
      ],
    });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('BOOK_ARCHIVED');

    const shelf = await agent.get(SHELF);
    expect(shelf.body.data.map((e: { book: { id: number } }) => e.book.id).sort()).toEqual(
      [mine.id, archived.id].sort()
    );
    expect(
      await testPrisma().auditLog.count({ where: { action: AUDIT_ACTIONS.shelfRemove } })
    ).toBe(0);
  });

  it('rejects more than ten changes, a repeated book and an add', async () => {
    const reader = await createReader();
    const agent = await api().as(reader);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ action: 'remove', bookId: i + 1 }));
    expect((await agent.post(`${SHELF}/batch`).send({ changes: eleven })).status).toBe(400);
    const twice = [
      { action: 'remove', bookId: 1 },
      { action: 'setState', bookId: 1, state: 'READING' },
    ];
    expect((await agent.post(`${SHELF}/batch`).send({ changes: twice })).status).toBe(400);
    expect(
      (await agent.post(`${SHELF}/batch`).send({ changes: [{ action: 'add', bookId: 1 }] })).status
    ).toBe(400);
    expect((await agent.post(`${SHELF}/batch`).send({ changes: [] })).status).toBe(400);
  });
});
