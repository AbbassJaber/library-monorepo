import { FieldSource, type BookDraft } from '@library/contracts';

export interface ExpectedDraft {
  title: string[] | null;
  author: string[] | null;
  year: number[] | null;
  genres: string[];
  acceptableGenres?: string[] | undefined;
  synopsis: boolean;
}

export const DRAFT_FIELDS = ['title', 'author', 'year', 'genres', 'synopsis'] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftResult = Record<DraftField | 'exact' | 'genresLenient' | 'exactLenient', boolean>;

export const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const sameTitle = (actual: string, expected: string) => {
  const a = normalizeText(actual);
  const e = normalizeText(expected);
  return a === e || a.startsWith(`${e} `);
};

const surname = (name: string) => normalizeText(name).split(' ').at(-1) ?? '';
const sameAuthor = (actual: string, expected: string) =>
  normalizeText(actual) === normalizeText(expected) || surname(actual) === surname(expected);

const isEmpty = (value: unknown) =>
  value === null || (Array.isArray(value) && value.length === 0) || value === '';

export const compareDraft = (
  expected: ExpectedDraft,
  draft: BookDraft,
  slugById: ReadonlyMap<number, string>
): DraftResult => {
  const text = (
    value: string | null,
    accepted: string[] | null,
    same: (a: string, e: string) => boolean
  ) =>
    accepted === null
      ? isEmpty(value)
      : value !== null && accepted.some(option => same(value, option));
  const genres = (draft.genreIds.value ?? []).map(id => slugById.get(id) ?? `#${id}`);
  const result = {
    title: text(draft.title.value, expected.title, sameTitle),
    author: text(draft.author.value, expected.author, sameAuthor),
    year:
      expected.year === null
        ? draft.publishedYear.value === null
        : draft.publishedYear.value !== null && expected.year.includes(draft.publishedYear.value),
    genres:
      expected.genres.length === 0
        ? genres.length === 0
        : genres.length > 0 && genres.every(slug => expected.genres.includes(slug)),
    synopsis: expected.synopsis ? !isEmpty(draft.synopsis.value) : isEmpty(draft.synopsis.value),
  };
  const widened = [...expected.genres, ...(expected.acceptableGenres ?? [])];
  const genresLenient =
    expected.genres.length === 0
      ? genres.length === 0
      : genres.some(slug => expected.genres.includes(slug)) &&
        genres.every(slug => widened.includes(slug));
  const exact = Object.values(result).every(Boolean);
  return {
    ...result,
    exact,
    genresLenient,
    exactLenient: genresLenient && result.title && result.author && result.year && result.synopsis,
  };
};

export const draftAccuracy = (
  rows: DraftResult[]
): Record<DraftField | 'exact' | 'genresLenient' | 'exactLenient', number> => {
  const rate = (key: keyof DraftResult) =>
    rows.length === 0 ? 0 : rows.filter(row => row[key]).length / rows.length;
  return {
    title: rate('title'),
    author: rate('author'),
    year: rate('year'),
    genres: rate('genres'),
    synopsis: rate('synopsis'),
    exact: rate('exact'),
    genresLenient: rate('genresLenient'),
    exactLenient: rate('exactLenient'),
  };
};

export const yearCheckSummary = (
  rows: Array<{ expected: { year: number[] | null }; draft: BookDraft | null }>
) => {
  const fromLookup = rows.filter(
    row =>
      row.draft !== null &&
      row.expected.year !== null &&
      row.draft.publishedYear.source === FieldSource.enum.lookup &&
      row.draft.publishedYear.value !== null
  );
  const isRight = (row: (typeof fromLookup)[number]) =>
    row.expected.year!.includes(row.draft!.publishedYear.value!);
  const wrong = fromLookup.filter(row => !isRight(row));
  const right = fromLookup.filter(isRight);
  const conflictOf = (row: (typeof fromLookup)[number]) =>
    row.draft!.publishedYear.conflict ?? null;
  const flagged = wrong.filter(row => conflictOf(row) !== null);
  return {
    wrongLookupYears: wrong.length,
    flagged: flagged.length,
    flaggedWithRightYear: flagged.filter(row => row.expected.year!.includes(conflictOf(row)!.value))
      .length,
    rightLookupYears: right.length,
    falseFlags: right.filter(row => conflictOf(row) !== null).length,
  };
};
