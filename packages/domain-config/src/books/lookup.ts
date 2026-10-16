import type { ExternalRecord, LookupDeps, LookupProvider } from '../types.js';
import { normalizeIsbn } from './fields.js';

export const LOOKUP_SOURCE = { openLibrary: 'openlibrary', fixture: 'fixture' } as const;
export type LookupSource = (typeof LOOKUP_SOURCE)[keyof typeof LOOKUP_SOURCE];

export const OPEN_LIBRARY_BASE_URL = 'https://openlibrary.org';
export const OPEN_LIBRARY_COVERS_ORIGIN = 'https://covers.openlibrary.org';
const COVERS_BASE_URL = `${OPEN_LIBRARY_COVERS_ORIGIN}/b/id`;

interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  subject?: string[];
}

const yearFrom = (value: string | number | undefined): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = /\b(\d{4})\b/.exec(value);
  return match?.[1] === undefined ? null : Number(match[1]);
};

const pickIsbn = (isbns: string[] | undefined): string | null => {
  if (!isbns || isbns.length === 0) return null;
  const normalised = isbns.map(normalizeIsbn);
  return normalised.find(isbn => isbn.length === 13) ?? normalised[0] ?? null;
};

const toIsbn13 = (isbn: string): string => {
  if (isbn.length !== 10) return isbn;
  const body = `978${isbn.slice(0, 9)}`;
  const sum = [...body].reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
};

const listsIsbn = (doc: SearchDoc, isbn: string): boolean =>
  (doc.isbn ?? []).some(candidate => toIsbn13(normalizeIsbn(candidate)) === toIsbn13(isbn));

const getJson = async (url: string, deps: LookupDeps): Promise<unknown | null> => {
  try {
    const init: RequestInit = { headers: { accept: 'application/json' } };
    if (deps.signal !== undefined) init.signal = deps.signal;
    const response = await deps.fetch(url, init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,isbn,cover_i,subject';
const SUBJECTS_MAX = 20;

const toRecord = (doc: SearchDoc & { title: string }, isbn: string | null): ExternalRecord => ({
  source: LOOKUP_SOURCE.openLibrary,
  sourceId: doc.key ?? doc.title,
  title: doc.title,
  authors: doc.author_name ?? [],
  year: yearFrom(doc.first_publish_year),
  isbn,
  coverUrl: doc.cover_i === undefined ? null : `${COVERS_BASE_URL}/${doc.cover_i}-L.jpg`,
  description: null,
  subjects: (doc.subject ?? []).slice(0, SUBJECTS_MAX),
});

const search = async (params: URLSearchParams, deps: LookupDeps) => {
  const base = deps.baseUrl ?? OPEN_LIBRARY_BASE_URL;
  params.set('fields', SEARCH_FIELDS);
  const json = await getJson(`${base}/search.json?${params.toString()}`, deps);
  const docs = json !== null && typeof json === 'object' ? (json as { docs?: unknown }).docs : null;
  return Array.isArray(docs)
    ? (docs as SearchDoc[]).filter(
        (doc): doc is SearchDoc & { title: string } => typeof doc.title === 'string'
      )
    : [];
};

const describe = async (record: ExternalRecord, deps: LookupDeps): Promise<ExternalRecord> => {
  if (!record.sourceId.startsWith('/works/')) return record;
  const base = deps.baseUrl ?? OPEN_LIBRARY_BASE_URL;
  const json = await getJson(`${base}${record.sourceId}.json`, deps);
  const value =
    json !== null && typeof json === 'object'
      ? (json as { description?: string | { value?: string } }).description
      : undefined;
  const description = typeof value === 'string' ? value : (value?.value ?? null);
  return { ...record, description: description?.trim() || null };
};

export const openLibrary: LookupProvider = {
  name: LOOKUP_SOURCE.openLibrary,

  async byIsbn(isbn, deps) {
    const normalised = normalizeIsbn(isbn);
    const docs = await search(new URLSearchParams({ isbn: normalised, limit: '5' }), deps);
    const doc = docs.find(candidate => listsIsbn(candidate, normalised));
    if (doc === undefined) return null;
    return describe(toRecord(doc, normalised), deps);
  },

  async byTitle(title, author, deps) {
    const params = new URLSearchParams({ title, limit: '5' });
    if (author !== undefined && author.trim() !== '') params.set('author', author);
    const records = (await search(params, deps)).map(doc => toRecord(doc, pickIsbn(doc.isbn)));
    if (records[0] !== undefined) records[0] = await describe(records[0], deps);
    return records;
  },
};
