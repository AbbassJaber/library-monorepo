import { createAnthropicFamilyProvider } from './anthropicMessages.js';
import type { MessagesClient } from './anthropicMessages.js';
import type { LlmProvider, Tier } from './types.js';
import { AiProviderName } from '@library/contracts';

export interface BedrockOptions {
  region: string;
  models: Record<Tier, string>;
  temperatures: Record<Tier, number>;
  timeoutMs?: number;
}

export const createBedrockProvider = (options: BedrockOptions): LlmProvider =>
  createAnthropicFamilyProvider({
    name: AiProviderName.enum.bedrock,
    models: options.models,
    temperatures: options.temperatures,
    client: async () => {
      const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
      return new AnthropicBedrock({
        awsRegion: options.region,
        timeout: options.timeoutMs ?? 45_000,
        maxRetries: 1,
      }) as unknown as MessagesClient;
    },
  });
