export interface ExpectedQuery {
  q?: string | null | undefined;
  genre?: string[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
  sort?: string | undefined;
}

export const FIELDS = ['q', 'genre', 'yearFrom', 'yearTo', 'sort'] as const satisfies ReadonlyArray<
  keyof ExpectedQuery
>;
export type Field = (typeof FIELDS)[number];
export type FieldResult = Record<Field | 'exact', boolean>;

const FILLER = new Set([
  'by',
  'the',
  'a',
  'an',
  'of',
  'de',
  'du',
  'des',
  'le',
  'la',
  'les',
  'par',
  'and',
  'et',
]);

export const qTokens = (q: string | null | undefined): string =>
  [
    ...new Set(
      (q ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(token => token.length > 0 && !FILLER.has(token))
    ),
  ]
    .sort()
    .join(' ');

const sameSet = (a: string[] | undefined, b: string[] | undefined): boolean =>
  [...new Set(a ?? [])].sort().join(',') === [...new Set(b ?? [])].sort().join(',');

export const compareQuery = (expected: ExpectedQuery, actual: ExpectedQuery): FieldResult => {
  const result = {
    q: qTokens(expected.q) === qTokens(actual.q),
    genre: sameSet(expected.genre, actual.genre),
    yearFrom: (expected.yearFrom ?? null) === (actual.yearFrom ?? null),
    yearTo: (expected.yearTo ?? null) === (actual.yearTo ?? null),
    sort: (expected.sort ?? null) === (actual.sort ?? null),
  };
  return { ...result, exact: FIELDS.every(field => result[field]) };
};

export const fieldAccuracy = (rows: FieldResult[]): Record<Field | 'exact', number> => {
  const rate = (key: Field | 'exact') =>
    rows.length === 0
      ? 0
      : Math.round((rows.filter(row => row[key]).length / rows.length) * 1000) / 1000;
  return {
    q: rate('q'),
    genre: rate('genre'),
    yearFrom: rate('yearFrom'),
    yearTo: rate('yearTo'),
    sort: rate('sort'),
    exact: rate('exact'),
  };
};
