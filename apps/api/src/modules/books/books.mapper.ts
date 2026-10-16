import type { Book, BookSummary } from '@library/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

export const bookInclude = {
  genres: {
    include: { genre: { select: { id: true, name: true, slug: true, archivedAt: true } } },
    orderBy: { genreId: 'asc' },
  },
} satisfies Prisma.BookInclude;

export type BookRow = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export const toBookSummary = (row: BookRow): BookSummary => ({
  id: row.id,
  title: row.title,
  author: row.author,
  publishedYear: row.publishedYear,
  rating: row.rating.toNumber(),
  coverUrl: row.coverUrl,
  language: row.language,
  genres: row.genres
    .filter(link => link.genre.archivedAt === null)
    .map(link => ({ id: link.genre.id, name: link.genre.name, slug: link.genre.slug })),
  archivedAt: iso(row.archivedAt),
  createdAt: row.createdAt.toISOString(),
});

export const toBook = (row: BookRow): Book => ({
  ...toBookSummary(row),
  synopsis: row.synopsis,
  isbn: row.isbn,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});
