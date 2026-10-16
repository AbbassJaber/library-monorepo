import type { PendingActionPort, StoredPendingAction } from '@library/ai';
import type { PrismaClient } from '../../lib/prisma.js';
import { ChatLocale } from '@library/contracts';

const STATUS = { confirmed: 'CONFIRMED', cancelled: 'CANCELLED' } as const;

export const createPendingActionAdapter = (prisma: PrismaClient): PendingActionPort => ({
  async create(action) {
    await prisma.pendingAction.create({
      data: {
        id: action.id,
        userId: action.actorId,
        tool: action.tool,
        input: action.input as object,
        summary: action.summary,
        locale: action.locale,
        expiresAt: new Date(action.expiresAt),
      },
    });
  },
  async decide(id, actorId, decision) {
    const now = new Date();
    const { count } = await prisma.pendingAction.updateMany({
      where: { id, userId: actorId, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: STATUS[decision], decidedAt: now },
    });
    if (count === 0) return null;
    const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id } });
    const action: StoredPendingAction = {
      id: row.id,
      actorId: row.userId,
      tool: row.tool,
      input: row.input,
      summary: row.summary,
      locale: row.locale === 'fr' ? ChatLocale.enum.fr : ChatLocale.enum.en,
      expiresAt: row.expiresAt.toISOString(),
    };
    return action;
  },
  async finish(id, outcome) {
    await prisma.pendingAction.update({
      where: { id },
      data: { ok: outcome.ok, error: outcome.error ?? null },
    });
  },
});
