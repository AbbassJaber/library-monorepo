import { AuditSource, type AuditEntityType } from '@library/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { getRequestContext } from './requestContext.js';

export interface AuditInput {
  action: string;
  entityType: AuditEntityType;
  entityId: number;
  before?: unknown;
  after?: unknown;
  source?: AuditSource;
  actorId?: number | null;
}

export type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

const asJson = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

export const writeAudit = async (tx: AuditWriter, input: AuditInput): Promise<void> => {
  const context = getRequestContext();
  const actorId = input.actorId === undefined ? (context?.actor?.id ?? null) : input.actorId;
  const before = asJson(input.before);
  const after = asJson(input.after);
  await tx.auditLog.create({
    data: {
      actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      source: input.source ?? AuditSource.enum.HTTP,
      requestId: context?.requestId ?? null,
    },
  });
};
