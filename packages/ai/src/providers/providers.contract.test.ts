import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { inputJsonSchema } from '../tools/registry.js';
import { generateValidated } from '../safety/generateValidated.js';
import { composeSystem } from '../prompts/ordering.js';
import { selectEmbeddingProvider, selectLlmProvider } from './select.js';
import { nlSearch } from '../features/nlSearch.js';
import { createFakePorts, createFakeState, genre, reader } from '../testing/index.js';
import { domain } from '@library/domain-config';
import type { LlmProvider } from './types.js';
import { AiTier } from '@library/contracts';

const envFile = join(import.meta.dirname, '../../../../apps/api/.env');
if (process.env['AI_PROVIDER_TESTS'] === '1' && existsSync(envFile)) process.loadEnvFile(envFile);
const enabled = process.env['AI_PROVIDER_TESTS'] === '1';
const env = process.env;

const Answer = z.object({ city: z.string().min(1), country: z.string().min(1) });
const prompt = (llm: LlmProvider) =>
  generateValidated(
    llm,
    {
      tier: AiTier.enum.small,
      system: composeSystem({
        instructions: 'Answer with the tool only.',
        vocabulary: 'Geography quiz.',
      }),
      messages: [
        { role: 'user', content: 'Which city is the capital of France? Use the answer tool.' },
      ],
      maxOutputTokens: 100,
    },
    { name: 'answer', description: 'Give the city and its country.', schema: Answer },
    inputJsonSchema
  );

const modelsFor = (provider: 'bedrock' | 'kimi' | 'anthropic') => {
  const prefix = provider.toUpperCase();
  const active = env['AI_PROVIDER'] === provider;
  const small = env[`${prefix}_MODEL_SMALL`] ?? (active ? env['AI_MODEL_SMALL'] : undefined);
  const strong = env[`${prefix}_MODEL_STRONG`] ?? (active ? env['AI_MODEL_STRONG'] : undefined);
  return small && strong ? { AI_MODEL_SMALL: small, AI_MODEL_STRONG: strong } : null;
};
const envFor = (provider: 'bedrock' | 'kimi' | 'anthropic') => ({
  ...env,
  ...modelsFor(provider),
  AI_PROVIDER: provider,
});
const titanDimensions = ['256', '512', '1024'].includes(env['EMBEDDING_DIMENSIONS'] ?? '')
  ? (env['EMBEDDING_DIMENSIONS'] as string)
  : '512';

const bedrockReady = Boolean(env['AWS_REGION'] && modelsFor('bedrock'));
const kimiReady = Boolean(env['OPENAI_COMPAT_API_KEY'] && modelsFor('kimi'));
const anthropicReady = Boolean(env['ANTHROPIC_API_KEY'] && modelsFor('anthropic'));

describe.skipIf(!enabled)('real providers', { timeout: 90_000 }, () => {
  it.skipIf(!bedrockReady)(
    'bedrock (Haiku 4.5): forced single tool → Zod-valid object with usage',
    async () => {
      const llm = selectLlmProvider(envFor('bedrock'));
      const result = await prompt(llm);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.city.toLowerCase()).toContain('paris');
      expect(result.attempts[0]?.usage.tokensIn).toBeGreaterThan(0);
      console.log(
        '[bedrock small] forcedToolChoice =',
        llm.forcedToolChoice,
        'usage =',
        result.attempts[0]?.usage
      );
    }
  );

  it.skipIf(!bedrockReady)(
    'bedrock: a ≥ 4096-token stable prefix is read from cache on the second call',
    async () => {
      const llm = selectLlmProvider(envFor('bedrock'));
      const padding = Array.from(
        { length: 700 },
        (_, i) => `Genre alias ${i}: example words for caching tests.`
      ).join(' ');
      const call = () =>
        llm.generate({
          tier: AiTier.enum.small,
          system: composeSystem({ instructions: 'You are a quiz bot.', vocabulary: padding }),
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
          maxOutputTokens: 5,
        });
      const first = await call();
      const second = await call();
      console.log('[bedrock cache] first =', first.usage, 'second =', second.usage);
      expect(first.usage.tokensCachedWrite + first.usage.tokensCachedRead).toBeGreaterThan(0);
      expect(second.usage.tokensCachedRead).toBeGreaterThan(0);
    }
  );

  it.skipIf(!bedrockReady || env['BEDROCK_SONNET_TESTS'] !== '1')(
    'bedrock (Sonnet 5.5): forced tool choice — or the documented auto + must-call fallback',
    async () => {
      const llm = selectLlmProvider(envFor('bedrock'));
      const result = await generateValidated(
        llm,
        {
          tier: AiTier.enum.strong,
          system: composeSystem({
            instructions: 'Answer with the tool only.',
            vocabulary: 'Quiz.',
          }),
          messages: [{ role: 'user', content: 'Capital of Italy? Use the tool.' }],
          maxOutputTokens: 100,
        },
        { name: 'answer', description: 'City and country.', schema: Answer },
        inputJsonSchema
      );
      expect(result.ok).toBe(true);
      console.log(
        '[bedrock strong] forcedToolChoice =',
        llm.forcedToolChoice,
        'fallback =',
        result.attempts[0]?.forcedToolChoiceFallback
      );
    }
  );

  it.skipIf(!bedrockReady)(
    'bedrock (Haiku 4.5): nlSearch parses EN/AR/FR requests into valid queries',
    async () => {
      const llm = selectLlmProvider(envFor('bedrock'));
      const ports = createFakePorts(
        createFakeState({ genres: domain.genres.map((g, i) => genre(i + 1, g.name, g.slug)) })
      );
      const cases: Array<[string, Record<string, unknown>]> = [
        [
          'fantasy from the 90s sorted by rating',
          { genre: ['fantasy'], yearFrom: 1990, yearTo: 1999, sort: 'rating' },
        ],
        ['روايات خيال علمي', { genre: ['science-fiction'] }],
        ['romans policiers des années 80', { genre: ['mystery'], yearFrom: 1980, yearTo: 1989 }],
        ['tolkein', { q: 'tolkein' }],
      ];
      for (const [text, expected] of cases) {
        const { value, meta } = await nlSearch(
          { llm, ports },
          { actor: reader, requestId: null },
          { text }
        );
        console.log(
          '[nlSearch bedrock]',
          JSON.stringify(text),
          '→',
          JSON.stringify(value.query),
          'fallback =',
          meta.fallbackUsed,
          'tokensIn =',
          meta.tokensIn,
          'cachedRead =',
          meta.tokensCachedRead,
          'cachedWrite =',
          meta.tokensCachedWrite,
          'cost =',
          meta.costUsd,
          'ms =',
          meta.latencyMs
        );
        expect(meta.fallbackUsed).toBe(false);
        expect(value.query).toMatchObject(expected);
      }
    }
  );

  it.skipIf(!bedrockReady)('bedrock titan: embeddings have the declared dimensions', async () => {
    const provider = selectEmbeddingProvider({
      ...env,
      EMBEDDING_PROVIDER: 'bedrock',
      EMBEDDING_DIMENSIONS: titanDimensions,
    });
    const { vectors, tokens } = await provider.embed(['The Hobbit by J. R. R. Tolkien']);
    expect(vectors[0]).toHaveLength(provider.dimensions);
    expect(tokens).toBeGreaterThan(0);
  });

  it.skipIf(!kimiReady)('kimi: forced function tool → Zod-valid object with usage', async () => {
    const llm = selectLlmProvider(envFor('kimi'));
    const result = await prompt(llm);
    expect(result.ok).toBe(true);
    expect(result.attempts[0]?.usage.tokensIn).toBeGreaterThan(0);
    console.log(
      '[kimi] forcedToolChoice =',
      llm.forcedToolChoice,
      'attempts =',
      result.attempts.length,
      'value =',
      result.ok ? result.value : null,
      'usage =',
      result.attempts.at(-1)?.usage
    );
  });

  it.skipIf(!anthropicReady)('anthropic: forced single tool → Zod-valid object', async () => {
    const llm = selectLlmProvider(envFor('anthropic'));
    expect((await prompt(llm)).ok).toBe(true);
  });

  it('local embeddings run offline after the first model download (opt-in: LOCAL_EMBEDDING_TESTS=1)', async ctx => {
    if (env['LOCAL_EMBEDDING_TESTS'] !== '1') ctx.skip();
    const provider = selectEmbeddingProvider({ EMBEDDING_PROVIDER: 'local' });
    const { vectors } = await provider.embed(['hello']);
    expect(vectors[0]).toHaveLength(384);
  });
});
