import { describe, expect, it } from 'vitest';
import { cleanup, data, http, registerReader } from './smoke.setup.js';

interface Summary {
  id: number;
  title: string;
}
interface Entry {
  id: number;
  state: string;
  available: boolean;
  book: Summary;
}

describe('reader shelf, favourites and recommendations (fresh account)', () => {
  it('add → change state → list → remove, then favourites and "For your shelves"', async () => {
    const reader = await registerReader('shelf');
    const newest = data(await http<Summary[]>('/books/newest'));
    const [first, second] = newest;
    if (!first || !second) throw new Error('need at least two newest books');
    cleanup.shelf(reader, first.id);
    cleanup.shelf(reader, second.id);

    const added = await http<Entry>('/me/reading-list', {
      method: 'POST',
      body: { bookId: first.id },
      token: reader.token,
    });
    expect(added.status).toBe(201);
    expect(data(added)).toMatchObject({ state: 'WANT_TO_READ', available: true });

    const reading = await http<Entry>(`/me/reading-list/${first.id}`, {
      method: 'PATCH',
      body: { state: 'READING' },
      token: reader.token,
    });
    expect(data(reading).state).toBe('READING');

    await http('/me/reading-list', {
      method: 'POST',
      body: { bookId: second.id, state: 'FINISHED' },
      token: reader.token,
    });
    const list = data(await http<Entry[]>('/me/reading-list', { token: reader.token }));
    expect(list.map(e => e.book.id).sort()).toEqual([first.id, second.id].sort());

    const removed = await http('/me/reading-list/' + second.id, {
      method: 'DELETE',
      token: reader.token,
    });
    expect(removed.status).toBe(200);
    expect(
      data(await http<Entry[]>('/me/reading-list', { token: reader.token })).map(e => e.book.id)
    ).toEqual([first.id]);

    const genres = data(
      await http<Array<{ id: number; slug: string }>>('/genres', { token: reader.token })
    );
    const chosen = genres.slice(0, 2).map(g => g.id);
    const faves = await http<Array<{ position: number; genre: { id: number } }>>(
      '/me/favorite-genres',
      { method: 'PUT', body: { genreIds: chosen }, token: reader.token }
    );
    expect(faves.status).toBe(200);
    expect(data(faves).map(f => f.genre.id)).toEqual(chosen);

    const recs = await http<Array<{ book: Summary; matchedGenres: Array<{ id: number }> }>>(
      '/me/recommendations',
      { token: reader.token }
    );
    expect(recs.status).toBe(200);
    expect(data(recs).length).toBeLessThanOrEqual(6);
    expect(data(recs).every(r => r.book.id !== first.id && r.matchedGenres.length > 0)).toBe(true);
  });

  it('rejects six favourite genres and an unknown book', async () => {
    const reader = await registerReader('shelf-invalid');
    expect(
      (
        await http('/me/favorite-genres', {
          method: 'PUT',
          body: { genreIds: [1, 2, 3, 4, 5, 6] },
          token: reader.token,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await http('/me/reading-list', {
          method: 'POST',
          body: { bookId: 987654 },
          token: reader.token,
        })
      ).status
    ).toBe(404);
  });
});
