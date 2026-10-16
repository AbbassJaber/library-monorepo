import type { AuditQuery, BooksQuery, HybridSearchQuery } from '@library/contracts';
import { PAGE_SIZE_DEFAULT, BookStatus } from '@library/contracts';

export const normalizeBooksQuery = (query: Partial<BooksQuery>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const entries = Object.entries(query).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    if (value === undefined || value === '') continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'pageSize' && value === PAGE_SIZE_DEFAULT) continue;
    if (key === 'status' && value === BookStatus.enum.active) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = Array.isArray(value) ? [...value].sort() : value;
  }
  return out;
};

export const qk = {
  auth: { me: ['auth', 'me'] as const },
  books: {
    all: ['books'] as const,
    lists: ['books', 'list'] as const,
    list: (query: Partial<BooksQuery>) => ['books', 'list', normalizeBooksQuery(query)] as const,
    infinites: ['books', 'infinite'] as const,
    infinite: (query: Partial<Omit<BooksQuery, 'page'>>) =>
      ['books', 'infinite', normalizeBooksQuery(query)] as const,
    detail: (id: number) => ['books', 'detail', id] as const,
    newest: ['books', 'newest'] as const,
    similar: (id: number) => ['books', 'similar', id] as const,
  },
  genres: {
    all: ['genres'] as const,
    list: (includeArchived = false) => ['genres', 'list', { includeArchived }] as const,
  },
  shelf: { list: ['shelf', 'list'] as const },
  favorites: { list: ['favorites', 'list'] as const },
  recommendations: {
    all: ['recommendations'] as const,
    shelves: ['recommendations', 'shelves'] as const,
    explained: ['recommendations', 'explained'] as const,
  },
  ai: {
    status: ['ai', 'status'] as const,
    search: (query: HybridSearchQuery) => ['ai', 'search', query] as const,
  },
  audit: { list: (query: Partial<AuditQuery>) => ['audit', 'list', query] as const },
};

export const staleTimes = {
  me: Infinity,
  booksList: 60_000,
  bookDetail: 60_000,
  newest: 5 * 60_000,
  similar: 10 * 60_000,
  genres: 10 * 60_000,
  shelf: 30_000,
  favorites: 30_000,
  recommendations: 2 * 60_000,
  explained: 10 * 60_000,
  aiStatus: Infinity,
  audit: 0,
} as const;
