import type { AiRunInput, TracePort } from '@library/ai';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

export const createTraceAdapter = (prisma: PrismaClient): TracePort => ({
  async record(run: AiRunInput) {
    const row = await prisma.aiRun.create({
      data: {
        userId: run.userId,
        feature: run.feature,
        provider: run.provider,
        model: run.model,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
        tokensCachedRead: run.tokensCachedRead,
        tokensCachedWrite: run.tokensCachedWrite,
        tokensSpeechIn: run.tokensSpeechIn ?? 0,
        tokensSpeechOut: run.tokensSpeechOut ?? 0,
        costUsd: new Prisma.Decimal(run.costUsd.toFixed(8)),
        latencyMs: run.latencyMs,
        success: run.success,
        fallbackUsed: run.fallbackUsed,
        errorCode: run.errorCode,
        requestId: run.requestId,
      },
      select: { id: true },
    });
    return row.id;
  },
});
