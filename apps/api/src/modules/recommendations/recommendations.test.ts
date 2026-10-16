import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createEntry, createGenre, createReader } from '../../test/factories.js';

const RECS = '/api/v1/me/recommendations';
const FAVES = '/api/v1/me/favorite-genres';
const titles = (res: { body: { data: Array<{ book: { title: string } }> } }) =>
  res.body.data.map(i => i.book.title);

describe('GET /api/v1/me/recommendations ("For your shelves")', () => {
  it('is empty without favourites', async () => {
    const reader = await createReader();
    const g = await createGenre();
    await createBook({ genreIds: [g.id] });
    const res = await (await api().as(reader)).get(RECS);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns at most six active books from favourite genres, not already on the shelf', async () => {
    const reader = await createReader();
    const fantasy = await createGenre({ name: 'Fantasy' });
    const poetry = await createGenre({ name: 'Poetry' });
    for (let i = 0; i < 8; i++)
      await createBook({ title: `Fantasy ${i}`, genreIds: [fantasy.id], rating: 3 + i * 0.1 });
    await createBook({ title: 'Poem', genreIds: [poetry.id] });
    const onShelf = await createBook({ title: 'On Shelf', genreIds: [fantasy.id], rating: 5 });
    await createEntry(reader.id, onShelf.id);
    const removedFromShelf = await createBook({
      title: 'Removed Again',
      genreIds: [fantasy.id],
      rating: 4.9,
    });
    await testPrisma().readingListEntry.create({
      data: { userId: reader.id, bookId: removedFromShelf.id, removedAt: new Date() },
    });
    await createBook({
      title: 'Archived Fantasy',
      genreIds: [fantasy.id],
      rating: 5,
      archivedAt: new Date(),
    });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [fantasy.id] });

    const res = await client.get(RECS);

    expect(res.body.data).toHaveLength(6);
    expect(titles(res)).not.toContain('On Shelf');
    expect(titles(res)).not.toContain('Archived Fantasy');
    expect(titles(res)).not.toContain('Poem');
    expect(titles(res)[0]).toBe('Removed Again');
    expect(res.body.data[0].matchedGenres.map((g: { slug: string }) => g.slug)).toEqual([
      'fantasy',
    ]);
  });

  it('prefers higher-positioned favourite genres, then rating, then id', async () => {
    const reader = await createReader();
    const first = await createGenre({ name: 'First' });
    const second = await createGenre({ name: 'Second' });
    await createBook({ title: 'Second only, best rated', genreIds: [second.id], rating: 5 });
    await createBook({ title: 'First only, low rated', genreIds: [first.id], rating: 2 });
    await createBook({ title: 'Both', genreIds: [first.id, second.id], rating: 1 });
    await createBook({ title: 'First only, high rated', genreIds: [first.id], rating: 4 });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [first.id, second.id] });

    const res = await client.get(RECS);

    expect(titles(res)).toEqual([
      'Both',
      'First only, high rated',
      'First only, low rated',
      'Second only, best rated',
    ]);
    expect(res.body.data[0].matchedGenres.map((g: { slug: string }) => g.slug)).toEqual([
      'first',
      'second',
    ]);
  });

  it('ignores archived favourite genres', async () => {
    const reader = await createReader();
    const live = await createGenre({ name: 'Live' });
    const doomed = await createGenre({ name: 'Doomed' });
    await createBook({ title: 'Live Book', genreIds: [live.id] });
    await createBook({ title: 'Doomed Book', genreIds: [doomed.id] });
    const client = await api().as(reader);
    await client.put(FAVES).send({ genreIds: [doomed.id, live.id] });
    await testPrisma().genre.update({ where: { id: doomed.id }, data: { archivedAt: new Date() } });

    const res = await client.get(RECS);

    expect(titles(res)).toEqual(['Live Book']);
  });

  it('requires authentication', async () => {
    expect((await (await api().anonymous()).get(RECS)).status).toBe(401);
  });
});
