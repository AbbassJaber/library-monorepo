import booksJson from './books/seed/books.json' with { type: 'json' };
import lookupJson from './books/seed/lookup-fixtures.json' with { type: 'json' };
import { genres } from './books/genres.js';
import type { ContentLanguage, ExternalRecord } from './types.js';

export type SeedLanguage = ContentLanguage;

export interface SeedBook {
  title: string;
  author: string;
  year: number;
  language: SeedLanguage;
  genres: string[];
  rating: number;
  isbn?: string;
  synopsis: string;
}

export const seedBooks: SeedBook[] = booksJson as SeedBook[];

export const DEMO_ACCOUNTS = {
  password: 'Password123!',
  reader: { email: 'reader@library.local', displayName: 'Demo Reader' },
  librarian: { email: 'librarian@library.local', displayName: 'Demo Librarian' },
} as const;
export const seedGenres = genres;

export interface LookupFixtureEntry {
  query: { isbn: string } | { title: string; author: string | null };
  record: ExternalRecord | null;
}

export const lookupFixtures = lookupJson as {
  recorded: string | null;
  source: string;
  entries: LookupFixtureEntry[];
};

export const lookupFixtureRecords = (): ExternalRecord[] =>
  lookupFixtures.entries
    .map(entry => entry.record)
    .filter((record): record is ExternalRecord => record !== null);
