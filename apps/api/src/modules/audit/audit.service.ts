import type { AuditListResponse, AuditLogEntry, AuditQuery } from '@library/contracts';
import { AuditEntityType, Role } from '@library/contracts';
import { authorize } from '../../lib/authz.js';
import { paginationMeta } from '../../lib/envelope.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';

type Row = { actorId: number | null; entityType: string; entityId: number };

const idsOf = (rows: Row[], type: string) => [
  ...new Set(rows.filter(row => row.entityType === type).map(row => row.entityId)),
];

const namesFor = async (prisma: PrismaClient, rows: Row[]) => {
  const userIds = [
    ...new Set([
      ...rows.flatMap(row => (row.actorId === null ? [] : [row.actorId])),
      ...idsOf(rows, AuditEntityType.enum.user),
    ]),
  ];
  const [users, books, genres, entries] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, role: true },
    }),
    prisma.book.findMany({
      where: { id: { in: idsOf(rows, AuditEntityType.enum.book) } },
      select: { id: true, title: true },
    }),
    prisma.genre.findMany({
      where: { id: { in: idsOf(rows, AuditEntityType.enum.genre) } },
      select: { id: true, name: true },
    }),
    prisma.readingListEntry.findMany({
      where: { id: { in: idsOf(rows, AuditEntityType.enum.reading_list_entry) } },
      select: { id: true, book: { select: { title: true } } },
    }),
  ]);
  const user = new Map(users.map(u => [u.id, u]));
  const labels: Record<string, Map<number, string>> = {
    [AuditEntityType.enum.book]: new Map(books.map(b => [b.id, b.title])),
    [AuditEntityType.enum.genre]: new Map(genres.map(g => [g.id, g.name])),
    [AuditEntityType.enum.reading_list_entry]: new Map(entries.map(e => [e.id, e.book.title])),
    [AuditEntityType.enum.user]: new Map(users.map(u => [u.id, u.displayName])),
  };
  return {
    actor: (id: number | null) => (id === null ? null : (user.get(id) ?? null)),
    label: (row: Row) => labels[row.entityType]?.get(row.entityId) ?? null,
  };
};

export const createAuditService = (prisma: PrismaClient) => ({
  async list(actor: Actor, query: AuditQuery): Promise<AuditListResponse> {
    authorize(actor, Role.enum.LIBRARIAN);
    const where = query.entityType === undefined ? {} : { entityType: { in: query.entityType } };
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const names = await namesFor(prisma, rows);
    const items: AuditLogEntry[] = rows.map(row => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action as AuditLogEntry['action'],
      entityType: row.entityType as AuditLogEntry['entityType'],
      entityId: row.entityId,
      before: row.before ?? null,
      after: row.after ?? null,
      source: row.source,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      actor: names.actor(row.actorId),
      entityLabel: names.label(row),
    }));
    return { items, meta: paginationMeta(total, query.page, query.pageSize) };
  },
});

export type AuditService = ReturnType<typeof createAuditService>;
