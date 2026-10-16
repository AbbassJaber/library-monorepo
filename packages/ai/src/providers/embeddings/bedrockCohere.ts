import { estimateTokens } from '../../cost/budgets.js';
import { ProviderUnavailableError } from '../types.js';
import type { EmbeddingProvider } from '../types.js';
import { EmbeddingProviderName } from '@library/contracts';

const MAX_TEXTS = 96;

export const isCohereEmbedModel = (model: string): boolean => /(^|\.)cohere\.embed-/.test(model);

const isV4 = (model: string) => model.includes('embed-v4');

interface RuntimeClient {
  send(
    input: { modelId: string; body: string },
    signal?: AbortSignal
  ): Promise<{ body: Uint8Array }>;
}

export interface CohereOptions {
  region: string;
  model: string;
  dimensions: number;
  client?: RuntimeClient;
}

export const createBedrockCohereProvider = (options: CohereOptions): EmbeddingProvider => {
  const { model, dimensions } = options;
  if (isV4(model) ? ![256, 512, 1024, 1536].includes(dimensions) : dimensions !== 1024)
    throw new Error(
      isV4(model)
        ? 'EMBEDDING_DIMENSIONS for Cohere Embed v4 must be 256, 512, 1024 or 1536'
        : 'EMBEDDING_DIMENSIONS for Cohere Embed v3 must be 1024'
    );
  let clientPromise: Promise<RuntimeClient> | undefined;
  const client = () =>
    (clientPromise ??= options.client
      ? Promise.resolve(options.client)
      : (async () => {
          const { BedrockRuntimeClient, InvokeModelCommand } =
            await import('@aws-sdk/client-bedrock-runtime');
          const runtime = new BedrockRuntimeClient({ region: options.region });
          return {
            send: (input, signal) =>
              runtime.send(
                new InvokeModelCommand({
                  modelId: input.modelId,
                  contentType: 'application/json',
                  accept: 'application/json',
                  body: input.body,
                }),
                signal ? { abortSignal: signal } : undefined
              ) as Promise<{ body: Uint8Array }>,
          };
        })());
  return {
    name: EmbeddingProviderName.enum.bedrock,
    model,
    dimensions,
    async embed(texts, signal, embedOptions) {
      const inputType = embedOptions?.purpose === 'query' ? 'search_query' : 'search_document';
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_TEXTS) {
        const batch = texts.slice(i, i + MAX_TEXTS);
        const body = isV4(model)
          ? {
              texts: batch,
              input_type: inputType,
              embedding_types: ['float'],
              output_dimension: dimensions,
            }
          : { texts: batch, input_type: inputType, truncate: 'END' };
        try {
          const response = await (
            await client()
          ).send({ modelId: model, body: JSON.stringify(body) }, signal);
          const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
            embeddings: number[][] | { float: number[][] };
          };
          vectors.push(
            ...(Array.isArray(parsed.embeddings) ? parsed.embeddings : parsed.embeddings.float)
          );
        } catch (error) {
          throw new ProviderUnavailableError(
            `bedrock cohere: ${String((error as Error).message)}`,
            error
          );
        }
      }
      return { vectors, tokens: texts.reduce((sum, text) => sum + estimateTokens(text), 0) };
    },
  };
};
