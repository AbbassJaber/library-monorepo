import { describe, expect, it } from 'vitest';
import { createMockProvider } from './mock/index.js';
import { selectLlmProvider } from './select.js';
import { createTieredProvider } from './tiered.js';
import type { LlmProvider } from './types.js';
import { ForcedToolChoiceMode, AiTier } from '@library/contracts';

const named = (
  name: 'bedrock' | 'kimi',
  models: { small: string; strong: string }
): LlmProvider => ({
  ...createMockProvider(),
  name,
  models,
  supportsPromptCaching: name === 'bedrock',
  forcedToolChoice:
    name === 'bedrock'
      ? ForcedToolChoiceMode.enum.forced
      : ForcedToolChoiceMode.enum['auto-with-instruction'],
  generate: async request => ({
    ...(await createMockProvider().generate(request)),
    model: models[request.tier],
    provider: name,
  }),
});

describe('tiered provider (AI_PROVIDER_STRONG)', () => {
  it('routes small calls to one provider and strong calls to the other, and says which', async () => {
    const llm = createTieredProvider({
      small: named('bedrock', { small: 'eu.haiku', strong: 'eu.haiku' }),
      strong: named('kimi', { small: 'kimi-k3', strong: 'kimi-k3' }),
    });
    expect(llm.models).toEqual({ small: 'eu.haiku', strong: 'kimi-k3' });
    const base = {
      system: [],
      messages: [{ role: 'user' as const, content: 'x' }],
      maxOutputTokens: 5,
    };
    expect(await llm.generate({ ...base, tier: AiTier.enum.small })).toMatchObject({
      provider: 'bedrock',
      model: 'eu.haiku',
    });
    expect(await llm.generate({ ...base, tier: AiTier.enum.strong })).toMatchObject({
      provider: 'kimi',
      model: 'kimi-k3',
    });
    expect(llm.tiers).toEqual({
      small: {
        provider: 'bedrock',
        model: 'eu.haiku',
        supportsPromptCaching: true,
        forcedToolChoice: 'forced',
      },
      strong: {
        provider: 'kimi',
        model: 'kimi-k3',
        supportsPromptCaching: false,
        forcedToolChoice: 'auto-with-instruction',
      },
    });
    expect(llm.name).toBe('bedrock');
  });

  it('select builds it from env: Haiku on Bedrock as small, Kimi K3 as strong', () => {
    const llm = selectLlmProvider({
      AI_PROVIDER: 'bedrock',
      AWS_REGION: 'eu-central-1',
      AI_MODEL_SMALL: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      AI_PROVIDER_STRONG: 'kimi',
      AI_MODEL_STRONG: 'kimi-k3',
      OPENAI_COMPAT_API_KEY: 'k',
    });
    expect(llm.tiers).toMatchObject({
      small: {
        provider: 'bedrock',
        model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
        supportsPromptCaching: true,
        forcedToolChoice: 'forced',
      },
      strong: {
        provider: 'kimi',
        model: 'kimi-k3',
        supportsPromptCaching: true,
        forcedToolChoice: 'auto-with-instruction',
      },
    });
  });

  it('a provider-prefixed id wins for that provider, so one .env serves the API and the eval', () => {
    const llm = selectLlmProvider({
      AI_PROVIDER: 'bedrock',
      AWS_REGION: 'eu-central-1',
      AI_MODEL_SMALL: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      AI_MODEL_STRONG: 'eu.anthropic.claude-sonnet-5-5',
      AI_PROVIDER_STRONG: 'kimi',
      KIMI_MODEL_STRONG: 'kimi-k3',
      OPENAI_COMPAT_API_KEY: 'k',
    });
    expect(llm.tiers.small.model).toBe('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(llm.tiers.strong).toMatchObject({ provider: 'kimi', model: 'kimi-k3' });
    expect(
      selectLlmProvider({
        AI_PROVIDER: 'bedrock',
        AWS_REGION: 'eu-central-1',
        AI_MODEL_SMALL: 'small-id',
        AI_MODEL_STRONG: 'strong-id',
        BEDROCK_MODEL_STRONG: 'bedrock-strong-id',
      }).tiers.strong.model
    ).toBe('bedrock-strong-id');
  });

  it('a single provider reports the same provider for both tiers', () => {
    const llm = selectLlmProvider({
      AI_PROVIDER: 'kimi',
      AI_MODEL_SMALL: 'kimi-k2.6',
      AI_MODEL_STRONG: 'kimi-k3',
      OPENAI_COMPAT_API_KEY: 'k',
    });
    expect(llm.tiers.small.provider).toBe('kimi');
    expect(llm.tiers.strong).toMatchObject({ provider: 'kimi', model: 'kimi-k3' });
    expect(llm).toMatchObject({
      supportsPromptCaching: true,
      forcedToolChoice: 'auto-with-instruction',
    });
    expect(selectLlmProvider({}).tiers.small).toMatchObject({
      provider: 'mock',
      model: 'mock-small',
    });
  });
});
