import { MESSAGES } from '../../config/constants.js';
import { AUDIT_ACTIONS, AuditEntityType, ApiErrorCode } from '@library/contracts';
import type {
  AddToShelfBody,
  ReadingListBatchResponse,
  ReadingListChange,
  ReadingListEntry,
  ReadingState,
} from '@library/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { isLibrarian } from '../../lib/authz.js';
import { writeAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { bookInclude, toBookSummary } from '../books/books.mapper.js';

const entryInclude = { book: { include: bookInclude } } satisfies Prisma.ReadingListEntryInclude;
type EntryRow = Prisma.ReadingListEntryGetPayload<{ include: typeof entryInclude }>;

export const toEntryDto = (row: EntryRow): ReadingListEntry => ({
  id: row.id,
  state: row.state,
  book: toBookSummary(row.book),
  available: row.book.archivedAt === null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const createShelfService = (prisma: PrismaClient) => {
  const activeEntry = async (
    db: Pick<Prisma.TransactionClient, 'readingListEntry'>,
    actor: Actor,
    bookId: number
  ) => {
    const row = await db.readingListEntry.findUnique({
      where: { userId_bookId: { userId: actor.id, bookId } },
      include: entryInclude,
    });
    if (!row || row.removedAt !== null) throw notFound(MESSAGES.notOnShelf);
    return row;
  };

  const setStateIn = async (
    tx: Prisma.TransactionClient,
    actor: Actor,
    bookId: number,
    state: ReadingState
  ) => {
    const entry = await activeEntry(tx, actor, bookId);
    if (entry.book.archivedAt !== null) {
      throw conflict(
        ApiErrorCode.enum.BOOK_ARCHIVED,
        'This book is archived; its reading state is locked'
      );
    }
    const updated = await tx.readingListEntry.update({
      where: { id: entry.id },
      data: { state },
      include: entryInclude,
    });
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.shelfUpdate,
      entityType: AuditEntityType.enum.reading_list_entry,
      entityId: entry.id,
      before: { state: entry.state },
      after: { state },
    });
    return updated;
  };

  const removeIn = async (tx: Prisma.TransactionClient, actor: Actor, bookId: number) => {
    const entry = await activeEntry(tx, actor, bookId);
    await tx.readingListEntry.update({
      where: { id: entry.id },
      data: { removedAt: new Date() },
    });
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.shelfRemove,
      entityType: AuditEntityType.enum.reading_list_entry,
      entityId: entry.id,
      before: { bookId, state: entry.state },
    });
  };

  return {
    async list(actor: Actor): Promise<ReadingListEntry[]> {
      const rows = await prisma.readingListEntry.findMany({
        where: { userId: actor.id, removedAt: null },
        include: entryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return rows.map(toEntryDto);
    },

    async add(actor: Actor, body: AddToShelfBody): Promise<ReadingListEntry> {
      const book = await prisma.book.findUnique({
        where: { id: body.bookId },
        select: { id: true, archivedAt: true },
      });
      if (!book || (book.archivedAt !== null && !isLibrarian(actor)))
        throw notFound(MESSAGES.bookNotFound);
      if (book.archivedAt !== null)
        throw conflict(
          ApiErrorCode.enum.BOOK_ARCHIVED,
          'Archived books cannot be added to a reading list'
        );

      const row = await prisma.$transaction(async tx => {
        const existing = await tx.readingListEntry.findUnique({
          where: { userId_bookId: { userId: actor.id, bookId: body.bookId } },
        });
        if (existing && existing.removedAt === null) {
          return tx.readingListEntry.findUniqueOrThrow({
            where: { id: existing.id },
            include: entryInclude,
          });
        }
        const saved = existing
          ? await tx.readingListEntry.update({
              where: { id: existing.id },
              data: { state: body.state, removedAt: null, createdAt: new Date() },
              include: entryInclude,
            })
          : await tx.readingListEntry.create({
              data: { userId: actor.id, bookId: body.bookId, state: body.state },
              include: entryInclude,
            });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.shelfAdd,
          entityType: AuditEntityType.enum.reading_list_entry,
          entityId: saved.id,
          after: { bookId: body.bookId, state: saved.state, reactivated: existing !== null },
        });
        return saved;
      });
      return toEntryDto(row);
    },

    async updateState(
      actor: Actor,
      bookId: number,
      state: ReadingState
    ): Promise<ReadingListEntry> {
      const row = await prisma.$transaction(tx => setStateIn(tx, actor, bookId, state));
      return toEntryDto(row);
    },

    async remove(actor: Actor, bookId: number): Promise<void> {
      await prisma.$transaction(tx => removeIn(tx, actor, bookId));
    },

    async applyBatch(
      actor: Actor,
      changes: ReadingListChange[]
    ): Promise<ReadingListBatchResponse> {
      return prisma.$transaction(async tx => {
        const removed: number[] = [];
        const updated: ReadingListEntry[] = [];
        for (const change of changes) {
          if (change.action === 'remove') {
            await removeIn(tx, actor, change.bookId);
            removed.push(change.bookId);
          } else {
            updated.push(toEntryDto(await setStateIn(tx, actor, change.bookId, change.state)));
          }
        }
        return { removed, updated };
      });
    },

    async activeBookIds(actor: Actor): Promise<number[]> {
      const rows = await prisma.readingListEntry.findMany({
        where: { userId: actor.id, removedAt: null },
        select: { bookId: true },
      });
      return rows.map(row => row.bookId);
    },
  };
};

export type ShelfService = ReturnType<typeof createShelfService>;
