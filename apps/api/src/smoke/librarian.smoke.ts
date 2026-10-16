import { describe, expect, it } from 'vitest';
import { DEMO, cleanup, data, http, login, name, registerReader } from './smoke.setup.js';

interface Genre {
  id: number;
  name: string;
  slug: string;
  archivedAt: string | null;
}
interface Book {
  id: number;
  title: string;
  version: number;
  isbn: string | null;
  archivedAt: string | null;
  genres: Array<{ id: number }>;
}

describe('librarian: genres and books', () => {
  it('create genre → create book → edit with version → stale version refused → archive rules', async () => {
    const librarian = await login(DEMO.librarian);
    const genre = await http<Genre>('/genres', {
      method: 'POST',
      body: { name: name('Smoke Genre') },
      token: librarian.token,
    });
    expect(genre.status).toBe(201);
    cleanup.genre(librarian, data(genre).id);

    const created = await http<Book>('/books', {
      method: 'POST',
      body: {
        title: name('Smoke Book'),
        author: 'Smoke Author',
        publishedYear: 2020,
        synopsis: 'Created by the smoke suite.',
        rating: 3.5,
        genreIds: [data(genre).id],
      },
      token: librarian.token,
    });
    expect(created.status).toBe(201);
    const book = data(created);
    cleanup.book(librarian, book.id);
    expect(book.version).toBe(1);

    const edited = await http<Book>(`/books/${book.id}`, {
      method: 'PATCH',
      body: { version: 1, title: name('Smoke Book edited') },
      token: librarian.token,
    });
    expect(edited.status).toBe(200);
    expect(data(edited).version).toBe(2);

    const stale = await http(`/books/${book.id}`, {
      method: 'PATCH',
      body: { version: 1, title: 'stale' },
      token: librarian.token,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe('VERSION_CONFLICT');

    const blocked = await http(`/genres/${data(genre).id}/archive`, {
      method: 'POST',
      token: librarian.token,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error?.code).toBe('GENRE_IN_USE');

    const archived = await http<Book>(`/books/${book.id}/archive`, {
      method: 'POST',
      body: { version: 2 },
      token: librarian.token,
    });
    expect(archived.status).toBe(200);
    expect(data(archived).archivedAt).not.toBeNull();

    const reader = await registerReader('lib-view');
    expect((await http(`/books/${book.id}`, { token: reader.token })).status).toBe(404);
    const archivedList = await http<{ items: Book[] }>(
      `/books?status=archived&q=${encodeURIComponent('Smoke Book')}`,
      { token: librarian.token }
    );
    expect(data(archivedList).items.some(b => b.id === book.id)).toBe(true);

    const restored = await http<Book>(`/books/${book.id}/restore`, {
      method: 'POST',
      body: { version: 3 },
      token: librarian.token,
    });
    expect(data(restored)).toMatchObject({ version: 4, archivedAt: null });
  });

  it('refuses a duplicate ISBN across archived books with ISBN_TAKEN', async () => {
    const librarian = await login(DEMO.librarian);
    const dune = data(
      await http<{ items: Array<{ id: number }> }>('/books?q=dune', { token: librarian.token })
    ).items[0];
    if (!dune) throw new Error('seed book Dune not found');
    const genres = data(await http<Genre[]>('/genres', { token: librarian.token }));
    const res = await http('/books', {
      method: 'POST',
      body: {
        title: name('Dupe'),
        author: 'x',
        publishedYear: 2000,
        synopsis: 's',
        genreIds: [genres[0]!.id],
        isbn: '978-0-441-17271-9',
      },
      token: librarian.token,
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ISBN_TAKEN');
    expect((res.body.error?.details as { bookId: number }).bookId).toBe(dune.id);
  });

  it('exposes the audit log to librarians only', async () => {
    const librarian = await login(DEMO.librarian);
    const audit = await http<{ items: Array<{ action: string }>; meta: { total: number } }>(
      '/audit-logs?pageSize=5',
      { token: librarian.token }
    );
    expect(audit.status).toBe(200);
    expect(data(audit).meta.total).toBeGreaterThan(0);
    const reader = await login(DEMO.reader);
    expect((await http('/audit-logs', { token: reader.token })).status).toBe(403);
  });
});
