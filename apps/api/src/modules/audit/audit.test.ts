import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { createBook, createGenre, createLibrarian, createReader } from '../../test/factories.js';

const AUDIT = '/api/v1/audit-logs';

describe('GET /api/v1/audit-logs', () => {
  it('audit list is librarian-only', async () => {
    const reader = await api().as(await createReader());
    const res = await reader.get(AUDIT);
    expect(res.status).toBe(403);
    expect((await (await api().anonymous()).get(AUDIT)).status).toBe(401);
  });

  it('lists entries newest first with actor, entity, before/after and request id', async () => {
    const librarian = await createLibrarian();
    const client = await api().as(librarian);
    const genre = await createGenre({ name: 'Audited' });
    await client.patch(`/api/v1/genres/${genre.id}`).send({ name: 'Renamed' });
    const book = await createBook({ genreIds: [genre.id] });
    await client.post(`/api/v1/books/${book.id}/archive`).send({ version: 1 });

    const res = await client.get(AUDIT);

    expect(res.status).toBe(200);
    expect(res.body.data.meta).toMatchObject({ total: 2, page: 1 });
    const [archive, rename] = res.body.data.items;
    expect(archive).toMatchObject({
      action: AUDIT_ACTIONS.bookArchive,
      entityType: AuditEntityType.enum.book,
      entityId: book.id,
      actorId: librarian.id,
      source: 'HTTP',
    });
    expect(archive.before.archivedAt).toBeNull();
    expect(archive.after.archivedAt).not.toBeNull();
    expect(typeof archive.requestId).toBe('string');
    expect(rename).toMatchObject({
      action: AUDIT_ACTIONS.genreRename,
      before: { name: 'Audited' },
      after: { name: 'Renamed' },
    });
    expect(archive).toMatchObject({
      actor: { id: librarian.id, displayName: librarian.displayName, role: 'LIBRARIAN' },
      entityLabel: book.title,
    });
    expect(rename.entityLabel).toBe('Renamed');
  });

  it('filters by entity type and paginates', async () => {
    const client = await api().as(await createLibrarian());
    for (let i = 0; i < 3; i++) await client.post('/api/v1/genres').send({ name: `G${i}` });
    const genre = await createGenre({ name: 'Solo' });
    const book = await createBook({ genreIds: [genre.id] });
    await client.patch(`/api/v1/books/${book.id}`).send({ version: 1, title: 'Edited' });

    const genres = await client.get(`${AUDIT}?entityType=genre&pageSize=2`);
    expect(genres.body.data.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(
      genres.body.data.items.every((e: { entityType: string }) => e.entityType === 'genre')
    ).toBe(true);

    const books = await client.get(`${AUDIT}?entityType=book`);
    expect(books.body.data.items.map((e: { action: string }) => e.action)).toEqual([
      AUDIT_ACTIONS.bookUpdate,
    ]);

    expect((await client.get(`${AUDIT}?entityType=planet`)).status).toBe(400);
  });

  it('names the book of a reading-list entry, even after it was removed from the list', async () => {
    const genre = await createGenre({ name: 'Shelved' });
    const book = await createBook({ genreIds: [genre.id], title: 'The Shelved Book' });
    const reader = await api().as(await createReader());
    await reader.post('/api/v1/me/reading-list').send({ bookId: book.id });
    await reader.delete(`/api/v1/me/reading-list/${book.id}`);

    const res = await (
      await api().as(await createLibrarian())
    ).get(`${AUDIT}?entityType=reading_list_entry`);
    expect(res.body.data.items.map((e: { entityLabel: string }) => e.entityLabel)).toEqual([
      'The Shelved Book',
      'The Shelved Book',
    ]);
  });

  it('takes several kinds at once (the Activity page\'s "Catalog": books and genres)', async () => {
    const client = await api().as(await createLibrarian());
    const genre = await createGenre({ name: 'Mixed' });
    const book = await createBook({ genreIds: [genre.id] });
    await client.patch(`/api/v1/books/${book.id}`).send({ version: 1, title: 'Mixed Edit' });
    await client.patch(`/api/v1/genres/${genre.id}`).send({ name: 'Mixed Renamed' });
    const reader = await api().as(await createReader());
    await reader.post('/api/v1/me/reading-list').send({ bookId: book.id });

    const res = await client.get(`${AUDIT}?entityType=book,genre`);
    const kinds = new Set(res.body.data.items.map((e: { entityType: string }) => e.entityType));
    expect([...kinds].sort()).toEqual(['book', 'genre']);
    expect((await client.get(`${AUDIT}?entityType=nope`)).status).toBe(400);
  });
});
