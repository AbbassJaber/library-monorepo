import { BookStatus, type BooksQuery } from '@library/contracts';
import type { Actor, CatalogPort, EmbeddingSource } from '@library/ai';
import { contentHash } from '@library/ai';
import { domain } from '@library/domain-config';
import type { PrismaClient } from '../../lib/prisma.js';
import { bookInclude } from '../../modules/books/books.mapper.js';
import type { BooksService } from '../../modules/books/books.service.js';
import type { FavoritesService } from '../../modules/favorites/favorites.service.js';
import type { GenresService } from '../../modules/genres/genres.service.js';
import type { ShelfService } from '../../modules/shelf/shelf.service.js';
import { isAppError } from '../../lib/errors.js';

export interface CatalogAdapterDeps {
  prisma: PrismaClient;
  books: BooksService;
  genres: GenresService;
  shelf: ShelfService;
  favorites: FavoritesService;
}

export const embeddingText = (book: {
  title: string;
  author: string;
  publishedYear: number;
  synopsis: string;
  genres: Array<{ genre: { slug: string; name: string } }>;
}): string =>
  domain.prompts.describeItem({
    title: book.title,
    creator: book.author,
    year: book.publishedYear,
    summary: book.synopsis,
    genres: book.genres.map(g => g.genre.name),
  });

export const createCatalogAdapter = (deps: CatalogAdapterDeps): CatalogPort => ({
  async searchBooks(actor, input) {
    const query: BooksQuery = {
      page: 1,
      pageSize: input.limit,
      status: BookStatus.enum.active,
      ...(input.q !== undefined ? { q: input.q } : {}),
      ...(input.genre !== undefined ? { genre: input.genre } : {}),
      ...(input.yearFrom !== undefined ? { yearFrom: input.yearFrom } : {}),
      ...(input.yearTo !== undefined ? { yearTo: input.yearTo } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.sort !== undefined ? { sort: input.sort } : {}),
    };
    return (await deps.books.list(actor, query)).items;
  },
  async getBook(actor: Actor, bookId) {
    try {
      return await deps.books.get(actor, bookId);
    } catch (error) {
      if (isAppError(error) && error.status === 404) return null;
      throw error;
    }
  },
  booksByIds: (actor, ids) => deps.books.summaries(actor, ids),
  listGenres: actor => deps.genres.list(actor, { includeArchived: false }),
  getShelf: actor => deps.shelf.list(actor),
  getFavoriteGenres: actor => deps.favorites.list(actor),
  addToReadingList: (actor, input) => deps.shelf.add(actor, input),
  updateReadingState: (actor, bookId, state) => deps.shelf.updateState(actor, bookId, state),
  removeFromReadingList: (actor, bookId) => deps.shelf.remove(actor, bookId),
  changeReadingList: (actor, changes) => deps.shelf.applyBatch(actor, changes),
  async listBooksForEmbedding(): Promise<EmbeddingSource[]> {
    const rows = await deps.prisma.book.findMany({
      where: { archivedAt: null },
      include: bookInclude,
      orderBy: { id: 'asc' },
    });
    return rows.map(row => {
      const text = embeddingText(row);
      return { id: row.id, text, contentHash: contentHash(text) };
    });
  },
});
