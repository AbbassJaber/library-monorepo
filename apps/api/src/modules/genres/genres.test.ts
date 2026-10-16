import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createLibrarian, createReader } from '../../test/factories.js';

describe('GET /api/v1/genres', () => {
  it('lists active genres alphabetically with their active book count', async () => {
    const reader = await createReader();
    const fantasy = await createGenre({ name: 'Fantasy' });
    const poetry = await createGenre({ name: 'Poetry' });
    await createBook({ genreIds: [fantasy.id] });
    await createBook({ genreIds: [fantasy.id], archivedAt: new Date() });

    const res = await (await api().as(reader)).get('/api/v1/genres');

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((g: { name: string; activeBookCount: number }) => [
        g.name,
        g.activeBookCount,
      ])
    ).toEqual([
      ['Fantasy', 1],
      ['Poetry', 0],
    ]);
    expect(poetry.slug).toBe('poetry');
  });

  it('hides archived genres from readers and refuses includeArchived for them', async () => {
    const reader = await createReader();
    await createGenre({ name: 'Visible' });
    await createGenre({ name: 'Hidden', archivedAt: new Date() });

    const plain = await (await api().as(reader)).get('/api/v1/genres');
    expect(plain.body.data.map((g: { name: string }) => g.name)).toEqual(['Visible']);

    const withArchived = await (await api().as(reader)).get('/api/v1/genres?includeArchived=true');
    expect(withArchived.status).toBe(403);
    expect(withArchived.body.error.code).toBe('FORBIDDEN');
  });

  it('shows archived genres to librarians on request', async () => {
    const librarian = await createLibrarian();
    await createGenre({ name: 'Visible' });
    await createGenre({ name: 'Hidden', archivedAt: new Date() });

    const res = await (await api().as(librarian)).get('/api/v1/genres?includeArchived=true');
    expect(
      res.body.data.map((g: { name: string; archivedAt: string | null }) => [
        g.name,
        g.archivedAt !== null,
      ])
    ).toEqual([
      ['Hidden', true],
      ['Visible', false],
    ]);
  });

  it('requires authentication', async () => {
    const res = await (await api().anonymous()).get('/api/v1/genres');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/v1/genres', () => {
  it('creates a genre with a unique slug derived from the name', async () => {
    const librarian = await createLibrarian();
    const res = await (
      await api().as(librarian)
    )
      .post('/api/v1/genres')
      .send({ name: '  Science Fiction ' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Science Fiction',
      slug: 'science-fiction',
      archivedAt: null,
      activeBookCount: 0,
    });
  });

  it('answers 409 on a duplicate name, case-insensitively', async () => {
    const librarian = await createLibrarian();
    await createGenre({ name: 'Poetry' });
    const res = await (await api().as(librarian)).post('/api/v1/genres').send({ name: 'poetry' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('is refused for readers with 403', async () => {
    const reader = await createReader();
    const res = await (await api().as(reader)).post('/api/v1/genres').send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown field', async () => {
    const librarian = await createLibrarian();
    const res = await (
      await api().as(librarian)
    )
      .post('/api/v1/genres')
      .send({ name: 'Ok', slug: 'forced' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('writes an audit log row', async () => {
    const librarian = await createLibrarian();
    await (await api().as(librarian)).post('/api/v1/genres').send({ name: 'Audited' });
    const rows = await testPrisma().auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: librarian.id,
      action: AUDIT_ACTIONS.genreCreate,
      entityType: AuditEntityType.enum.genre,
      source: 'HTTP',
    });
    expect(rows[0]?.requestId).toBeTruthy();
  });
});

describe('PATCH /api/v1/genres/:id', () => {
  it('renames a genre and regenerates its slug', async () => {
    const librarian = await createLibrarian();
    const genre = await createGenre({ name: 'Old Name' });
    const res = await (
      await api().as(librarian)
    )
      .patch(`/api/v1/genres/${genre.id}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'New Name', slug: 'new-name' });
  });

  it('answers 404 for an unknown genre', async () => {
    const librarian = await createLibrarian();
    const res = await (await api().as(librarian)).patch('/api/v1/genres/999').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('archive and restore', () => {
  it('archives a genre nobody depends on and hides it from readers', async () => {
    const librarian = await createLibrarian();
    const reader = await createReader();
    const genre = await createGenre({ name: 'Ephemeral' });

    const res = await (await api().as(librarian)).post(`/api/v1/genres/${genre.id}/archive`);
    expect(res.status).toBe(200);
    expect(res.body.data.archivedAt).not.toBeNull();

    const list = await (await api().as(reader)).get('/api/v1/genres');
    expect(list.body.data).toEqual([]);
  });

  it('refuses to archive the only active genre of an active book', async () => {
    const librarian = await createLibrarian();
    const only = await createGenre({ name: 'Only' });
    const archivedGenre = await createGenre({ name: 'Gone', archivedAt: new Date() });
    const book = await createBook({ title: 'Lonely Book', genreIds: [only.id, archivedGenre.id] });

    const res = await (await api().as(librarian)).post(`/api/v1/genres/${only.id}/archive`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GENRE_IN_USE');
    expect(res.body.error.details).toEqual({
      genreId: only.id,
      books: [{ id: book.id, title: 'Lonely Book' }],
    });
  });

  it('allows archiving a genre when every book has another active genre', async () => {
    const librarian = await createLibrarian();
    const a = await createGenre({ name: 'A' });
    const b = await createGenre({ name: 'B' });
    await createBook({ genreIds: [a.id, b.id] });

    const res = await (await api().as(librarian)).post(`/api/v1/genres/${a.id}/archive`);
    expect(res.status).toBe(200);
  });

  it('ignores archived books when applying the rule', async () => {
    const librarian = await createLibrarian();
    const only = await createGenre({ name: 'Only' });
    await createBook({ genreIds: [only.id], archivedAt: new Date() });

    const res = await (await api().as(librarian)).post(`/api/v1/genres/${only.id}/archive`);
    expect(res.status).toBe(200);
  });

  it('restores an archived genre', async () => {
    const librarian = await createLibrarian();
    const genre = await createGenre({ name: 'Back', archivedAt: new Date() });
    const res = await (await api().as(librarian)).post(`/api/v1/genres/${genre.id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.data.archivedAt).toBeNull();
  });

  it('archiving twice is a conflict', async () => {
    const librarian = await createLibrarian();
    const genre = await createGenre({ name: 'Twice', archivedAt: new Date() });
    const res = await (await api().as(librarian)).post(`/api/v1/genres/${genre.id}/archive`);
    expect(res.status).toBe(409);
  });
});
