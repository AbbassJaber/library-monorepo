import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  book,
  createFakePorts,
  createFakeState,
  externalRecord,
  librarian,
  reader,
} from '@library/ai/testing';
import { describe, expect, it } from 'vitest';
import { createLibraryMcpServer } from './tools.js';

const connect = async (actor: typeof reader) => {
  const state = createFakeState({
    books: [
      book(1, { title: 'The Hobbit', author: 'J. R. R. Tolkien' }),
      book(12, { title: 'Dune', author: 'Frank Herbert' }),
    ],
    lookup: [externalRecord()],
  });
  const ports = createFakePorts(state);
  const server = createLibraryMcpServer({ actor, ports });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { client, state };
};

describe('MCP server', () => {
  it('lists the registry tools for the account role: 8 for a reader, 9 with draftBook for a librarian', async () => {
    const asReader = await connect(reader);
    const readerTools = (await asReader.client.listTools()).tools;
    expect(readerTools.map(t => t.name)).toEqual([
      'searchBooks',
      'getBook',
      'listGenres',
      'getReadingList',
      'addToReadingList',
      'updateReadingState',
      'removeFromReadingList',
      'changeReadingList',
    ]);
    const asLibrarian = await connect(librarian);
    const librarianTools = (await asLibrarian.client.listTools()).tools;
    expect(librarianTools).toHaveLength(9);
    expect(librarianTools.map(t => t.name)).toContain('draftBook');
    const add = readerTools.find(t => t.name === 'addToReadingList')!;
    expect(add.inputSchema).toMatchObject({
      type: 'object',
      properties: { bookId: expect.any(Object) },
    });
    expect(add.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(readerTools.find(t => t.name === 'removeFromReadingList')!.annotations).toMatchObject({
      destructiveHint: true,
    });
    expect(readerTools.find(t => t.name === 'changeReadingList')!.annotations).toMatchObject({
      destructiveHint: true,
    });
    expect(readerTools.find(t => t.name === 'searchBooks')!.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(readerTools.find(t => t.name === 'getReadingList')!.annotations).toMatchObject({
      readOnlyHint: true,
    });
  });

  it('runs a tool through the registry and returns its result as text and structured content', async () => {
    const { client } = await connect(reader);
    const result = await client.callTool({
      name: 'searchBooks',
      arguments: { q: 'dune', limit: 3 },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      results: [expect.objectContaining({ id: 12, title: 'Dune' })],
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(JSON.parse(text)).toMatchObject([{ id: 12 }]);
  });

  it('a reader calling draftBook gets a tool error (FORBIDDEN), not a crash; bad input is a tool error too', async () => {
    const { client } = await connect(reader);
    const forbidden = await client.callTool({
      name: 'draftBook',
      arguments: { isbn: '9780441172719' },
    });
    expect(forbidden.isError).toBe(true);
    expect((forbidden.content as Array<{ text: string }>)[0]!.text).toMatch(/^FORBIDDEN/);
    const invalid = await client.callTool({ name: 'getBook', arguments: { bookId: 'x' } });
    expect(invalid.isError).toBe(true);
    expect((invalid.content as Array<{ text: string }>)[0]!.text).toMatch(/^INVALID_INPUT/);
    expect((await client.listTools()).tools).toHaveLength(8);
  });

  it('a librarian drafts from the lookup; a change runs as the account, under the host’s approval', async () => {
    const lib = await connect(librarian);
    const draft = await lib.client.callTool({
      name: 'draftBook',
      arguments: { isbn: externalRecord().isbn },
    });
    expect(draft.isError).toBeFalsy();
    expect(draft.structuredContent).toMatchObject({ title: { source: 'lookup' } });
    const r = await connect(reader);
    const added = await r.client.callTool({ name: 'addToReadingList', arguments: { bookId: 1 } });
    expect(added.isError).toBeFalsy();
    expect(r.state.shelf.get(reader.id)?.map(e => e.book.id)).toEqual([1]);
  });
});
