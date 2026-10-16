#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';

const api = process.argv[2] ?? 'http://localhost:4000';
const server = join(import.meta.dirname, '../dist/server.js');
const as = async who => {
  const client = new Client({ name: 'library-mcp-smoke', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      env: {
        PATH: process.env.PATH ?? '',
        LIBRARY_API_URL: api,
        LIBRARY_EMAIL: `${who}@library.local`,
        LIBRARY_PASSWORD: 'Password123!',
        LIBRARY_LOOKUP: 'fixture',
      },
      stderr: 'ignore',
    })
  );
  return client;
};
const text = result => result.content?.[0]?.text ?? '';
let failed = false;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

for (const [who, expected] of [
  ['reader', 8],
  ['librarian', 9],
]) {
  const client = await as(who);
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  check(`${who} sees ${expected} tools`, tools.length === expected, tools.join(', '));
  const search = await client.callTool({
    name: 'searchBooks',
    arguments: { q: 'tolkien', limit: 3 },
  });
  check(
    `${who} searchBooks`,
    !search.isError,
    (search.structuredContent?.results ?? []).map(b => b.title).join(', ')
  );
  const list = await client.callTool({ name: 'getReadingList', arguments: {} });
  check(
    `${who} getReadingList`,
    !list.isError,
    `${(list.structuredContent?.results ?? []).length} entries`
  );
  const draft = await client.callTool({ name: 'draftBook', arguments: { isbn: '9780441172719' } });
  if (who === 'reader')
    check(
      'reader draftBook is a tool error',
      draft.isError === true && /^FORBIDDEN/.test(text(draft)),
      text(draft)
    );
  else
    check(
      'librarian draftBook drafts from the lookup',
      !draft.isError,
      draft.structuredContent?.title?.value
    );
  await client.close();
}
process.exit(failed ? 1 : 0);
