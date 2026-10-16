import { createHash } from 'node:crypto';
import type { EmbeddingSource, VectorStorePort } from '../ports/index.js';
import { embeddingCostUsd } from '../cost/usage.js';
import type { EmbeddingProvider } from '../providers/types.js';

export const contentHash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

export interface SyncResult {
  considered: number;
  embedded: number;
  skipped: number;
  model: string;
  tokens: number;
  costUsd: number;
  latencyMs: number;
}

export const syncEmbeddings = async (
  sources: EmbeddingSource[],
  embeddings: EmbeddingProvider,
  vectorStore: VectorStorePort,
  options: { batchSize?: number; signal?: AbortSignal } = {}
): Promise<SyncResult> => {
  const batchSize = options.batchSize ?? 16;
  const stored = await vectorStore.hashes();
  const stale = sources.filter(source => {
    const row = stored.get(source.id);
    return (
      !row ||
      row.contentHash !== source.contentHash ||
      row.model !== embeddings.model ||
      row.dimensions !== embeddings.dimensions
    );
  });
  const started = Date.now();
  let tokens = 0;
  for (let i = 0; i < stale.length; i += batchSize) {
    const batch = stale.slice(i, i + batchSize);
    const { vectors, tokens: used } = await embeddings.embed(
      batch.map(source => source.text),
      options.signal,
      { purpose: 'document' }
    );
    tokens += used;
    await vectorStore.upsert(
      batch.map((source, index) => ({
        bookId: source.id,
        vector: vectors[index]!,
        contentHash: source.contentHash,
        model: embeddings.model,
        dimensions: embeddings.dimensions,
      }))
    );
  }
  return {
    considered: sources.length,
    embedded: stale.length,
    skipped: sources.length - stale.length,
    model: embeddings.model,
    tokens,
    costUsd: embeddingCostUsd(embeddings.model, tokens),
    latencyMs: Date.now() - started,
  };
};
