import { ProviderUnavailableError } from '../types.js';
import type { EmbeddingProvider } from '../types.js';
import { EmbeddingProviderName } from '@library/contracts';

export const TITAN_EMBED_V2 = 'amazon.titan-embed-text-v2:0';

export interface TitanOptions {
  region: string;
  model?: string;
  dimensions?: 256 | 512 | 1024;
}

export const createBedrockTitanProvider = (options: TitanOptions): EmbeddingProvider => {
  const model = options.model ?? TITAN_EMBED_V2;
  const dimensions = options.dimensions ?? 512;
  let clientPromise:
    | Promise<{
        send: (command: unknown, opts?: { abortSignal?: AbortSignal }) => Promise<unknown>;
        InvokeModelCommand: new (input: unknown) => unknown;
      }>
    | undefined;
  const client = () =>
    (clientPromise ??= (async () => {
      const { BedrockRuntimeClient, InvokeModelCommand } =
        await import('@aws-sdk/client-bedrock-runtime');
      const runtime = new BedrockRuntimeClient({ region: options.region });
      return {
        send: (command: unknown, opts?: { abortSignal?: AbortSignal }) =>
          runtime.send(command as never, opts),
        InvokeModelCommand: InvokeModelCommand as unknown as new (input: unknown) => unknown,
      };
    })());
  return {
    name: EmbeddingProviderName.enum.bedrock,
    model,
    dimensions,
    async embed(texts, signal) {
      const { send, InvokeModelCommand } = await client();
      const vectors: number[][] = [];
      let tokens = 0;
      for (const text of texts) {
        try {
          const response = (await send(
            new InvokeModelCommand({
              modelId: model,
              contentType: 'application/json',
              accept: 'application/json',
              body: JSON.stringify({ inputText: text, dimensions, normalize: true }),
            }),
            signal ? { abortSignal: signal } : undefined
          )) as { body: Uint8Array };
          const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
            embedding: number[];
            inputTextTokenCount?: number;
          };
          vectors.push(parsed.embedding);
          tokens += parsed.inputTextTokenCount ?? 0;
        } catch (error) {
          throw new ProviderUnavailableError(
            `bedrock titan: ${String((error as Error).message)}`,
            error
          );
        }
      }
      return { vectors, tokens };
    },
  };
};
