import { ForcedToolChoiceMode, AiProviderName, EmbeddingProviderName } from '@library/contracts';
import { createAnthropicProvider } from './anthropic.js';
import { createBedrockProvider } from './bedrock.js';
import { createBedrockCohereProvider, isCohereEmbedModel } from './embeddings/bedrockCohere.js';
import { createBedrockTitanProvider } from './embeddings/bedrockTitan.js';
import { createLocalEmbeddingProvider } from './embeddings/local.js';
import { createMockEmbeddingProvider } from './embeddings/mock.js';
import { createMockProvider } from './mock/index.js';
import type { MockProviderOptions } from './mock/index.js';
import { MOONSHOT_BASE_URL, createOpenAiCompatibleProvider } from './openaiCompatible.js';
import { createTieredProvider } from './tiered.js';
import type { EmbeddingProvider, LlmProvider } from './types.js';

export interface AiEnv {
  AI_PROVIDER?: string | undefined;
  AI_PROVIDER_STRONG?: string | undefined;
  AI_MODEL_SMALL?: string | undefined;
  AI_MODEL_STRONG?: string | undefined;
  AI_TEMPERATURE_SMALL?: string | undefined;
  AI_TEMPERATURE_STRONG?: string | undefined;
  BEDROCK_MODEL_SMALL?: string | undefined;
  BEDROCK_MODEL_STRONG?: string | undefined;
  ANTHROPIC_MODEL_SMALL?: string | undefined;
  ANTHROPIC_MODEL_STRONG?: string | undefined;
  KIMI_MODEL_SMALL?: string | undefined;
  KIMI_MODEL_STRONG?: string | undefined;
  OPENAI_COMPAT_MODEL_SMALL?: string | undefined;
  OPENAI_COMPAT_MODEL_STRONG?: string | undefined;
  AWS_REGION?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_COMPAT_BASE_URL?: string | undefined;
  OPENAI_COMPAT_API_KEY?: string | undefined;
  EMBEDDING_PROVIDER?: string | undefined;
  EMBEDDING_MODEL?: string | undefined;
  EMBEDDING_DIMENSIONS?: string | number | undefined;
  TRANSFORMERS_CACHE?: string | undefined;
}

export class AiConfigError extends Error {
  override readonly name = 'AiConfigError';
}

const required = (env: AiEnv, key: keyof AiEnv, provider: string): string => {
  const value = String(env[key] ?? '').trim();
  if (!value)
    throw new AiConfigError(`AI_PROVIDER=${provider} needs ${key} (see apps/api/.env.example)`);
  return value;
};

const temperature = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2)
    throw new AiConfigError(`AI_TEMPERATURE_* must be a number between 0 and 2, got "${value}"`);
  return parsed;
};

const isProvider = (value: string): value is AiProviderName =>
  AiProviderName.safeParse(value).success;
const isEmbeddingProvider = (value: string): value is EmbeddingProviderName =>
  EmbeddingProviderName.safeParse(value).success;

export const DEFAULT_EMBEDDING_DIMENSIONS = 384;

type ProviderName = Exclude<AiProviderName, 'mock'>;

const MODEL_PREFIX: Record<ProviderName, string> = {
  bedrock: 'BEDROCK',
  anthropic: 'ANTHROPIC',
  kimi: 'KIMI',
  'openai-compatible': 'OPENAI_COMPAT',
};

const modelFor = (env: AiEnv, provider: ProviderName, tier: 'SMALL' | 'STRONG', label: string) => {
  const own = `${MODEL_PREFIX[provider]}_MODEL_${tier}` as keyof AiEnv;
  const value = String(env[own] ?? '').trim();
  return value || required(env, `AI_MODEL_${tier}`, `${label} (or ${own})`);
};

const buildProvider = (
  name: ProviderName,
  env: AiEnv,
  models: { small: string; strong: string },
  temperatures: { small: number; strong: number }
): LlmProvider => {
  switch (name) {
    case AiProviderName.enum.bedrock:
      return createBedrockProvider({
        region: required(env, 'AWS_REGION', name),
        models,
        temperatures,
      });
    case AiProviderName.enum.anthropic:
      return createAnthropicProvider({
        apiKey: required(env, 'ANTHROPIC_API_KEY', name),
        models,
        temperatures,
      });
    case AiProviderName.enum.kimi:
      return createOpenAiCompatibleProvider({
        name,
        baseUrl: env.OPENAI_COMPAT_BASE_URL?.trim() || MOONSHOT_BASE_URL,
        apiKey: required(env, 'OPENAI_COMPAT_API_KEY', name),
        models,
        temperatures,
        reportsCachedTokens: true,
        forcedToolChoice: ForcedToolChoiceMode.enum['auto-with-instruction'],
      });
    case AiProviderName.enum['openai-compatible']:
      return createOpenAiCompatibleProvider({
        name,
        baseUrl: required(env, 'OPENAI_COMPAT_BASE_URL', name),
        apiKey: required(env, 'OPENAI_COMPAT_API_KEY', name),
        models,
        temperatures,
      });
  }
};

const providerName = (value: string | undefined, key: string): AiProviderName => {
  const name = (value ?? AiProviderName.enum.mock).trim() || AiProviderName.enum.mock;
  if (!isProvider(name))
    throw new AiConfigError(
      `${key} must be bedrock|anthropic|kimi|openai-compatible|mock, got "${name}"`
    );
  return name;
};

export const selectLlmProvider = (env: AiEnv, mock: MockProviderOptions = {}): LlmProvider => {
  const name = providerName(env.AI_PROVIDER, 'AI_PROVIDER');
  const strongName = env.AI_PROVIDER_STRONG?.trim()
    ? providerName(env.AI_PROVIDER_STRONG, 'AI_PROVIDER_STRONG')
    : name;
  const temperatures = {
    small: temperature(env.AI_TEMPERATURE_SMALL, 0),
    strong: temperature(env.AI_TEMPERATURE_STRONG, 0.3),
  };
  if (strongName === name) {
    if (name === AiProviderName.enum.mock) return createMockProvider(mock);
    return buildProvider(
      name,
      env,
      {
        small: modelFor(env, name, 'SMALL', name),
        strong: modelFor(env, name, 'STRONG', name),
      },
      temperatures
    );
  }
  const tierProvider = (tierName: AiProviderName, model: string, temp: number): LlmProvider =>
    tierName === AiProviderName.enum.mock
      ? createMockProvider(mock)
      : buildProvider(
          tierName,
          env,
          { small: model, strong: model },
          { small: temp, strong: temp }
        );
  return createTieredProvider({
    small: tierProvider(
      name,
      name === AiProviderName.enum.mock ? 'mock-small' : modelFor(env, name, 'SMALL', name),
      temperatures.small
    ),
    strong: tierProvider(
      strongName,
      strongName === AiProviderName.enum.mock
        ? 'mock-strong'
        : modelFor(env, strongName, 'STRONG', `${strongName} (AI_PROVIDER_STRONG)`),
      temperatures.strong
    ),
  });
};

export const selectEmbeddingProvider = (env: AiEnv): EmbeddingProvider => {
  const name =
    (env.EMBEDDING_PROVIDER ?? EmbeddingProviderName.enum.mock).trim() ||
    EmbeddingProviderName.enum.mock;
  if (!isEmbeddingProvider(name))
    throw new AiConfigError(`EMBEDDING_PROVIDER must be bedrock|local|mock, got "${name}"`);
  const raw = env.EMBEDDING_DIMENSIONS;
  const dimensions = raw === undefined || raw === '' ? DEFAULT_EMBEDDING_DIMENSIONS : Number(raw);
  if (!Number.isInteger(dimensions) || dimensions < 8)
    throw new AiConfigError(
      `EMBEDDING_DIMENSIONS must be a positive integer, got "${env.EMBEDDING_DIMENSIONS}"`
    );
  switch (name) {
    case EmbeddingProviderName.enum.mock:
      return createMockEmbeddingProvider(dimensions);
    case EmbeddingProviderName.enum.local:
      return createLocalEmbeddingProvider({
        ...(env.EMBEDDING_MODEL?.trim() ? { model: env.EMBEDDING_MODEL.trim() } : {}),
        ...(env.TRANSFORMERS_CACHE?.trim() ? { cacheDir: env.TRANSFORMERS_CACHE.trim() } : {}),
      });
    case EmbeddingProviderName.enum.bedrock: {
      const model = env.EMBEDDING_MODEL?.trim() ?? '';
      if (isCohereEmbedModel(model))
        try {
          return createBedrockCohereProvider({
            region: required(env, 'AWS_REGION', 'bedrock (embeddings)'),
            model,
            dimensions,
          });
        } catch (error) {
          throw new AiConfigError((error as Error).message);
        }
      if (![256, 512, 1024].includes(dimensions))
        throw new AiConfigError('EMBEDDING_DIMENSIONS for Titan v2 must be 256, 512 or 1024');
      return createBedrockTitanProvider({
        region: required(env, 'AWS_REGION', 'bedrock (embeddings)'),
        ...(env.EMBEDDING_MODEL?.trim() ? { model: env.EMBEDDING_MODEL.trim() } : {}),
        dimensions: dimensions as 256 | 512 | 1024,
      });
    }
  }
};
