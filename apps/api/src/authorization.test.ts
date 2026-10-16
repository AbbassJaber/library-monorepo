import { API_PREFIX, SERVICE_PATHS, apiPaths } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { api, createTestApp, createTestV1 } from './test/client.js';
import {
  createBook,
  createEntry,
  createGenre,
  createLibrarian,
  createReader,
  TEST_PASSWORD,
} from './test/factories.js';

type Actor = 'anon' | 'reader' | 'librarian';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Fixture {
  book: { id: number; version: number };
  archivedBook: { id: number; version: number };
  genre: { id: number };
  archivedGenre: { id: number };
  shelfBook: { id: number };
  self: { email: string };
  n: number;
}

interface Row {
  method: Method;
  pattern: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => object;
  expect: Record<Actor, number>;
}

let seq = 0;
const v1 = (path: string) => `${API_PREFIX}${path}`;

const rows: Row[] = [
  {
    method: 'get',
    pattern: SERVICE_PATHS.health,
    path: () => SERVICE_PATHS.health,
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: SERVICE_PATHS.ready,
    path: () => SERVICE_PATHS.ready,
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.auth.register),
    path: () => v1(apiPaths.auth.register),
    body: f => ({
      email: `matrix-${f.n}@test.local`,
      password: TEST_PASSWORD,
      displayName: 'Matrix',
    }),
    expect: { anon: 201, reader: 201, librarian: 201 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.auth.login),
    path: () => v1(apiPaths.auth.login),
    body: f => ({ email: f.self.email, password: TEST_PASSWORD }),
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.auth.refresh),
    path: () => v1(apiPaths.auth.refresh),
    body: () => ({}),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.auth.logout),
    path: () => v1(apiPaths.auth.logout),
    body: () => ({}),
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.auth.me),
    path: () => v1(apiPaths.auth.me),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'delete',
    pattern: v1(apiPaths.me),
    path: () => v1(apiPaths.me),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.books.newest),
    path: () => v1(apiPaths.books.newest),
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.books.list),
    path: () => v1(apiPaths.books.list),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.books.detail(':id')),
    path: f => v1(apiPaths.books.detail(f.book.id)),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.books.list),
    path: () => v1(apiPaths.books.list),
    body: f => ({
      title: `Matrix ${f.n}`,
      author: 'A',
      publishedYear: 2000,
      synopsis: 'S',
      rating: 4,
      genreIds: [f.genre.id],
    }),
    expect: { anon: 401, reader: 403, librarian: 201 },
  },
  {
    method: 'patch',
    pattern: v1(apiPaths.books.detail(':id')),
    path: f => v1(apiPaths.books.detail(f.book.id)),
    body: f => ({ version: f.book.version, title: `Edited ${f.n}` }),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.books.archive(':id')),
    path: f => v1(apiPaths.books.archive(f.book.id)),
    body: f => ({ version: f.book.version }),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.books.restore(':id')),
    path: f => v1(apiPaths.books.restore(f.archivedBook.id)),
    body: f => ({ version: f.archivedBook.version }),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.genres.list),
    path: () => v1(apiPaths.genres.list),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.genres.list),
    path: () => v1(apiPaths.genres.list),
    body: f => ({ name: `Matrix genre ${f.n}` }),
    expect: { anon: 401, reader: 403, librarian: 201 },
  },
  {
    method: 'patch',
    pattern: v1(apiPaths.genres.detail(':id')),
    path: f => v1(apiPaths.genres.detail(f.genre.id)),
    body: f => ({ name: `Renamed ${f.n}` }),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.genres.archive(':id')),
    path: f => v1(apiPaths.genres.archive(f.genre.id)),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.genres.restore(':id')),
    path: f => v1(apiPaths.genres.restore(f.archivedGenre.id)),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.readingList.list),
    path: () => v1(apiPaths.readingList.list),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.readingList.list),
    path: () => v1(apiPaths.readingList.list),
    body: f => ({ bookId: f.book.id }),
    expect: { anon: 401, reader: 201, librarian: 201 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.readingList.batch),
    path: () => v1(apiPaths.readingList.batch),
    body: f => ({ changes: [{ action: 'setState', bookId: f.shelfBook.id, state: 'FINISHED' }] }),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'patch',
    pattern: v1(apiPaths.readingList.entry(':bookId')),
    path: f => v1(apiPaths.readingList.entry(f.shelfBook.id)),
    body: () => ({ state: 'READING' }),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'delete',
    pattern: v1(apiPaths.readingList.entry(':bookId')),
    path: f => v1(apiPaths.readingList.entry(f.shelfBook.id)),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.favoriteGenres),
    path: () => v1(apiPaths.favoriteGenres),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'put',
    pattern: v1(apiPaths.favoriteGenres),
    path: () => v1(apiPaths.favoriteGenres),
    body: f => ({ genreIds: [f.genre.id] }),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.recommendations),
    path: () => v1(apiPaths.recommendations),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.auditLogs),
    path: () => v1(apiPaths.auditLogs),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.ai.status),
    path: () => v1(apiPaths.ai.status),
    expect: { anon: 200, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.ai.runs),
    path: () => v1(apiPaths.ai.runs),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.ai.parseSearch),
    path: () => v1(apiPaths.ai.parseSearch),
    body: () => ({ text: 'fantasy from the 90s' }),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.ai.search),
    path: () => `${v1(apiPaths.ai.search)}?q=dune`,
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.books.similar(':id')),
    path: f => v1(apiPaths.books.similar(f.book.id)),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.ai.autofill),
    path: () => v1(apiPaths.ai.autofill),
    body: () => ({ title: 'Dune', author: 'Herbert' }),
    expect: { anon: 401, reader: 403, librarian: 200 },
  },
  {
    method: 'get',
    pattern: v1(apiPaths.ai.recommendations),
    path: () => v1(apiPaths.ai.recommendations),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.ai.chat),
    path: () => v1(apiPaths.ai.chat),
    body: () => ({ messages: [{ role: 'user', content: 'books by tolkien' }] }),
    expect: { anon: 401, reader: 200, librarian: 200 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.ai.confirmAction),
    path: () => v1(apiPaths.ai.confirmAction),
    body: () => ({ token: '' }),
    expect: { anon: 401, reader: 400, librarian: 400 },
  },
  {
    method: 'post',
    pattern: v1(apiPaths.ai.cancelAction),
    path: () => v1(apiPaths.ai.cancelAction),
    body: () => ({ token: '' }),
    expect: { anon: 401, reader: 400, librarian: 400 },
  },
];

const fixture = async (actorEmail: string | null, actorId: number | null): Promise<Fixture> => {
  const n = ++seq;
  const genre = await createGenre();
  const other = await createGenre();
  const archivedGenre = await createGenre({ archivedAt: new Date() });
  const book = await createBook({ genreIds: [genre.id, other.id] });
  const archivedBook = await createBook({ genreIds: [genre.id, other.id], archivedAt: new Date() });
  const shelfBook = await createBook({ genreIds: [genre.id, other.id] });
  if (actorId !== null) await createEntry(actorId, shelfBook.id);
  const self = actorEmail ?? (await createReader()).email;
  return { book, archivedBook, genre, archivedGenre, shelfBook, self: { email: self }, n };
};

describe('authorization matrix', () => {
  const actors: Actor[] = ['anon', 'reader', 'librarian'];

  describe.each(actors)('as %s', actor => {
    it.each(rows)('$method $pattern', async row => {
      const user =
        actor === 'anon'
          ? null
          : actor === 'reader'
            ? await createReader()
            : await createLibrarian();
      const f = await fixture(user?.email ?? null, user?.id ?? null);
      const client = user === null ? await api().anonymous() : await api().as(user);
      const req = client[row.method](row.path(f));
      const res = row.body ? await req.send(row.body(f)) : await req;
      expect(
        res.status,
        `${row.method.toUpperCase()} ${row.pattern} as ${actor}: ${res.text}`
      ).toBe(row.expect[actor]);
    });
  });

  it('covers every registered route exactly once', async () => {
    const v1 = createTestV1().api;
    const registered = v1.modules
      .flatMap(mod => mod.registry.map(route => `${route.method} ${v1.prefix}${route.path}`))
      .sort();
    const covered = rows
      .filter(row => row.pattern.startsWith(API_PREFIX))
      .map(row => `${row.method} ${row.pattern}`)
      .sort();
    expect(covered).toEqual(registered);
    expect(await createTestApp()).toBeDefined();
  });
});
