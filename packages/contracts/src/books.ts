import { z } from 'zod';
import { VALIDATION_CODES } from './constants.js';
import {
  Id,
  IsoDate,
  PageQuery,
  PaginationMeta,
  emptyToUndefined,
  listFromQuery,
  optionalInt,
} from './common.js';
import { GenreRef, GenreSlug } from './genres.js';

export const PUBLISHED_YEAR_MIN = 1000;
export const publishedYearMax = () => new Date().getFullYear() + 1;
export const SYNOPSIS_MAX_LENGTH = 4000;
export const GENRES_PER_BOOK_MIN = 1;
export const GENRES_PER_BOOK_MAX = 5;
export const NEWEST_BOOKS_COUNT = 6;

export const normalizeIsbn = (value: string): string =>
  value
    .replace(/isbn(?:-?1[03])?:?/gi, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();

export const Isbn = z
  .string()
  .transform(normalizeIsbn)
  .pipe(z.string().regex(/^(?:\d{9}[\dX]|\d{13})$/, VALIDATION_CODES.isbnInvalid));
export type Isbn = z.infer<typeof Isbn>;

export const BookLanguage = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}$/)
  .meta({ id: 'BookLanguage' });
export type BookLanguage = z.infer<typeof BookLanguage>;
export const BOOK_LANGUAGES_PER_QUERY_MAX = 5;

const Title = z.string().trim().min(1).max(200);
const Author = z.string().trim().min(1).max(120);
const PublishedYear = z
  .number()
  .int()
  .min(PUBLISHED_YEAR_MIN)
  .refine(year => year <= publishedYearMax(), { message: VALIDATION_CODES.yearFuture });
const Synopsis = z.string().trim().min(1).max(SYNOPSIS_MAX_LENGTH);
export const Rating = z
  .number()
  .min(0)
  .max(5)
  .refine(value => Math.round(value * 10) / 10 === value, {
    message: VALIDATION_CODES.ratingDecimals,
  });
const CoverUrl = z.url().max(2000);
const GenreIds = z.array(Id).min(GENRES_PER_BOOK_MIN).max(GENRES_PER_BOOK_MAX);

export const BookSummary = z
  .object({
    id: Id,
    title: z.string(),
    author: z.string(),
    publishedYear: z.number().int(),
    rating: z.number(),
    coverUrl: z.string().nullable(),
    language: BookLanguage.nullable(),
    genres: z.array(GenreRef),
    archivedAt: IsoDate.nullable(),
    createdAt: IsoDate,
  })
  .meta({ id: 'BookSummary' });
export type BookSummary = z.infer<typeof BookSummary>;

export const Book = BookSummary.extend({
  synopsis: z.string(),
  isbn: z.string().nullable(),
  version: z.number().int().min(1),
  updatedAt: IsoDate,
}).meta({ id: 'Book' });
export type Book = z.infer<typeof Book>;

export const BookSort = z.enum(['newest', 'title', 'rating']);
export type BookSort = z.infer<typeof BookSort>;

export const BookStatus = z.enum(['active', 'archived', 'all']);
export type BookStatus = z.infer<typeof BookStatus>;

const YEAR_MAX = 9999;

export const BooksQuery = PageQuery.extend({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(200).optional()),
  genre: z.preprocess(listFromQuery, z.array(GenreSlug).min(1).max(5).optional()),
  yearFrom: optionalInt(PUBLISHED_YEAR_MIN, YEAR_MAX),
  yearTo: optionalInt(PUBLISHED_YEAR_MIN, YEAR_MAX),
  language: z.preprocess(
    listFromQuery,
    z.array(BookLanguage).min(1).max(BOOK_LANGUAGES_PER_QUERY_MAX).optional()
  ),
  sort: z.preprocess(emptyToUndefined, BookSort.optional()),
  status: z.preprocess(emptyToUndefined, BookStatus.default(BookStatus.enum.active)),
}).refine(
  query =>
    query.yearFrom === undefined || query.yearTo === undefined || query.yearFrom <= query.yearTo,
  { message: VALIDATION_CODES.yearRange, path: ['yearFrom'] }
);
export type BooksQuery = z.infer<typeof BooksQuery>;
export type BooksQueryInput = z.input<typeof BooksQuery>;

export const BookListResponse = z.object({
  items: z.array(BookSummary),
  meta: PaginationMeta,
});
export type BookListResponse = z.infer<typeof BookListResponse>;

export const NewestBooksResponse = z.array(BookSummary).max(NEWEST_BOOKS_COUNT);
export type NewestBooksResponse = z.infer<typeof NewestBooksResponse>;

export const CreateBookBody = z
  .strictObject({
    title: Title,
    author: Author,
    publishedYear: PublishedYear,
    synopsis: Synopsis,
    isbn: Isbn.optional(),
    coverUrl: CoverUrl.optional(),
    language: BookLanguage.optional(),
    rating: Rating.default(0),
    genreIds: GenreIds,
  })
  .meta({ id: 'CreateBookBody' });
export type CreateBookBody = z.infer<typeof CreateBookBody>;

export const VersionBody = z
  .strictObject({ version: z.number().int().min(1) })
  .meta({ id: 'VersionBody' });
export type VersionBody = z.infer<typeof VersionBody>;

export const UpdateBookBody = z
  .strictObject({
    version: z.number().int().min(1),
    title: Title.optional(),
    author: Author.optional(),
    publishedYear: PublishedYear.optional(),
    synopsis: Synopsis.optional(),
    isbn: Isbn.nullable().optional(),
    coverUrl: CoverUrl.nullable().optional(),
    language: BookLanguage.nullable().optional(),
    rating: Rating.optional(),
    genreIds: GenreIds.optional(),
  })
  .meta({ id: 'UpdateBookBody' });
export type UpdateBookBody = z.infer<typeof UpdateBookBody>;

export const IsbnTakenDetails = z
  .object({ bookId: Id, archived: z.boolean() })
  .meta({ id: 'IsbnTakenDetails' });
export type IsbnTakenDetails = z.infer<typeof IsbnTakenDetails>;

export const VersionConflictDetails = z
  .object({ current: Book })
  .meta({ id: 'VersionConflictDetails' });
export type VersionConflictDetails = z.infer<typeof VersionConflictDetails>;
