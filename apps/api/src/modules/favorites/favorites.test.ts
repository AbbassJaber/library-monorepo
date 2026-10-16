import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createGenre, createLibrarian, createReader } from '../../test/factories.js';

const FAVES = '/api/v1/me/favorite-genres';
const slugs = (res: { body: { data: Array<{ genre: { slug: string }; position: number }> } }) =>
  res.body.data.map(f => `${f.position}:${f.genre.slug}`);

describe('PUT /api/v1/me/favorite-genres', () => {
  it('keeps order: position is the index in the submitted list', async () => {
    const reader = await createReader();
    const a = await createGenre({ name: 'Alpha' });
    const b = await createGenre({ name: 'Beta' });
    const c = await createGenre({ name: 'Gamma' });
    const client = await api().as(reader);

    const res = await client.put(FAVES).send({ genreIds: [c.id, a.id, b.id] });

    expect(res.status).toBe(200);
    expect(slugs(res)).toEqual(['0:gamma', '1:alpha', '2:beta']);
    expect(slugs(await client.get(FAVES))).toEqual(['0:gamma', '1:alpha', '2:beta']);
  });

  it('rejects six genres', async () => {
    const client = await api().as(await createReader());
    const res = await client.put(FAVES).send({ genreIds: [1, 2, 3, 4, 5, 6] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an archived or unknown genre', async () => {
    const client = await api().as(await createReader());
    const archived = await createGenre({ name: 'Old', archivedAt: new Date() });
    const res = await client.put(FAVES).send({ genreIds: [archived.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe('body.genreIds');
    expect((await client.put(FAVES).send({ genreIds: [9999] })).status).toBe(400);
  });

  it('dropped favourites get removedAt, not deleted; positions are rewritten', async () => {
    const reader = await createReader();
    const a = await createGenre({ name: 'Alpha' });
    const b = await createGenre({ name: 'Beta' });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [a.id, b.id] });

    const res = await client.put(FAVES).send({ genreIds: [b.id] });

    expect(slugs(res)).toEqual(['0:beta']);
    const rows = await testPrisma().favoriteGenre.findMany({
      where: { userId: reader.id },
      orderBy: { genreId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.genreId === a.id)?.removedAt).not.toBeNull();
    expect(rows.find(r => r.genreId === b.id)).toMatchObject({ position: 0, removedAt: null });
  });

  it('re-selecting a removed favourite reactivates the same row', async () => {
    const reader = await createReader();
    const a = await createGenre({ name: 'Alpha' });
    const b = await createGenre({ name: 'Beta' });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [a.id, b.id] });
    const original = await testPrisma().favoriteGenre.findFirstOrThrow({
      where: { userId: reader.id, genreId: a.id },
    });
    await client.put(FAVES).send({ genreIds: [b.id] });

    await client.put(FAVES).send({ genreIds: [b.id, a.id] });

    const rows = await testPrisma().favoriteGenre.findMany({ where: { userId: reader.id } });
    expect(rows).toHaveLength(2);
    const reactivated = rows.find(r => r.genreId === a.id);
    expect(reactivated?.id).toBe(original.id);
    expect(reactivated).toMatchObject({ position: 1, removedAt: null });
  });

  it('an empty list clears the favourites', async () => {
    const reader = await createReader();
    const a = await createGenre({ name: 'Alpha' });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [a.id] });
    const res = await client.put(FAVES).send({ genreIds: [] });
    expect(res.body.data).toEqual([]);
  });

  it('writes an audit row', async () => {
    const reader = await createReader();
    const a = await createGenre({ name: 'Alpha' });
    await (await api().as(reader)).put(FAVES).send({ genreIds: [a.id] });
    const audit = await testPrisma().auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.favoritesSet },
    });
    expect(audit).toMatchObject({
      actorId: reader.id,
      entityType: AuditEntityType.enum.favorite_genre,
      entityId: reader.id,
    });
  });
});

describe('a favourite genre archived later', () => {
  it('disappears from the list and PUT with its id is rejected', async () => {
    const reader = await createReader();
    const librarian = await createLibrarian();
    const keep = await createGenre({ name: 'Keep' });
    const doomed = await createGenre({ name: 'Doomed' });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [doomed.id, keep.id] });

    const archive = await (await api().as(librarian)).post(`/api/v1/genres/${doomed.id}/archive`);
    expect(archive.status).toBe(200);

    expect(slugs(await client.get(FAVES))).toEqual(['1:keep']);
    const put = await client.put(FAVES).send({ genreIds: [doomed.id, keep.id] });
    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe('VALIDATION_ERROR');
    expect(
      await testPrisma().favoriteGenre.count({ where: { userId: reader.id, genreId: doomed.id } })
    ).toBe(1);
  });
});
