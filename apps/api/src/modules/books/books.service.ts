import { MESSAGES } from '../../config/constants.js';
import type {
  Book,
  BookListResponse,
  BooksQuery,
  BookSummary,
  CreateBookBody,
  IsbnTakenDetails,
  UpdateBookBody,
  VersionConflictDetails,
} from '@library/contracts';
import { Role, ApiErrorCode, BookStatus } from '@library/contracts';
import { AUDIT_ACTIONS, AuditEntityType, NEWEST_BOOKS_COUNT } from '@library/contracts';
import { paginationMeta } from '../../lib/envelope.js';
import { searchBookIds } from './books.search.js';
import { Prisma } from '../../generated/prisma/client.js';
import { authorize, isLibrarian } from '../../lib/authz.js';
import { writeAudit } from '../../lib/audit.js';
import type { AuditWriter } from '../../lib/audit.js';
import { conflict, notFound, validationError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { bookInclude, toBook, toBookSummary } from './books.mapper.js';
import type { BookRow } from './books.mapper.js';

type Tx = Prisma.TransactionClient;

const snapshot = (row: BookRow) => ({
  title: row.title,
  author: row.author,
  publishedYear: row.publishedYear,
  isbn: row.isbn,
  coverUrl: row.coverUrl,
  language: row.language,
  rating: row.rating.toNumber(),
  genreIds: row.genres.map(link => link.genreId),
  archivedAt: row.archivedAt,
  version: row.version,
});

export interface BooksServiceHooks {
  afterWrite?: (bookId: number) => void;
}

export const createBooksService = (prisma: PrismaClient, hooks: BooksServiceHooks = {}) => {
  const load = async (db: Pick<Tx, 'book'>, id: number): Promise<BookRow> => {
    const row = await db.book.findUnique({ where: { id }, include: bookInclude });
    if (!row) throw notFound(MESSAGES.bookNotFound);
    return row;
  };

  const ensureActiveGenres = async (db: Pick<Tx, 'genre'>, genreIds: number[]): Promise<void> => {
    const active = await db.genre.findMany({
      where: { id: { in: genreIds }, archivedAt: null },
      select: { id: true },
    });
    const found = new Set(active.map(genre => genre.id));
    const missing = genreIds.filter(id => !found.has(id));
    if (missing.length > 0) {
      throw validationError('Unknown or archived genre ids', {
        issues: missing.map(id => ({
          path: 'body.genreIds',
          message: `genre ${id} is unknown or archived`,
        })),
      });
    }
  };

  const ensureIsbnFree = async (
    db: Pick<Tx, 'book'>,
    isbn: string,
    exceptId?: number
  ): Promise<void> => {
    const holder = await db.book.findUnique({
      where: { isbn },
      select: { id: true, archivedAt: true },
    });
    if (holder && holder.id !== exceptId) {
      const details: IsbnTakenDetails = { bookId: holder.id, archived: holder.archivedAt !== null };
      throw conflict(ApiErrorCode.enum.ISBN_TAKEN, 'Another book already has this ISBN', details);
    }
  };

  const guardedUpdate = async (
    tx: Tx & AuditWriter,
    id: number,
    expectedVersion: number,
    data: Prisma.BookUpdateManyMutationInput,
    extraWhere: Prisma.BookWhereInput = {}
  ): Promise<void> => {
    const { count } = await tx.book.updateMany({
      where: { id, version: expectedVersion, ...extraWhere },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await load(tx, id);
      if (current.version !== expectedVersion) {
        const details: VersionConflictDetails = { current: toBook(current) };
        throw conflict(
          ApiErrorCode.enum.VERSION_CONFLICT,
          'The book changed since you loaded it',
          details
        );
      }
      throw conflict(ApiErrorCode.enum.CONFLICT, 'The book is not in the expected state');
    }
  };

  return {
    async list(actor: Actor, query: BooksQuery): Promise<BookListResponse> {
      if (query.status !== BookStatus.enum.active) authorize(actor, Role.enum.LIBRARIAN);
      const page = await searchBookIds(prisma, query);
      const rows = await prisma.book.findMany({
        where: { id: { in: page.ids } },
        include: bookInclude,
      });
      const byId = new Map(rows.map(row => [row.id, row]));
      const items = page.ids
        .map(id => byId.get(id))
        .filter((row): row is BookRow => row !== undefined)
        .map(toBookSummary);
      return { items, meta: paginationMeta(page.total, query.page, query.pageSize) };
    },

    async summaries(_actor: Actor, ids: number[]): Promise<BookSummary[]> {
      if (ids.length === 0) return [];
      const rows = await prisma.book.findMany({
        where: { id: { in: ids }, archivedAt: null },
        include: bookInclude,
      });
      const byId = new Map(rows.map(row => [row.id, row]));
      return ids
        .map(id => byId.get(id))
        .filter((row): row is BookRow => row !== undefined)
        .map(toBookSummary);
    },

    async newest(): Promise<BookSummary[]> {
      const rows = await prisma.book.findMany({
        where: { archivedAt: null },
        include: bookInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NEWEST_BOOKS_COUNT,
      });
      return rows.map(toBookSummary);
    },

    async get(actor: Actor, id: number): Promise<Book> {
      const row = await load(prisma, id);
      if (row.archivedAt !== null && !isLibrarian(actor)) throw notFound(MESSAGES.bookNotFound);
      return toBook(row);
    },

    async create(actor: Actor, body: CreateBookBody): Promise<Book> {
      authorize(actor, Role.enum.LIBRARIAN);
      const created = await prisma.$transaction(async tx => {
        await ensureActiveGenres(tx, body.genreIds);
        if (body.isbn !== undefined) await ensureIsbnFree(tx, body.isbn);
        const row = await tx.book.create({
          data: {
            title: body.title,
            author: body.author,
            publishedYear: body.publishedYear,
            synopsis: body.synopsis,
            isbn: body.isbn ?? null,
            coverUrl: body.coverUrl ?? null,
            language: body.language ?? null,
            rating: new Prisma.Decimal(body.rating),
            genres: { create: body.genreIds.map(genreId => ({ genreId })) },
          },
          include: bookInclude,
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.bookCreate,
          entityType: AuditEntityType.enum.book,
          entityId: row.id,
          after: snapshot(row),
        });
        return row;
      });
      hooks.afterWrite?.(created.id);
      return toBook(created);
    },

    async update(actor: Actor, id: number, body: UpdateBookBody): Promise<Book> {
      authorize(actor, Role.enum.LIBRARIAN);
      const updated = await prisma.$transaction(async tx => {
        const before = await load(tx, id);
        if (body.genreIds !== undefined) await ensureActiveGenres(tx, body.genreIds);
        if (body.isbn !== undefined && body.isbn !== null) await ensureIsbnFree(tx, body.isbn, id);

        const data: Prisma.BookUpdateManyMutationInput = {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.author !== undefined ? { author: body.author } : {}),
          ...(body.publishedYear !== undefined ? { publishedYear: body.publishedYear } : {}),
          ...(body.synopsis !== undefined ? { synopsis: body.synopsis } : {}),
          ...(body.isbn !== undefined ? { isbn: body.isbn } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl } : {}),
          ...(body.language !== undefined ? { language: body.language } : {}),
          ...(body.rating !== undefined ? { rating: new Prisma.Decimal(body.rating) } : {}),
        };
        await guardedUpdate(tx, id, body.version, data);
        if (body.genreIds !== undefined) {
          await tx.bookGenre.deleteMany({ where: { bookId: id } });
          await tx.bookGenre.createMany({
            data: body.genreIds.map(genreId => ({ bookId: id, genreId })),
          });
        }
        const after = await load(tx, id);
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.bookUpdate,
          entityType: AuditEntityType.enum.book,
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        });
        return after;
      });
      hooks.afterWrite?.(updated.id);
      return toBook(updated);
    },

    async archive(actor: Actor, id: number, version: number): Promise<Book> {
      authorize(actor, Role.enum.LIBRARIAN);
      const updated = await prisma.$transaction(async tx => {
        const before = await load(tx, id);
        if (before.archivedAt !== null)
          throw conflict(ApiErrorCode.enum.CONFLICT, 'Book is already archived');
        await guardedUpdate(tx, id, version, { archivedAt: new Date() }, { archivedAt: null });
        const after = await load(tx, id);
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.bookArchive,
          entityType: AuditEntityType.enum.book,
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        });
        return after;
      });
      hooks.afterWrite?.(updated.id);
      return toBook(updated);
    },

    async restore(actor: Actor, id: number, version: number): Promise<Book> {
      authorize(actor, Role.enum.LIBRARIAN);
      const updated = await prisma.$transaction(async tx => {
        const before = await load(tx, id);
        if (before.archivedAt === null)
          throw conflict(ApiErrorCode.enum.CONFLICT, 'Book is not archived');
        await guardedUpdate(tx, id, version, { archivedAt: null }, { archivedAt: { not: null } });
        const after = await load(tx, id);
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.bookRestore,
          entityType: AuditEntityType.enum.book,
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        });
        return after;
      });
      hooks.afterWrite?.(updated.id);
      return toBook(updated);
    },
  };
};

export type BooksService = ReturnType<typeof createBooksService>;
