import { describe, expect, it } from 'vitest';
import { createHttpCatalog, createHttpClient } from './index.js';
import { Role, BookSort, ReadingState } from '@library/contracts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HTTP adapter', () => {
  it('logs in once without an Origin, then sends Bearer on every call', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init = {}) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/auth/login'))
        return json({ data: { accessToken: 'tok', user: { id: 1 } } });
      return json({ data: { items: [{ id: 12, title: 'Dune' }], meta: { total: 1 } } });
    };
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r@x',
      password: 'p',
      fetch: fetchImpl,
    });
    const catalog = createHttpCatalog(client);
    const hits = await catalog.searchBooks(
      { id: 1, role: Role.enum.READER },
      { q: 'dune', limit: 5 }
    );
    await catalog.searchBooks({ id: 1, role: Role.enum.READER }, { q: 'dune', limit: 5 });
    expect(hits).toEqual([{ id: 12, title: 'Dune' }]);
    expect(calls.filter(c => c.url.endsWith('/auth/login'))).toHaveLength(1);
    const login = calls[0]!;
    expect(new Headers(login.init.headers).get('origin')).toBeNull();
    const search = calls[1]!;
    expect(search.url).toBe('http://api.test/api/v1/books?q=dune&pageSize=5&page=1');
    expect(new Headers(search.init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('maps every catalog port method to its REST route, and a missing book to null', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json({ data: { accessToken: 'tok' } });
      calls.push(`${init.method ?? 'GET'} ${url.replace('http://api.test/api/v1', '')}`);
      if (url.endsWith('/books/404'))
        return json({ error: { code: 'NOT_FOUND', message: 'no' } }, 404);
      if (url.endsWith('/books/500'))
        return json({ error: { code: 'INTERNAL', message: 'boom' } }, 500);
      return json({ data: { ok: url } });
    };
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r',
      password: 'p',
      fetch: fetchImpl,
    });
    const catalog = createHttpCatalog(client);
    const actor = { id: 1, role: 'READER' } as const;
    await catalog.searchBooks(actor, {
      genre: ['fantasy', 'poetry'],
      yearFrom: 1990,
      yearTo: 1999,
      sort: BookSort.enum.rating,
      limit: 3,
    });
    expect(await catalog.getBook(actor, 7)).toEqual({ ok: 'http://api.test/api/v1/books/7' });
    expect(await catalog.getBook(actor, 404)).toBeNull();
    await expect(catalog.getBook(actor, 500)).rejects.toMatchObject({ status: 500 });
    await catalog.listGenres(actor);
    await catalog.getShelf(actor);
    await catalog.getFavoriteGenres(actor);
    await catalog.addToReadingList(actor, { bookId: 7, state: ReadingState.enum.WANT_TO_READ });
    await catalog.updateReadingState(actor, 7, ReadingState.enum.READING);
    await catalog.removeFromReadingList(actor, 7);
    await expect(catalog.listBooksForEmbedding()).rejects.toThrow(/server-side only/);
    expect(calls).toEqual([
      'GET /books?genre=fantasy&genre=poetry&yearFrom=1990&yearTo=1999&sort=rating&pageSize=3&page=1',
      'GET /books/7',
      'GET /books/404',
      'GET /books/500',
      'GET /genres',
      'GET /me/reading-list',
      'GET /me/favorite-genres',
      'POST /me/reading-list',
      'PATCH /me/reading-list/7',
      'DELETE /me/reading-list/7',
    ]);
  });

  it('an expired access token (401) logs in again once and retries; a second 401 is an error', async () => {
    let logins = 0;
    let searches = 0;
    const fetchImpl: typeof fetch = async input => {
      if (String(input).endsWith('/auth/login'))
        return json({ data: { accessToken: `tok-${++logins}` } });
      searches += 1;
      if (searches === 1)
        return json({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, 401);
      if (searches === 2) return json({ data: { items: [], meta: {} } });
      return json({ error: { code: 'UNAUTHENTICATED', message: 'nope' } }, 401);
    };
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r',
      password: 'p',
      fetch: fetchImpl,
    });
    const catalog = createHttpCatalog(client);
    expect(
      await catalog.searchBooks({ id: 1, role: Role.enum.READER }, { q: 'dune', limit: 5 })
    ).toEqual([]);
    expect(logins).toBe(2);
    await expect(
      catalog.searchBooks({ id: 1, role: Role.enum.READER }, { q: 'dune', limit: 5 })
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws an error carrying the API error code', async () => {
    const fetchImpl: typeof fetch = async input =>
      String(input).endsWith('/auth/login')
        ? json({ data: { accessToken: 'tok' } })
        : json({ error: { code: 'AI_UNAVAILABLE', message: 'down' } }, 503);
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r',
      password: 'p',
      fetch: fetchImpl,
    });
    await expect(client.post('/ai/search/parse', { text: 'x' })).rejects.toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
    });
  });
});
