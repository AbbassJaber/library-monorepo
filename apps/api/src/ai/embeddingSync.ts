import { contentHash, expandForEmbedding, syncEmbeddings } from '@library/ai';
import type { EmbeddingSource, SyncResult } from '@library/ai';
import type { Logger } from '../lib/logger.js';
import type { PrismaClient } from '../lib/prisma.js';
import { bookInclude } from '../modules/books/books.mapper.js';
import { embeddingText } from './adapters/catalog.adapter.js';
import type { AiRuntime } from './adapters/index.js';
import { AiFeature } from '@library/contracts';

export interface EmbeddingSync {
  syncAll(): Promise<SyncResult>;
  syncBook(bookId: number): Promise<void>;
}

const traceSync = async (runtime: AiRuntime, result: SyncResult): Promise<void> => {
  if (result.embedded === 0) return;
  await runtime.ports.trace.record({
    userId: null,
    feature: AiFeature.enum.EMBEDDING,
    provider: runtime.embeddings.name,
    model: result.model,
    tokensIn: result.tokens,
    tokensOut: 0,
    tokensCachedRead: 0,
    tokensCachedWrite: 0,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    success: true,
    fallbackUsed: false,
    errorCode: null,
    requestId: null,
  });
};

const expandIfOn = async (
  runtime: AiRuntime,
  sources: EmbeddingSource[],
  logger: Logger
): Promise<EmbeddingSource[]> => {
  if (!runtime.options.expansion) return sources;
  const result = await expandForEmbedding({ llm: runtime.llm, ports: runtime.ports }, sources);
  if (result.generated + result.failed > 0)
    logger.info('document expansion', {
      generated: result.generated,
      reused: result.reused,
      failed: result.failed,
      throttleRetries: result.throttleRetries,
      costUsd: result.costUsd,
    });
  return result.sources;
};

export const createEmbeddingSync = (
  runtime: AiRuntime,
  prisma: PrismaClient,
  logger: Logger
): EmbeddingSync => {
  let running: Promise<SyncResult> | null = null;
  const runAll = async (): Promise<SyncResult> => {
    const sources = await expandIfOn(
      runtime,
      await runtime.ports.catalog.listBooksForEmbedding(),
      logger
    );
    const result = await syncEmbeddings(sources, runtime.embeddings, runtime.ports.vectorStore);
    await traceSync(runtime, result);
    if (result.embedded > 0) logger.info('embedding sync', { ...result });
    return result;
  };
  return {
    syncAll() {
      running ??= runAll().finally(() => {
        running = null;
      });
      return running;
    },
    async syncBook(bookId) {
      const row = await prisma.book.findUnique({ where: { id: bookId }, include: bookInclude });
      if (!row || row.archivedAt !== null) {
        await prisma.bookEmbedding.deleteMany({ where: { bookId } });
        return;
      }
      const text = embeddingText(row);
      const result = await syncEmbeddings(
        await expandIfOn(runtime, [{ id: row.id, text, contentHash: contentHash(text) }], logger),
        runtime.embeddings,
        runtime.ports.vectorStore
      );
      await traceSync(runtime, result);
    },
  };
};

export const syncInBackground = (sync: EmbeddingSync, logger: Logger, bookId: number): void => {
  sync.syncBook(bookId).catch((error: unknown) => {
    logger.warn('embedding sync failed', { bookId, error: String((error as Error).message) });
  });
};
