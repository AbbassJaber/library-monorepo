import { describe, expect, it } from 'vitest';
import {
  book,
  createFakePorts,
  createFakeState,
  externalRecord,
  genre,
  librarian,
  reader,
} from '../testing/index.js';
import { catalogTools } from './catalogTools.js';
import { createToolRegistry } from './registry.js';

const setup = () => {
  const state = createFakeState({
    books: [book(1, { title: 'Dune' })],
    genres: [genre(1, 'Fantasy')],
    lookup: [externalRecord()],
  });
  const ports = createFakePorts(state);
  const registry = createToolRegistry(catalogTools);
  const call = (actor: typeof reader, name: string, input: unknown) =>
    registry.call({ actor, ports, requestId: null }, name, input);
  return { call, state };
};

describe('catalog tools', () => {
  it('every tool input schema is an object schema at the root (providers refuse a $ref root)', () => {
    const registry = createToolRegistry(catalogTools);
    for (const spec of registry.specs(librarian)) {
      expect(spec.inputSchema['type'], spec.name).toBe('object');
      expect(spec.inputSchema['$ref'], spec.name).toBeUndefined();
    }
    expect(registry.toJsonSchema('draftBook')['properties']).toHaveProperty('isbn');
  });

  it('searchBooks searches by meaning for plain text when the runtime can, lexically for filters', async () => {
    const ports = createFakePorts(createFakeState({ books: [book(1, { title: 'Dune' })] }));
    const registry = createToolRegistry(catalogTools);
    const asked: unknown[] = [];
    const search = async (input: unknown) => {
      asked.push(input);
      return [];
    };
    const ctx = { actor: reader, ports, requestId: null, search };
    expect(await registry.call(ctx, 'searchBooks', { q: 'desert planet', limit: 3 })).toEqual([]);
    expect(asked).toEqual([{ q: 'desert planet', limit: 3 }]);
    const filtered = await registry.call(ctx, 'searchBooks', {
      q: 'dune',
      sort: 'title',
      limit: 3,
    });
    expect((filtered as Array<{ id: number }>).map(b => b.id)).toEqual([1]);
    expect(asked).toHaveLength(1);
  });

  it('searchBooks honours a language, by meaning (results narrowed) and lexically (filtered)', async () => {
    const books = [
      book(1, { title: 'Dune', language: 'en' }),
      book(2, { title: 'Le Petit Prince', language: 'fr' }),
      book(3, { title: 'Les Misérables', language: 'fr' }),
    ];
    const ports = createFakePorts(createFakeState({ books }));
    const registry = createToolRegistry(catalogTools);
    const search = async () =>
      books.map(({ synopsis: _s, isbn: _i, version: _v, updatedAt: _u, ...b }) => b);
    const ctx = { actor: reader, ports, requestId: null, search };
    const byMeaning = await registry.call(ctx, 'searchBooks', {
      q: 'a short novel',
      language: ['fr'],
      limit: 5,
    });
    expect((byMeaning as Array<{ id: number }>).map(b => b.id)).toEqual([2, 3]);
    const plain = await registry.call(ctx, 'searchBooks', { language: ['fr'], sort: 'title' });
    expect((plain as Array<{ id: number }>).map(b => b.id)).toEqual([2, 3]);
  });

  it('prepare validates and role-gates without running the tool', async () => {
    const { state } = setup();
    const registry = createToolRegistry(catalogTools);
    expect(registry.prepare({ actor: reader }, 'addToReadingList', { bookId: 1 }).input).toEqual({
      bookId: 1,
      state: 'WANT_TO_READ',
    });
    expect(state.shelf.size).toBe(0);
    expect(() =>
      registry.prepare({ actor: reader }, 'draftBook', { isbn: '9780441172719' })
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => registry.prepare({ actor: reader }, 'addToReadingList', { bookId: 'x' })).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('getBook returns the book and fails for unknown ids', async () => {
    const { call } = setup();
    expect(await call(reader, 'getBook', { bookId: 1 })).toMatchObject({
      id: 1,
      synopsis: 'Synopsis of book 1.',
    });
    await expect(call(reader, 'getBook', { bookId: 99 })).rejects.toThrow(/not found/);
  });

  it('listGenres, addToReadingList and updateReadingState go through the port with the actor', async () => {
    const { call, state } = setup();
    expect(await call(reader, 'listGenres', {})).toEqual([
      expect.objectContaining({ slug: 'fantasy' }),
    ]);
    const entry = (await call(reader, 'addToReadingList', { bookId: 1 })) as {
      id: number;
      state: string;
    };
    expect(entry.state).toBe('WANT_TO_READ');
    expect(state.shelf.get(reader.id)).toHaveLength(1);
    const updated = (await call(reader, 'updateReadingState', {
      bookId: 1,
      state: 'FINISHED',
    })) as { state: string };
    expect(updated.state).toBe('FINISHED');
  });

  it('draftBook builds the lookup-only draft: lookup values, then what was typed, else empty', async () => {
    const { call } = setup();
    const draft = (await call(librarian, 'draftBook', { title: 'Dune', author: 'Herbert' })) as {
      author: { value: string };
      coverUrl: { source: string };
      lookupSource: string;
    };
    expect(draft.author.value).toBe('Frank Herbert');
    expect(draft.coverUrl.source).toBe('empty');
    expect(draft.lookupSource).toBe('fixture');
    const none = (await call(librarian, 'draftBook', { title: 'Nothing here' })) as {
      lookupSource: string | null;
      title: { source: string };
    };
    expect(none.lookupSource).toBeNull();
    expect(none.title).toEqual({ value: 'Nothing here', source: 'input', confidence: 1 });
  });
});
