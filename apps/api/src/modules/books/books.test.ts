import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createLibrarian, createReader } from '../../test/factories.js';

const validBody = async () => {
  const genre = await createGenre({ name: 'Fantasy' });
  return {
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    publishedYear: 1937,
    synopsis: 'A hobbit goes there and back again.',
    rating: 4.7,
    genreIds: [genre.id],
  };
};

describe('GET /api/v1/books/newest', () => {
  it('returns exactly six active books, newest first, without authentication', async () => {
    const genre = await createGenre();
    for (let i = 0; i < 8; i++) {
      await createBook({
        title: `Book ${i}`,
        genreIds: [genre.id],
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      });
    }
    await createBook({
      title: 'Archived newest',
      genreIds: [genre.id],
      createdAt: new Date(Date.UTC(2026, 1, 1)),
      archivedAt: new Date(),
    });

    const res = await (await api().anonymous()).get('/api/v1/books/newest');

    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual([
      'Book 7',
      'Book 6',
      'Book 5',
      'Book 4',
      'Book 3',
      'Book 2',
    ]);
    expect(res.body.data[0]).not.toHaveProperty('synopsis');
  });
});

describe('GET /api/v1/books/:id', () => {
  it('returns the full book with its active genres and a numeric rating', async () => {
    const reader = await createReader();
    const active = await createGenre({ name: 'Active' });
    const archived = await createGenre({ name: 'Archived', archivedAt: new Date() });
    const book = await createBook({
      title: 'Dune',
      genreIds: [active.id, archived.id],
      rating: 4.6,
      isbn: '9780441172719',
    });

    const res = await (await api().as(reader)).get(`/api/v1/books/${book.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: book.id,
      title: 'Dune',
      rating: 4.6,
      version: 1,
      isbn: '9780441172719',
      archivedAt: null,
    });
    expect(res.body.data.genres.map((g: { slug: string }) => g.slug)).toEqual(['active']);
    expect(typeof res.body.data.rating).toBe('number');
  });

  it('is 404 for readers when the book is archived, but visible to librarians', async () => {
    const reader = await createReader();
    const librarian = await createLibrarian();
    const book = await createBook({ archivedAt: new Date() });

    expect((await (await api().as(reader)).get(`/api/v1/books/${book.id}`)).status).toBe(404);
    const res = await (await api().as(librarian)).get(`/api/v1/books/${book.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.archivedAt).not.toBeNull();
  });

  it('requires authentication', async () => {
    const book = await createBook();
    expect((await (await api().anonymous()).get(`/api/v1/books/${book.id}`)).status).toBe(401);
  });
});

describe('POST /api/v1/books', () => {
  it('creates a book with version 1 and writes an audit row', async () => {
    const librarian = await createLibrarian();
    const body = await validBody();

    const res = await (
      await api().as(librarian)
    )
      .post('/api/v1/books')
      .send({ ...body, isbn: '978-0-618-26030-0' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'The Hobbit',
      version: 1,
      isbn: '9780618260300',
      rating: 4.7,
    });
    expect(res.body.data.genres).toHaveLength(1);
    const audit = await testPrisma().auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.bookCreate },
    });
    expect(audit).toMatchObject({
      actorId: librarian.id,
      entityType: AuditEntityType.enum.book,
      entityId: res.body.data.id,
    });
  });

  it('refuses readers with 403', async () => {
    const reader = await createReader();
    const res = await (await api().as(reader)).post('/api/v1/books').send(await validBody());
    expect(res.status).toBe(403);
  });

  it('rejects an archived or unknown genre id', async () => {
    const librarian = await createLibrarian();
    const body = await validBody();
    const archived = await createGenre({ name: 'Old', archivedAt: new Date() });
    const res = await (
      await api().as(librarian)
    )
      .post('/api/v1/books')
      .send({ ...body, genreIds: [archived.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const unknown = await (
      await api().as(librarian)
    )
      .post('/api/v1/books')
      .send({ ...body, genreIds: [9999] });
    expect(unknown.status).toBe(400);
  });

  it('creating a book with the ISBN of an archived book returns 409 ISBN_TAKEN with the archived book id', async () => {
    const librarian = await createLibrarian();
    const existing = await createBook({ isbn: '9780441172719', archivedAt: new Date() });
    const body = await validBody();

    const res = await (
      await api().as(librarian)
    )
      .post('/api/v1/books')
      .send({ ...body, isbn: '978-0-441-17271-9' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ISBN_TAKEN');
    expect(res.body.error.details).toEqual({ bookId: existing.id, archived: true });
  });
});

describe('PATCH /api/v1/books/:id', () => {
  it('increments version on update and replaces the genres', async () => {
    const librarian = await createLibrarian();
    const a = await createGenre({ name: 'A' });
    const b = await createGenre({ name: 'B' });
    const book = await createBook({ genreIds: [a.id] });

    const res = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ version: 1, title: 'Renamed', genreIds: [b.id] });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Renamed', version: 2 });
    expect(res.body.data.genres.map((g: { id: number }) => g.id)).toEqual([b.id]);
    const audit = await testPrisma().auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.bookUpdate },
    });
    expect(audit?.before).toMatchObject({ title: book.title });
    expect(audit?.after).toMatchObject({ title: 'Renamed' });
  });

  it('rejects a stale version with 409 VERSION_CONFLICT and the current book', async () => {
    const librarian = await createLibrarian();
    const book = await createBook({ title: 'Current title' });
    await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ version: 1, title: 'First edit' });

    const stale = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ version: 1, title: 'Second edit' });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.current).toMatchObject({ title: 'First edit', version: 2 });
  });

  it('applies the ISBN rule on update but allows keeping its own ISBN', async () => {
    const librarian = await createLibrarian();
    const other = await createBook({ isbn: '9780451524935' });
    const book = await createBook({ isbn: '9780441172719' });

    const same = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ version: 1, isbn: '9780441172719' });
    expect(same.status).toBe(200);

    const taken = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ version: 2, isbn: '9780451524935' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.details).toEqual({ bookId: other.id, archived: false });
  });

  it('requires the version field', async () => {
    const librarian = await createLibrarian();
    const book = await createBook();
    const res = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${book.id}`)
      .send({ title: 'No version' });
    expect(res.status).toBe(400);
  });
});

describe('archive and restore', () => {
  it('archives with the current version and bumps it', async () => {
    const librarian = await createLibrarian();
    const reader = await createReader();
    const book = await createBook();

    const res = await (
      await api().as(librarian)
    )
      .post(`/api/v1/books/${book.id}/archive`)
      .send({ version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.archivedAt).not.toBeNull();
    expect((await (await api().as(reader)).get(`/api/v1/books/${book.id}`)).status).toBe(404);
  });

  it('only one of two concurrent archives with the same version succeeds', async () => {
    const librarian = await createLibrarian();
    const book = await createBook();
    const client = await api().as(librarian);

    const [first, second] = await Promise.all([
      client.post(`/api/v1/books/${book.id}/archive`).send({ version: 1 }),
      client.post(`/api/v1/books/${book.id}/archive`).send({ version: 1 }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(
      await testPrisma().auditLog.count({ where: { action: AUDIT_ACTIONS.bookArchive } })
    ).toBe(1);
  });

  it('restore bumps version and clears archivedAt', async () => {
    const librarian = await createLibrarian();
    const book = await createBook({ archivedAt: new Date(), version: 3 });

    const res = await (
      await api().as(librarian)
    )
      .post(`/api/v1/books/${book.id}/restore`)
      .send({ version: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ version: 4, archivedAt: null });
  });

  it('restoring an active book is a conflict', async () => {
    const librarian = await createLibrarian();
    const book = await createBook();
    const res = await (
      await api().as(librarian)
    )
      .post(`/api/v1/books/${book.id}/restore`)
      .send({ version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('audit log row written for every librarian write', async () => {
    const librarian = await createLibrarian();
    const body = await validBody();
    const created = await (await api().as(librarian)).post('/api/v1/books').send(body);
    const id = created.body.data.id;
    await (
      await api().as(librarian)
    )
      .patch(`/api/v1/books/${id}`)
      .send({ version: 1, title: 'Edited' });
    await (await api().as(librarian)).post(`/api/v1/books/${id}/archive`).send({ version: 2 });
    await (await api().as(librarian)).post(`/api/v1/books/${id}/restore`).send({ version: 3 });

    const actions = (await testPrisma().auditLog.findMany({ orderBy: { id: 'asc' } })).map(
      row => row.action
    );
    expect(actions).toEqual([
      AUDIT_ACTIONS.bookCreate,
      AUDIT_ACTIONS.bookUpdate,
      AUDIT_ACTIONS.bookArchive,
      AUDIT_ACTIONS.bookRestore,
    ]);
  });
});

describe('book language', () => {
  it('is on every read, filters the list (one or several), and is set by librarians', async () => {
    const genre = await createGenre({ name: 'Languages' });
    const fr = await createBook({ genreIds: [genre.id], title: 'Le Livre', language: 'fr' });
    const ar = await createBook({ genreIds: [genre.id], title: 'الكتاب', language: 'ar' });
    await createBook({ genreIds: [genre.id], title: 'The Book', language: 'en' });
    await createBook({ genreIds: [genre.id], title: 'Unknown', language: null });
    const reader = await api().as(await createReader());

    const one = await reader.get(`/api/v1/books?language=fr&genre=${genre.slug}`);
    expect(one.body.data.items.map((b: { title: string }) => b.title)).toEqual(['Le Livre']);
    expect(one.body.data.items[0].language).toBe('fr');
    const two = await reader.get(`/api/v1/books?language=fr,ar&genre=${genre.slug}&sort=title`);
    expect(two.body.data.items.map((b: { id: number }) => b.id).sort()).toEqual(
      [fr.id, ar.id].sort()
    );
    expect((await reader.get('/api/v1/books?language=french!')).status).toBe(400);
    expect((await reader.get(`/api/v1/books/${ar.id}`)).body.data.language).toBe('ar');

    const librarian = await api().as(await createLibrarian());
    const created = await librarian.post('/api/v1/books').send({
      title: 'Nouveau',
      author: 'Quelqu’un',
      publishedYear: 2020,
      synopsis: 'Un livre.',
      language: 'FR',
      genreIds: [genre.id],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.language).toBe('fr');
    const cleared = await librarian
      .patch(`/api/v1/books/${created.body.data.id}`)
      .send({ version: 1, language: null });
    expect(cleared.body.data.language).toBeNull();
  });
});
