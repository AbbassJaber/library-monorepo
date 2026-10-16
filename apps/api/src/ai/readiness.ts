import type { EmbeddingProvider } from '@library/ai';
import type { Logger } from '../lib/logger.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { EmbeddingSync } from './embeddingSync.js';

export type Readiness =
  { ready: true } | { ready: false; reason: 'embeddings_pending'; missing: number; model: string };

export const createReadiness = (deps: {
  prisma: PrismaClient;
  sync: EmbeddingSync;
  embeddings: Pick<EmbeddingProvider, 'model' | 'dimensions'>;
  logger: Logger;
}): (() => Promise<Readiness>) => {
  const { model, dimensions } = deps.embeddings;
  return async () => {
    const missing = await deps.prisma.book.count({
      where: { archivedAt: null, NOT: { embedding: { is: { model, dimensions } } } },
    });
    if (missing === 0) return { ready: true };
    deps.sync.syncAll().catch((error: unknown) => {
      deps.logger.warn('embedding sync for readiness failed', {
        error: String((error as Error).message),
      });
    });
    return { ready: false, reason: 'embeddings_pending', missing, model };
  };
};
