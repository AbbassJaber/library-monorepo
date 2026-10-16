import { ProviderUnavailableError, createMockProvider, mockToolHandlers } from '@library/ai';
import type { LlmProvider } from '@library/ai';
import { externalRecord } from '@library/ai/testing';
import type { LookupFixtureEntry } from '@library/domain-config/seed';
import { describe, expect, it } from 'vitest';
import {
  createRecordingLookup,
  createReplayLookup,
  loadAutofillCases,
  runAutofillInProcess,
} from './autofill.js';
import type { AutofillCase } from './autofill.js';

const dune = externalRecord({
  source: 'openlibrary',
  sourceId: '/works/OL893415W',
  isbn: '9780441172719',
  description: 'Desert planet.',
  subjects: ['Science fiction'],
});
const cases: AutofillCase[] = [
  {
    id: 'i-07',
    language: 'en',
    input: { isbn: '9780441172719' },
    expected: {
      title: ['Dune'],
      author: ['Frank Herbert'],
      year: [1965],
      genres: ['science-fiction'],
      synopsis: true,
    },
  },
  {
    id: 'i-09',
    language: 'en',
    input: { isbn: '9780000000002' },
    expected: { title: null, author: null, year: null, genres: [], synopsis: false },
  },
];
const entries: LookupFixtureEntry[] = [
  { query: { isbn: '9780441172719' }, record: dune },
  { query: { isbn: '9780000000002' }, record: null },
];
const fast = { throttleRetries: 2, backoffMs: 1 };

describe('autofill suite', () => {
  it('has at least 20 EN/FR/AR cases with unique ids', () => {
    const all = loadAutofillCases();
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(new Set(all.map(c => c.id)).size).toBe(all.length);
    expect(new Set(all.map(c => c.language))).toEqual(new Set(['en', 'fr', 'ar']));
  });

  it('replays recorded lookups exactly, misses included', async () => {
    const lookup = createReplayLookup(entries);
    expect(await lookup.byIsbn('9780441172719')).toEqual(dune);
    expect(await lookup.byIsbn('9780000000002')).toBeNull();
    expect(await lookup.byTitle('Never recorded', undefined)).toEqual([]);
  });

  it('records each query once with the top record', async () => {
    const recorded: LookupFixtureEntry[] = [];
    const lookup = createRecordingLookup(createReplayLookup(entries), recorded);
    await lookup.byIsbn('9780441172719');
    await lookup.byIsbn('9780441172719');
    await lookup.byTitle('Nothing', 'Nobody');
    expect(recorded).toEqual([
      { query: { isbn: '9780441172719' }, record: dune },
      { query: { title: 'Nothing', author: 'Nobody' }, record: null },
    ]);
  });

  it('scores each case on the Mock: the lookup fields, Mock genres, nothing invented for the unknown ISBN', async () => {
    const rows = await runAutofillInProcess(
      cases,
      createMockProvider({ tools: mockToolHandlers }),
      createReplayLookup(entries),
      fast
    );
    expect(rows.map(r => [r.id, r.fields.exact, r.lookupHit, r.modelCalled])).toEqual([
      ['i-07', true, true, true],
      ['i-09', true, false, false],
    ]);
    expect(rows[0]!.sources).toMatchObject({
      title: 'lookup',
      synopsis: 'lookup',
      genres: 'model',
    });
  });

  it('retries a 429 surfaced as AI unavailable, and counts it', async () => {
    let calls = 0;
    const mock = createMockProvider({ tools: mockToolHandlers });
    const flaky: LlmProvider = {
      ...mock,
      generate: request => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new ProviderUnavailableError('429 Too many requests'))
          : mock.generate(request);
      },
    };
    const [row] = await runAutofillInProcess([cases[0]!], flaky, createReplayLookup(entries), {
      throttleRetries: 2,
      backoffMs: 60,
    });
    expect(row).toMatchObject({ throttleRetries: 1, aiUnavailable: false, error: null });
    expect(row!.totalMs).toBeLessThan(60);
    expect(row!.fields.exact).toBe(true);
  });
});
