import { createAnthropicFamilyProvider } from './anthropicMessages.js';
import type { MessagesClient } from './anthropicMessages.js';
import type { LlmProvider, Tier } from './types.js';
import { AiProviderName } from '@library/contracts';

export interface AnthropicOptions {
  apiKey: string;
  models: Record<Tier, string>;
  temperatures: Record<Tier, number>;
  timeoutMs?: number;
}

export const createAnthropicProvider = (options: AnthropicOptions): LlmProvider =>
  createAnthropicFamilyProvider({
    name: AiProviderName.enum.anthropic,
    models: options.models,
    temperatures: options.temperatures,
    client: async () => {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      return new Anthropic({
        apiKey: options.apiKey,
        timeout: options.timeoutMs ?? 45_000,
        maxRetries: 1,
      }) as unknown as MessagesClient;
    },
  });
