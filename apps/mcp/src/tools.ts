import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HttpApiError, ToolError, catalogTools, createToolRegistry } from '@library/ai';
import type { Actor, Ports, ToolContext } from '@library/ai';
import type { BookSummary, SearchBooksInput } from '@library/contracts';
import { ToolName } from '@library/contracts';

export const MCP_SERVER_NAME = 'library';
export const MCP_SERVER_VERSION = '0.1.0';

export interface LibraryMcpOptions {
  actor: Actor;
  ports: Ports;
  search?: (input: SearchBooksInput) => Promise<BookSummary[]>;
}

const annotationsFor = (name: string, mutates: boolean) => ({
  readOnlyHint: !mutates,
  destructiveHint:
    name === ToolName.enum.removeFromReadingList || name === ToolName.enum.changeReadingList,
  idempotentHint: true,
  openWorldHint: name === ToolName.enum.draftBook,
});

const errorText = (error: unknown): string =>
  error instanceof ToolError
    ? `${error.code}: ${error.message}${error.details ? ` ${JSON.stringify(error.details)}` : ''}`
    : error instanceof HttpApiError
      ? `${error.code}: ${error.message}`
      : `FAILED: ${String((error as Error).message ?? error)}`;

export const createLibraryMcpServer = (options: LibraryMcpOptions): Server => {
  const registry = createToolRegistry(catalogTools);
  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  const ctx: ToolContext = {
    actor: options.actor,
    ports: options.ports,
    requestId: null,
    ...(options.search ? { search: options.search } : {}),
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list(options.actor).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: registry.toJsonSchema(tool.name) as { type: 'object'; [key: string]: unknown },
      annotations: annotationsFor(tool.name, tool.mutates),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const result = await registry.call(ctx, request.params.name, request.params.arguments ?? {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: (Array.isArray(result) ? { results: result } : result) as Record<
          string,
          unknown
        >,
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: errorText(error) }], isError: true };
    }
  });
  return server;
};
