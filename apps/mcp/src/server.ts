#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpEnv } from './config.js';
import { openSession } from './session.js';
import { createLibraryMcpServer } from './tools.js';

const main = async () => {
  const env = loadMcpEnv();
  const session = await openSession(env);
  const server = createLibraryMcpServer({
    actor: session.actor,
    ports: session.ports,
    search: session.search,
  });
  await server.connect(new StdioServerTransport());
  console.error(
    `library MCP server: ${session.me.email} (${session.me.role.toLowerCase()}) on ${env.LIBRARY_API_URL}`
  );
};

main().catch((error: unknown) => {
  console.error(String((error as Error).message ?? error));
  process.exit(1);
});
