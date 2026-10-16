import { describe, expect, it } from 'vitest';
import { breakEvenCalls, costSummary } from './cost.js';
import { compareDraft, yearCheckSummary } from './draftAccuracy.js';
import { compareQuery, fieldAccuracy } from './filterAccuracy.js';
import { percentile } from './latency.js';
import { recallAtK } from './recall.js';

describe('filter accuracy', () => {
  it('compares q by token set (case, accents and filler words do not count) and genres as sets', () => {
    const result = compareQuery(
      {
        q: 'Dune Frank Herbert',
        genre: ['fantasy', 'children'],
        yearFrom: 1990,
        yearTo: 1999,
        sort: 'rating',
      },
      {
        q: 'dune by frank herbert',
        genre: ['children', 'fantasy'],
        yearFrom: 1990,
        yearTo: 1999,
        sort: 'rating',
      }
    );
    expect(result).toEqual({
      q: true,
      genre: true,
      yearFrom: true,
      yearTo: true,
      sort: true,
      exact: true,
    });
    expect(compareQuery({ q: 'Brontë' }, { q: 'bronte' }).q).toBe(true);
    expect(compareQuery({ q: null }, {}).q).toBe(true);
    expect(compareQuery({ q: 'camus' }, { q: 'camus', yearFrom: 1940 })).toMatchObject({
      q: true,
      yearFrom: false,
      exact: false,
    });
    expect(compareQuery({ genre: ['poetry'] }, { genre: ['poetry', 'romance'] }).genre).toBe(false);
  });

  it('aggregates per field and exact-match rates', () => {
    const rows = [
      { q: true, genre: true, yearFrom: true, yearTo: true, sort: true, exact: true },
      { q: false, genre: true, yearFrom: true, yearTo: false, sort: true, exact: false },
    ];
    expect(fieldAccuracy(rows)).toEqual({
      q: 0.5,
      genre: 1,
      yearFrom: 1,
      yearTo: 0.5,
      sort: 1,
      exact: 0.5,
    });
    expect(fieldAccuracy([])).toEqual({
      q: 0,
      genre: 0,
      yearFrom: 0,
      yearTo: 0,
      sort: 0,
      exact: 0,
    });
  });
});

describe('recall@k', () => {
  it('is the share of expected ids in the top k, averaged by the caller', () => {
    expect(recallAtK([1, 2], [2, 9, 1, 4, 5, 6], 5)).toBe(1);
    expect(recallAtK([1, 2], [9, 8, 7, 6, 5, 1], 5)).toBe(0);
    expect(recallAtK([27, 28], [28, 3], 5)).toBe(0.5);
  });
});

describe('latency', () => {
  it('uses the nearest-rank percentile', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(values, 50)).toBe(1000);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile([], 95)).toBe(0);
    expect(percentile([42], 95)).toBe(42);
  });
});

describe('cost', () => {
  const call = (costUsd: number, tokensCachedWrite = 0) => ({ costUsd, tokensCachedWrite });

  it('separates cache-write calls from the steady state by their reported tokens, not their position', () => {
    expect(costSummary([call(0.0017), call(0.0075, 4200), call(0.0017), call(0.0019)])).toEqual({
      total: 0.0128,
      perQuery: 0.0032,
      cacheWrite: 0.0075,
      cacheWrites: 1,
      steady: 0.0017,
    });
    expect(costSummary([call(0.0017), call(0.0017)])).toMatchObject({
      cacheWrite: null,
      cacheWrites: 0,
      steady: 0.0017,
    });
  });

  it('finds the number of calls in a cache window from which padding is cheaper', () => {
    expect(breakEvenCalls({ cacheWrite: 0.0075, steady: 0.0017 }, 0.0035)).toBe(4);
    expect(breakEvenCalls({ cacheWrite: 0.005, steady: 0.004 }, 0.003)).toBeNull();
    expect(breakEvenCalls({ cacheWrite: null, steady: 0.0017 }, 0.0035)).toBeUndefined();
  });
});

describe('draft accuracy', () => {
  const draft = (overrides: Partial<Record<string, unknown>> = {}) => ({
    title: { value: 'Le rouge et le noir : chronique de 1830', source: 'lookup', confidence: 0.8 },
    author: { value: 'Stendhal', source: 'lookup', confidence: 0.8 },
    publishedYear: { value: 1830, source: 'lookup', confidence: 0.8 },
    synopsis: { value: 'Julien Sorel climbs.', source: 'model', confidence: 0.6 },
    isbn: { value: null, source: 'empty', confidence: 0 },
    coverUrl: { value: null, source: 'empty', confidence: 0 },
    genreIds: { value: [7, 6], source: 'model', confidence: 0.8 },
    lookupSource: 'openlibrary',
    ...overrides,
  });
  const slugs = new Map([
    [6, 'historical-fiction'],
    [7, 'literary-fiction'],
    [9, 'poetry'],
  ]);
  const expected = {
    title: ['Le Rouge et le Noir', 'The Red and the Black'],
    author: ['Stendhal'],
    year: [1830],
    genres: ['literary-fiction', 'historical-fiction', 'romance'],
    synopsis: true,
  };

  it('accepts subtitles, case, accents and author spellings by surname; genres within the set', () => {
    expect(compareDraft(expected, draft() as never, slugs)).toEqual({
      title: true,
      author: true,
      year: true,
      genres: true,
      synopsis: true,
      exact: true,
      genresLenient: true,
      exactLenient: true,
    });
    expect(
      compareDraft(
        { ...expected, author: ['George R. R. Martin'] },
        draft({
          author: { value: 'George R.R. Martin', source: 'lookup', confidence: 1 },
        }) as never,
        slugs
      ).author
    ).toBe(true);
    expect(
      compareDraft(
        { ...expected, author: ['Tawfiq al-Hakim'] },
        draft({ author: { value: 'Tawfīq Ḥakīm', source: 'lookup', confidence: 1 } }) as never,
        slugs
      ).author
    ).toBe(true);
  });

  it('fails a genre outside the set, an empty genre list, a wrong year, and anything invented for an unknown book', () => {
    const outside = draft({ genreIds: { value: [7, 9], source: 'model', confidence: 0.8 } });
    expect(compareDraft(expected, outside as never, slugs).genres).toBe(false);
    const none = draft({ genreIds: { value: null, source: 'empty', confidence: 0 } });
    expect(compareDraft(expected, none as never, slugs).genres).toBe(false);
    const year = draft({ publishedYear: { value: 1831, source: 'model', confidence: 0.5 } });
    expect(compareDraft(expected, year as never, slugs)).toMatchObject({
      year: false,
      exact: false,
    });
    const unknown = { title: null, author: null, year: null, genres: [], synopsis: false };
    expect(compareDraft(unknown, draft() as never, slugs)).toMatchObject({
      title: false,
      exact: false,
    });
    const blank = draft({
      title: { value: null, source: 'empty', confidence: 0 },
      author: { value: null, source: 'empty', confidence: 0 },
      publishedYear: { value: null, source: 'empty', confidence: 0 },
      synopsis: { value: null, source: 'empty', confidence: 0 },
      genreIds: { value: null, source: 'empty', confidence: 0 },
    });
    expect(compareDraft(unknown, blank as never, slugs).exact).toBe(true);
  });
});

describe('lenient genres', () => {
  it('counts a defensible extra genre only in the lenient score', () => {
    const base = {
      title: ['Dune'],
      author: ['Frank Herbert'],
      year: [1965],
      genres: ['science-fiction'],
      acceptableGenres: ['fantasy'],
      synopsis: true,
    };
    const field = (value: unknown, source = 'lookup') => ({ value, source, confidence: 1 });
    const dune = {
      title: field('Dune'),
      author: field('Frank Herbert'),
      publishedYear: { ...field(1965), conflict: null },
      synopsis: field('Desert.'),
      isbn: field(null, 'empty'),
      coverUrl: field(null, 'empty'),
      genreIds: field([2, 1], 'model'),
      lookupSource: 'openlibrary',
    };
    const slugs = new Map([
      [1, 'fantasy'],
      [2, 'science-fiction'],
      [9, 'poetry'],
    ]);
    expect(compareDraft(base, dune as never, slugs)).toMatchObject({
      genres: false,
      exact: false,
      genresLenient: true,
      exactLenient: true,
    });
    const poetry = { ...dune, genreIds: field([2, 9], 'model') };
    expect(compareDraft(base, poetry as never, slugs)).toMatchObject({ genresLenient: false });
    const onlyExtra = { ...dune, genreIds: field([1], 'model') };
    expect(compareDraft(base, onlyExtra as never, slugs)).toMatchObject({ genresLenient: false });
  });
});

describe('year second opinion', () => {
  it('counts flags on wrong lookup years, whether the flagged value is right, and false flags', () => {
    const row = (lookupYear: number, expected: number[], conflict: number | null) => ({
      expected: { year: expected },
      draft: {
        publishedYear: {
          value: lookupYear,
          source: 'lookup',
          confidence: 0.95,
          conflict: conflict === null ? null : { value: conflict, confidence: 0.9 },
        },
      },
    });
    expect(
      yearCheckSummary([
        row(1800, [1859], 1859),
        row(1963, [1947], 1946),
        row(1988, [1937], null),
        row(1965, [1965], null),
        row(2011, [2011, 2014], 2014),
      ] as never)
    ).toEqual({
      wrongLookupYears: 3,
      flagged: 2,
      flaggedWithRightYear: 1,
      rightLookupYears: 2,
      falseFlags: 1,
    });
  });
});
