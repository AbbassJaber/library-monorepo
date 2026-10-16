import { apiPaths } from '@library/contracts';
import type {
  ReadingListBatchResponse,
  Book,
  BookListResponse,
  BookSummary,
  FavoriteGenre,
  Genre,
  ReadingListEntry,
} from '@library/contracts';
import type { CatalogPort } from '../../ports/index.js';
import type { HttpClient } from './client.js';

export const createHttpCatalog = (client: HttpClient): CatalogPort => ({
  async searchBooks(_actor, input) {
    const params = new URLSearchParams();
    if (input.q) params.set('q', input.q);
    for (const slug of input.genre ?? []) params.append('genre', slug);
    if (input.yearFrom !== undefined) params.set('yearFrom', String(input.yearFrom));
    if (input.yearTo !== undefined) params.set('yearTo', String(input.yearTo));
    if (input.sort) params.set('sort', input.sort);
    params.set('pageSize', String(input.limit));
    params.set('page', '1');
    return (await client.get<BookListResponse>(`${apiPaths.books.list}?${params.toString()}`)).data
      .items as BookSummary[];
  },
  async getBook(_actor, bookId) {
    try {
      return (await client.get<Book>(apiPaths.books.detail(bookId))).data;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  },
  async booksByIds(actor, ids) {
    const books = await Promise.all(ids.map(id => this.getBook(actor, id)));
    return books.filter((book): book is Book => book !== null && book.archivedAt === null);
  },
  listGenres: async () => (await client.get<Genre[]>(apiPaths.genres.list)).data,
  getShelf: async () => (await client.get<ReadingListEntry[]>(apiPaths.readingList.list)).data,
  getFavoriteGenres: async () => (await client.get<FavoriteGenre[]>(apiPaths.favoriteGenres)).data,
  addToReadingList: async (_actor, input) =>
    (await client.post<ReadingListEntry>(apiPaths.readingList.list, input)).data,
  updateReadingState: async (_actor, bookId, state) =>
    (await client.patch<ReadingListEntry>(apiPaths.readingList.entry(bookId), { state })).data,
  changeReadingList: async (_actor, changes) =>
    (await client.post<ReadingListBatchResponse>(apiPaths.readingList.batch, { changes })).data,
  removeFromReadingList: async (_actor, bookId) => {
    await client.delete(apiPaths.readingList.entry(bookId));
  },
  listBooksForEmbedding: () =>
    Promise.reject(
      new Error('listBooksForEmbedding is server-side only (the API embeds its own catalog)')
    ),
});
