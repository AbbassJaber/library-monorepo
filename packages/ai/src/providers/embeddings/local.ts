import { estimateTokens } from '../../cost/budgets.js';
import { ProviderUnavailableError } from '../types.js';
import type { EmbeddingProvider } from '../types.js';
import { EmbeddingProviderName } from '@library/contracts';

export const LOCAL_EMBED_MODEL = 'Xenova/bge-small-en-v1.5';

export const createLocalEmbeddingProvider = (
  options: { model?: string; cacheDir?: string } = {}
): EmbeddingProvider => {
  const model = options.model ?? LOCAL_EMBED_MODEL;
  type Extractor = (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean }
  ) => Promise<{ tolist: () => number[][] }>;
  let extractorPromise: Promise<Extractor> | undefined;
  const extractor = () =>
    (extractorPromise ??= (async () => {
      const transformers = await import('@xenova/transformers').catch((error: unknown) => {
        throw new ProviderUnavailableError(
          'EMBEDDING_PROVIDER=local needs @xenova/transformers in the runtime (build the API image with WITH_LOCAL_EMBEDDINGS=true)',
          error
        );
      });
      if (options.cacheDir) transformers.env.cacheDir = options.cacheDir;
      const pipe = await transformers.pipeline('feature-extraction', model);
      return pipe as unknown as Extractor;
    })());
  return {
    name: EmbeddingProviderName.enum.local,
    model,
    dimensions: 384,
    async embed(texts) {
      try {
        const run = await extractor();
        const output = await run(texts, { pooling: 'mean', normalize: true });
        return {
          vectors: output.tolist(),
          tokens: texts.reduce((sum, text) => sum + estimateTokens(text), 0),
        };
      } catch (error) {
        throw new ProviderUnavailableError(
          `local embeddings: ${String((error as Error).message)}`,
          error
        );
      }
    },
  };
};
