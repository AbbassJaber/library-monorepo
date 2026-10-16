import { z } from 'zod';
import { Id, IsoDate, PageQuery, PaginationMeta, Role, listFromQuery } from './common.js';
import { AUDIT_ACTIONS } from './constants.js';

export const AuditSource = z.enum(['HTTP', 'AI', 'SEED']);
export type AuditSource = z.infer<typeof AuditSource>;

export const AuditEntityType = z.enum([
  'book',
  'genre',
  'reading_list_entry',
  'favorite_genre',
  'user',
]);
export type AuditEntityType = z.infer<typeof AuditEntityType>;

export const AuditAction = z.enum(Object.values(AUDIT_ACTIONS));
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditActor = z
  .object({ id: Id, displayName: z.string(), role: Role })
  .meta({ id: 'AuditActor' });
export type AuditActor = z.infer<typeof AuditActor>;

export const AuditLogEntry = z
  .object({
    id: Id,
    actorId: Id.nullable(),
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: Id,
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    source: AuditSource,
    requestId: z.string().nullable(),
    createdAt: IsoDate,
    actor: AuditActor.nullable().optional(),
    entityLabel: z.string().nullable().optional(),
  })
  .meta({ id: 'AuditLogEntry' });
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const AuditQuery = PageQuery.extend({
  entityType: z.preprocess(
    listFromQuery,
    z.array(AuditEntityType).min(1).max(AuditEntityType.options.length).optional()
  ),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditListResponse = z.object({
  items: z.array(AuditLogEntry),
  meta: PaginationMeta,
});
export type AuditListResponse = z.infer<typeof AuditListResponse>;
