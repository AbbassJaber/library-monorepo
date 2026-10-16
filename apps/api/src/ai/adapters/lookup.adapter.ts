import type { LookupPort } from '@library/ai';
import { domain, LOOKUP_SOURCE } from '@library/domain-config';
import type { ExternalRecord, LookupProvider } from '@library/domain-config';
import { lookupFixtureRecords } from '@library/domain-config/seed';

export interface LookupAdapterOptions {
  provider: 'openlibrary' | 'fixture';
  baseUrl?: string | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  fixtures?: ExternalRecord[];
}

const createCache = <T>(max = 200) => {
  const map = new Map<string, T>();
  return {
    get: (key: string) => {
      const value = map.get(key);
      if (value !== undefined) {
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },
    set: (key: string, value: T) => {
      map.set(key, value);
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
  };
};

export const createFixtureLookup = (records: ExternalRecord[]): LookupProvider => ({
  name: LOOKUP_SOURCE.fixture,
  async byIsbn(isbn) {
    return records.find(record => record.isbn === isbn) ?? null;
  },
  async byTitle(title, author) {
    const t = title.toLowerCase();
    return records.filter(
      record =>
        record.title.toLowerCase().includes(t) &&
        (!author || record.authors.some(a => a.toLowerCase().includes(author.toLowerCase())))
    );
  },
});

export const createLookupAdapter = (options: LookupAdapterOptions): LookupPort => {
  const provider =
    options.provider === LOOKUP_SOURCE.fixture
      ? createFixtureLookup(options.fixtures ?? lookupFixtureRecords())
      : domain.lookup;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = createCache<ExternalRecord | ExternalRecord[] | null>();
  const deps = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    return {
      value: {
        fetch: fetchImpl,
        signal: controller.signal,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      },
      done: () => clearTimeout(timer),
    };
  };
  return {
    async byIsbn(isbn) {
      const key = `isbn:${isbn}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached as ExternalRecord | null;
      const d = deps();
      try {
        const record = await provider.byIsbn(isbn, d.value);
        cache.set(key, record);
        return record;
      } finally {
        d.done();
      }
    },
    async byTitle(title, author) {
      const key = `title:${title.toLowerCase()}|${(author ?? '').toLowerCase()}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached as ExternalRecord[];
      const d = deps();
      try {
        const records = await provider.byTitle(title, author, d.value);
        cache.set(key, records);
        return records;
      } finally {
        d.done();
      }
    },
  };
};
