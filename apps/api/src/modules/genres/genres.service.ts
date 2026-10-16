import { MESSAGES } from '../../config/constants.js';
import { AUDIT_ACTIONS, AuditEntityType, Role, ApiErrorCode } from '@library/contracts';
import type {
  CreateGenreBody,
  Genre,
  GenreInUseDetails,
  UpdateGenreBody,
} from '@library/contracts';
import { authorize } from '../../lib/authz.js';
import { writeAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { slugify } from '../../lib/slug.js';

const activeBooksCount = { books: { where: { book: { archivedAt: null } } } } as const;

interface GenreRow {
  id: number;
  name: string;
  slug: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { books: number };
}

export const toGenreDto = (row: GenreRow): Genre => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
  activeBookCount: row._count.books,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const createGenresService = (prisma: PrismaClient) => {
  const load = async (id: number): Promise<GenreRow> => {
    const row = await prisma.genre.findUnique({
      where: { id },
      include: { _count: { select: activeBooksCount } },
    });
    if (!row) throw notFound(MESSAGES.genreNotFound);
    return row;
  };

  const ensureNameFree = async (name: string, exceptId?: number): Promise<void> => {
    const clash = await prisma.genre.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId !== undefined ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw conflict(ApiErrorCode.enum.CONFLICT, 'A genre with this name already exists');
  };

  const blockingBooks = async (genreId: number): Promise<GenreInUseDetails['books']> =>
    prisma.book.findMany({
      where: {
        archivedAt: null,
        genres: {
          some: { genreId },
          none: { genreId: { not: genreId }, genre: { archivedAt: null } },
        },
      },
      select: { id: true, title: true },
      orderBy: { id: 'asc' },
    });

  return {
    async list(actor: Actor, options: { includeArchived: boolean }): Promise<Genre[]> {
      if (options.includeArchived) authorize(actor, Role.enum.LIBRARIAN);
      const rows = await prisma.genre.findMany({
        where: options.includeArchived ? {} : { archivedAt: null },
        include: { _count: { select: activeBooksCount } },
        orderBy: { name: 'asc' },
      });
      return rows.map(toGenreDto);
    },

    async getActiveByIds(ids: number[]) {
      return prisma.genre.findMany({
        where: { id: { in: ids }, archivedAt: null },
        select: { id: true, name: true, slug: true },
      });
    },

    async create(actor: Actor, body: CreateGenreBody): Promise<Genre> {
      authorize(actor, Role.enum.LIBRARIAN);
      await ensureNameFree(body.name);
      const created = await prisma.$transaction(async tx => {
        const row = await tx.genre.create({
          data: { name: body.name, slug: slugify(body.name) },
          include: { _count: { select: activeBooksCount } },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.genreCreate,
          entityType: AuditEntityType.enum.genre,
          entityId: row.id,
          after: { name: row.name, slug: row.slug },
        });
        return row;
      });
      return toGenreDto(created);
    },

    async rename(actor: Actor, id: number, body: UpdateGenreBody): Promise<Genre> {
      authorize(actor, Role.enum.LIBRARIAN);
      const before = await load(id);
      await ensureNameFree(body.name, id);
      const updated = await prisma.$transaction(async tx => {
        const row = await tx.genre.update({
          where: { id },
          data: { name: body.name, slug: slugify(body.name) },
          include: { _count: { select: activeBooksCount } },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.genreRename,
          entityType: AuditEntityType.enum.genre,
          entityId: id,
          before: { name: before.name, slug: before.slug },
          after: { name: row.name, slug: row.slug },
        });
        return row;
      });
      return toGenreDto(updated);
    },

    async archive(actor: Actor, id: number): Promise<Genre> {
      authorize(actor, Role.enum.LIBRARIAN);
      const before = await load(id);
      if (before.archivedAt !== null)
        throw conflict(ApiErrorCode.enum.CONFLICT, 'Genre is already archived');
      const books = await blockingBooks(id);
      if (books.length > 0) {
        const details: GenreInUseDetails = { genreId: id, books };
        throw conflict(
          ApiErrorCode.enum.GENRE_IN_USE,
          'This genre is the only active genre of active books',
          details
        );
      }
      const updated = await prisma.$transaction(async tx => {
        const row = await tx.genre.update({
          where: { id },
          data: { archivedAt: new Date() },
          include: { _count: { select: activeBooksCount } },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.genreArchive,
          entityType: AuditEntityType.enum.genre,
          entityId: id,
          before: { archivedAt: null },
          after: { archivedAt: row.archivedAt },
        });
        return row;
      });
      return toGenreDto(updated);
    },

    async restore(actor: Actor, id: number): Promise<Genre> {
      authorize(actor, Role.enum.LIBRARIAN);
      const before = await load(id);
      if (before.archivedAt === null)
        throw conflict(ApiErrorCode.enum.CONFLICT, 'Genre is not archived');
      const updated = await prisma.$transaction(async tx => {
        const row = await tx.genre.update({
          where: { id },
          data: { archivedAt: null },
          include: { _count: { select: activeBooksCount } },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.genreRestore,
          entityType: AuditEntityType.enum.genre,
          entityId: id,
          before: { archivedAt: before.archivedAt },
          after: { archivedAt: null },
        });
        return row;
      });
      return toGenreDto(updated);
    },
  };
};

export type GenresService = ReturnType<typeof createGenresService>;
