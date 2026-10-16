import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../providers/mock/index.js';
import type { GenerateRequest, LlmProvider } from '../providers/types.js';
import { stablePrefix } from '../prompts/ordering.js';
import { createFakePorts, createFakeState, genre, reader } from '../testing/index.js';
import { mockToolHandlers } from './mockTools.js';
import { NL_SEARCH_TOOL, nlSearch } from './nlSearch.js';

const liveGenres = [
  genre(1, 'Fantasy', 'fantasy'),
  genre(2, 'Science Fiction', 'science-fiction'),
  genre(3, 'Mystery & Crime', 'mystery'),
  genre(4, 'Poetry', 'poetry'),
];

const setup = (
  llm: LlmProvider = createMockProvider({ tools: mockToolHandlers }),
  options: { cachePadding?: boolean } = {}
) => {
  const ports = createFakePorts(createFakeState({ genres: liveGenres }));
  const run = (text: string) =>
    nlSearch({ llm, ports, ...options }, { actor: reader, requestId: 'r' }, { text });
  return { run, ports };
};

const answering = (answer: (request: GenerateRequest) => unknown): LlmProvider =>
  createMockProvider({ tools: { [NL_SEARCH_TOOL]: answer } });

describe('nlSearch', () => {
  it('parses "fantasy from the 90s sorted by rating"', async () => {
    const { run } = setup();
    const { value, meta } = await run('fantasy from the 90s sorted by rating');
    expect(value.query).toMatchObject({
      genre: ['fantasy'],
      yearFrom: 1990,
      yearTo: 1999,
      sort: 'rating',
      page: 1,
    });
    expect(value.query.q).toBeUndefined();
    expect(value.chips).toEqual([
      { key: 'genre', label: 'Fantasy', value: 'fantasy' },
      { key: 'yearFrom', label: '1990', value: '1990' },
      { key: 'yearTo', label: '1999', value: '1999' },
      { key: 'sort', label: 'rating', value: 'rating' },
    ]);
    expect(meta).toMatchObject({
      feature: 'NL_SEARCH',
      provider: 'mock',
      model: 'mock-small',
      fallbackUsed: false,
    });
  });

  it('Arabic and French genre words map to genre slugs', async () => {
    const { run } = setup();
    expect((await run('روايات خيال علمي')).value.query.genre).toEqual(['science-fiction']);
    const french = (await run('romans policiers des années 80')).value.query;
    expect(french).toMatchObject({ genre: ['mystery'], yearFrom: 1980, yearTo: 1989 });
  });

  it('unknown genre words stay in q', async () => {
    const { run } = setup(
      answering(() => ({
        q: 'neon cities',
        genres: ['cyberpunk'],
        yearFrom: null,
        yearTo: null,
        sort: null,
        confidence: 0.7,
      }))
    );
    const { value } = await run('cyberpunk neon cities');
    expect(value.query.genre).toBeUndefined();
    expect(value.query.q).toBe('neon cities cyberpunk');
    expect(value.unparsed).toBe('cyberpunk');
    expect((await setup().run('tolkein hobbits')).value.query.q).toBe('tolkein hobbits');
  });

  it('malformed model output falls back to {q}', async () => {
    let calls = 0;
    const { run, ports } = setup(
      answering(() => {
        calls += 1;
        return { genres: 'not-a-list', yearFrom: 'last year', confidence: 7 };
      })
    );
    const { value, meta } = await run('something about whales');
    expect(calls).toBe(2);
    expect(value.query).toMatchObject({ q: 'something about whales', page: 1 });
    expect(value.chips).toEqual([
      { key: 'q', label: 'something about whales', value: 'something about whales' },
    ]);
    expect(value.confidence).toBe(0);
    expect(meta.fallbackUsed).toBe(true);
    expect(ports.state.runs).toHaveLength(1);
    expect(ports.state.runs[0]).toMatchObject({ success: true, fallbackUsed: true });
  });

  it('output with keys the schema does not have is retried once, then falls back', async () => {
    let calls = 0;
    const { run } = setup(
      answering(() => {
        calls += 1;
        return {
          q: null,
          genres: ['fantasy'],
          yearFrom: null,
          yearTo: null,
          sort: null,
          confidence: 0.9,
          status: 'archived',
        };
      })
    );
    const { value, meta } = await run('fantasy');
    expect(calls).toBe(2);
    expect(meta.fallbackUsed).toBe(true);
    expect(value.query).toMatchObject({ q: 'fantasy', status: 'active' });
  });

  it('a q at the length limit plus dropped genre words is clipped within the contract, not a failure', async () => {
    const { run } = setup(
      answering(() => ({
        q: 'x'.repeat(200),
        genres: ['cyberpunk'],
        yearFrom: null,
        yearTo: null,
        sort: null,
        confidence: 0.9,
      }))
    );
    const { value, meta } = await run('long request');
    expect(meta.fallbackUsed).toBe(false);
    expect(value.query.q!.length).toBeLessThanOrEqual(200);
  });

  it('only offers genres from the live list (archived or unknown slugs never become filters)', async () => {
    const { run } = setup(
      answering(() => ({
        q: null,
        genres: ['fantasy', 'romance'],
        yearFrom: null,
        yearTo: null,
        sort: null,
        confidence: 0.9,
      }))
    );
    const { value } = await run('romantic fantasy');
    expect(value.query.genre).toEqual(['fantasy']);
    expect(value.query.q).toBe('romance');
  });

  it('repairs impossible years instead of failing the query', async () => {
    const { run } = setup(
      answering(() => ({
        q: null,
        genres: [],
        yearFrom: 2000,
        yearTo: 1990,
        sort: null,
        confidence: 0.8,
      }))
    );
    expect((await run('between 2000 and 1990')).value.query).toMatchObject({
      yearFrom: 1990,
      yearTo: 2000,
    });
    const { run: run2 } = setup(
      answering(() => ({
        q: null,
        genres: [],
        yearFrom: 12,
        yearTo: 99999,
        sort: null,
        confidence: 0.8,
      }))
    );
    const out = (await run2('weird years')).value.query;
    expect(out.yearFrom).toBeUndefined();
    expect(out.yearTo).toBeUndefined();
  });

  it('keeps the stable prompt prefix byte-identical across requests (cacheable) with the live genres in it', async () => {
    const seen: GenerateRequest[] = [];
    const { run } = setup(
      answering(request => {
        seen.push(request);
        return { q: null, genres: [], yearFrom: null, yearTo: null, sort: null, confidence: 0.5 };
      })
    );
    await run('first request');
    await run('a completely different second request');
    expect(stablePrefix(seen[0]!.system)).toBe(stablePrefix(seen[1]!.system));
    expect(stablePrefix(seen[0]!.system)).toContain('science-fiction');
    expect(seen[0]!.tier).toBe('small');
    expect(stablePrefix(seen[1]!.system)).not.toContain('completely different');
  });

  it('uses the compact prompt by default and the cache-padded prefix only when asked', async () => {
    const capture = (options: { cachePadding?: boolean }) => {
      const seen: GenerateRequest[] = [];
      const { run } = setup(
        answering(request => {
          seen.push(request);
          return { q: null, genres: [], yearFrom: null, yearTo: null, sort: null, confidence: 0.5 };
        }),
        options
      );
      return { run, seen };
    };
    const compact = capture({});
    await compact.run('x y');
    const padded = capture({ cachePadding: true });
    await padded.run('x y');
    const compactPrefix = stablePrefix(compact.seen[0]!.system);
    const paddedPrefix = stablePrefix(padded.seen[0]!.system);
    expect(compactPrefix).not.toContain('Genre guide');
    expect(compactPrefix).toContain('science-fiction');
    expect(paddedPrefix).toContain('Genre guide');
    expect(paddedPrefix).toContain('Typos, mixed languages');
    expect(compactPrefix.length / 4).toBeLessThan(1500);
    expect(paddedPrefix.length).toBeGreaterThan(compactPrefix.length * 2);
  });
});
