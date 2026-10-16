import { HttpApiError, createHttpCatalog, createHttpClient } from '@library/ai';
import type { Actor, LookupPort, Ports } from '@library/ai';
import { HybridSearchResponse, UserPublic, apiPaths } from '@library/contracts';
import type { BookSummary, SearchBooksInput } from '@library/contracts';
import { domain, LOOKUP_SOURCE } from '@library/domain-config';
import type { LookupProvider } from '@library/domain-config';
import { lookupFixtureRecords } from '@library/domain-config/seed';
import type { McpEnv } from './config.js';

const unavailable = (what: string) => () => {
  throw new Error(`${what} is not available over MCP (the API keeps it server-side)`);
};

const fixtureLookup = (): LookupProvider => {
  const records = lookupFixtureRecords();
  return {
    name: LOOKUP_SOURCE.fixture,
    byIsbn: async isbn => records.find(record => record.isbn === isbn) ?? null,
    byTitle: async (title, author) =>
      records.filter(
        record =>
          record.title.toLowerCase().includes(title.toLowerCase()) &&
          (!author || record.authors.some(a => a.toLowerCase().includes(author.toLowerCase())))
      ),
  };
};

const lookupPort = (env: McpEnv): LookupPort => {
  const provider = env.LIBRARY_LOOKUP === LOOKUP_SOURCE.fixture ? fixtureLookup() : domain.lookup;
  const deps = () => ({ fetch, signal: AbortSignal.timeout(env.LIBRARY_LOOKUP_TIMEOUT_MS) });
  return {
    byIsbn: isbn => provider.byIsbn(isbn, deps()),
    byTitle: (title, author) => provider.byTitle(title, author, deps()),
  };
};

export const openSession = async (env: McpEnv) => {
  const client = createHttpClient({
    baseUrl: env.LIBRARY_API_URL,
    email: env.LIBRARY_EMAIL,
    password: env.LIBRARY_PASSWORD,
  });
  const me = UserPublic.parse((await client.get<unknown>(apiPaths.auth.me)).data);
  const actor: Actor = { id: me.id, role: me.role };
  const ports: Ports = {
    catalog: createHttpCatalog(client),
    lookup: lookupPort(env),
    vectorStore: {
      upsert: unavailable('vectorStore'),
      knn: unavailable('vectorStore'),
      hashes: unavailable('vectorStore'),
      vectorOf: unavailable('vectorStore'),
    },
    trace: { record: async () => null },
    expansions: { all: unavailable('expansions'), upsert: unavailable('expansions') },
    pendingActions: {
      create: unavailable('pendingActions'),
      decide: unavailable('pendingActions'),
      finish: unavailable('pendingActions'),
    },
  };
  const search = async (input: SearchBooksInput): Promise<BookSummary[]> => {
    const params = new URLSearchParams({ q: input.q ?? '', limit: String(input.limit) });
    try {
      const { data } = await client.get<unknown>(`${apiPaths.ai.search}?${params.toString()}`);
      return HybridSearchResponse.parse(data).items.map(item => item.book);
    } catch (error) {
      if (error instanceof HttpApiError && error.status >= 500)
        return ports.catalog.searchBooks(actor, input);
      throw error;
    }
  };
  return { actor, me, ports, search };
};
