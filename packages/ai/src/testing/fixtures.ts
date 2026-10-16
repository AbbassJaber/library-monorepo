import { Role, type Book, type Genre } from '@library/contracts';
import type { ExternalRecord } from '@library/domain-config';
import type { Actor } from '../ports/index.js';

export const reader: Actor = { id: 1, role: Role.enum.READER };
export const librarian: Actor = { id: 2, role: Role.enum.LIBRARIAN };

export const genre = (
  id: number,
  name: string,
  slug = name.toLowerCase().replace(/\s+/g, '-')
): Genre => ({
  id,
  name,
  slug,
  archivedAt: null,
  activeBookCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

export const book = (id: number, overrides: Partial<Book> = {}): Book => ({
  id,
  title: `Book ${id}`,
  author: `Author ${id}`,
  publishedYear: 1990 + (id % 30),
  synopsis: `Synopsis of book ${id}.`,
  isbn: null,
  coverUrl: null,
  language: 'en',
  rating: 4,
  genres: [{ id: 1, name: 'Fantasy', slug: 'fantasy' }],
  archivedAt: null,
  version: 1,
  createdAt: `2026-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const externalRecord = (overrides: Partial<ExternalRecord> = {}): ExternalRecord => ({
  source: 'fixture',
  sourceId: 'OL1M',
  title: 'Dune',
  authors: ['Frank Herbert'],
  year: 1965,
  isbn: '9780441013593',
  coverUrl: null,
  description: 'Paul Atreides on Arrakis.',
  subjects: ['Science fiction'],
  ...overrides,
});
