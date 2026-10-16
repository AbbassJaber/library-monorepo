import { describe, expect, it } from 'vitest';
import { catalogTools } from './tools/catalogTools.js';
import { ToolError, createToolRegistry } from './tools/registry.js';
import {
  book,
  createFakePorts,
  createFakeState,
  externalRecord,
  genre,
  librarian,
  reader,
} from './testing/index.js';

const setup = () => {
  const state = createFakeState({
    books: [book(1, { title: 'Dune' }), book(2, { archivedAt: '2026-02-01T00:00:00.000Z' })],
    genres: [genre(1, 'Fantasy')],
    lookup: [externalRecord()],
  });
  const ports = createFakePorts(state);
  return { registry: createToolRegistry(catalogTools), ports };
};

describe('tool registry', () => {
  it('hides draftBook from readers (eight tools) and shows all nine to librarians', () => {
    const { registry } = setup();
    expect(registry.list(reader).map(t => t.name)).toEqual([
      'searchBooks',
      'getBook',
      'listGenres',
      'getReadingList',
      'addToReadingList',
      'updateReadingState',
      'removeFromReadingList',
      'changeReadingList',
    ]);
    expect(registry.list(librarian).map(t => t.name)).toHaveLength(9);
    expect(registry.specs(reader).map(s => s.name)).not.toContain('draftBook');
  });

  it('rejects a reader calling draftBook', async () => {
    const { registry, ports } = setup();
    await expect(
      registry.call({ actor: reader, ports, requestId: null }, 'draftBook', {
        isbn: '9780441013593',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('maps every tool error to the HTTP status the API answers with', () => {
    expect(new ToolError('FORBIDDEN', 'x').status).toBe(403);
    expect(new ToolError('UNKNOWN_TOOL', 'x').status).toBe(404);
    expect(new ToolError('INVALID_INPUT', 'x').status).toBe(400);
    expect(new ToolError('INVALID_OUTPUT', 'x').status).toBe(500);
  });

  it('rejects invalid tool input before calling the port', async () => {
    const { registry, ports } = setup();
    let searched = false;
    const spyPorts = {
      ...ports,
      catalog: {
        ...ports.catalog,
        searchBooks: async (...args: Parameters<typeof ports.catalog.searchBooks>) => {
          searched = true;
          return ports.catalog.searchBooks(...args);
        },
      },
    };
    await expect(
      registry.call({ actor: reader, ports: spyPorts, requestId: null }, 'searchBooks', {
        limit: 99,
      })
    ).rejects.toBeInstanceOf(ToolError);
    expect(searched).toBe(false);
  });

  it('runs a valid call through the port and validates the output', async () => {
    const { registry, ports } = setup();
    const hits = (await registry.call({ actor: reader, ports, requestId: null }, 'searchBooks', {
      q: 'dune',
    })) as Array<{ id: number }>;
    expect(hits.map(h => h.id)).toEqual([1]);
    const draft = (await registry.call({ actor: librarian, ports, requestId: null }, 'draftBook', {
      isbn: '978-0-441-01359-3',
    })) as { title: { value: string } };
    expect(draft.title.value).toBe('Dune');
  });

  it('produces JSON Schema for every tool input', () => {
    const { registry } = setup();
    const schema = registry.toJsonSchema('searchBooks') as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['q', 'genre', 'limit']));
    expect(() => registry.toJsonSchema('nope')).toThrow(ToolError);
  });
});
