import { describe, expect, it } from 'vitest';

import { composeSystem, stablePrefix } from '../prompts/ordering.js';
import { createMockEmbeddingProvider, mockEmbed } from './embeddings/mock.js';
import { parseSearchText } from './mock/parser.js';
import { createMockProvider } from './mock/index.js';
import { AiConfigError, selectEmbeddingProvider, selectLlmProvider } from './select.js';
import { costUsd } from '../cost/usage.js';
import { priceFor } from '../cost/pricing.js';
import { tierFor } from './routing.js';
import { domain } from '@library/domain-config';
import { AiFeature, AiTier } from '@library/contracts';

describe('select', () => {
  it('defaults to mock and fails fast when a real provider lacks its env', () => {
    expect(selectLlmProvider({}).name).toBe('mock');
    expect(() => selectLlmProvider({ AI_PROVIDER: 'bedrock' })).toThrow(AiConfigError);
    expect(() =>
      selectLlmProvider({ AI_PROVIDER: 'bedrock', AI_MODEL_SMALL: 'a', AI_MODEL_STRONG: 'b' })
    ).toThrow(/AWS_REGION/);
    expect(() =>
      selectLlmProvider({ AI_PROVIDER: 'kimi', AI_MODEL_SMALL: 'a', AI_MODEL_STRONG: 'b' })
    ).toThrow(/OPENAI_COMPAT_API_KEY/);
    expect(() =>
      selectLlmProvider({ AI_PROVIDER: 'anthropic', AI_MODEL_SMALL: 'a', AI_MODEL_STRONG: 'b' })
    ).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => selectLlmProvider({ AI_PROVIDER: 'nope' })).toThrow(/AI_PROVIDER/);
    expect(() =>
      selectLlmProvider({
        AI_PROVIDER: 'kimi',
        AI_MODEL_SMALL: 'a',
        AI_MODEL_STRONG: 'b',
        OPENAI_COMPAT_API_KEY: 'k',
        AI_TEMPERATURE_SMALL: '9',
      })
    ).toThrow(/AI_TEMPERATURE/);
  });

  it('builds real providers lazily (no SDK call at construction) with env-only model ids', () => {
    const bedrock = selectLlmProvider({
      AI_PROVIDER: 'bedrock',
      AI_MODEL_SMALL: 'eu.small',
      AI_MODEL_STRONG: 'eu.strong',
      AWS_REGION: 'eu-central-1',
    });
    expect(bedrock).toMatchObject({
      name: 'bedrock',
      models: { small: 'eu.small', strong: 'eu.strong' },
      supportsPromptCaching: true,
      forcedToolChoice: 'forced',
    });
    const kimi = selectLlmProvider({
      AI_PROVIDER: 'kimi',
      AI_MODEL_SMALL: 'kimi-k2.6',
      AI_MODEL_STRONG: 'kimi-k3',
      OPENAI_COMPAT_API_KEY: 'k',
    });
    expect(kimi).toMatchObject({ name: 'kimi', supportsPromptCaching: true });
  });

  it('selects embedding providers and validates Titan dimensions', () => {
    expect(selectEmbeddingProvider({})).toMatchObject({ name: 'mock', dimensions: 384 });
    expect(
      selectEmbeddingProvider({ EMBEDDING_PROVIDER: 'mock', EMBEDDING_DIMENSIONS: '64' }).dimensions
    ).toBe(64);
    expect(() =>
      selectEmbeddingProvider({
        EMBEDDING_PROVIDER: 'bedrock',
        AWS_REGION: 'eu-central-1',
        EMBEDDING_DIMENSIONS: '384',
      })
    ).toThrow(/256, 512 or 1024/);
    expect(
      selectEmbeddingProvider({
        EMBEDDING_PROVIDER: 'bedrock',
        AWS_REGION: 'eu-central-1',
        EMBEDDING_DIMENSIONS: '512',
      })
    ).toMatchObject({ name: 'bedrock', model: 'amazon.titan-embed-text-v2:0', dimensions: 512 });
    expect(selectEmbeddingProvider({ EMBEDDING_PROVIDER: 'local' })).toMatchObject({
      name: 'local',
      dimensions: 384,
    });
  });
});

describe('mock embeddings', () => {
  it('are deterministic, unit-length and closer for overlapping text', async () => {
    const provider = createMockEmbeddingProvider(128);
    const { vectors, tokens } = await provider.embed([
      'The Hobbit by Tolkien',
      'The Hobbit by Tolkien',
    ]);
    const [a, b] = vectors;
    expect(tokens).toBeGreaterThan(0);
    expect(a).toEqual(b);
    const norm = Math.sqrt(a!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 6);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    const near = mockEmbed('The Hobbit, Tolkien, dragons', 128);
    const far = mockEmbed('Quantum chromodynamics lecture notes', 128);
    expect(dot(a!, near)).toBeGreaterThan(dot(a!, far));
  });
});

describe('mock parser', () => {
  const genres = domain.genres;

  it('parses "fantasy from the 90s sorted by rating"', () => {
    expect(parseSearchText('fantasy from the 90s sorted by rating', genres)).toMatchObject({
      q: null,
      genres: ['fantasy'],
      yearFrom: 1990,
      yearTo: 1999,
      sort: 'rating',
    });
  });

  it('maps Arabic and French genre words to slugs and keeps unknown words in q', () => {
    expect(parseSearchText('روايات خيال علمي', genres).genres).toEqual(['science-fiction']);
    expect(parseSearchText('romans policiers des années 80', genres)).toMatchObject({
      genres: expect.arrayContaining(['mystery']) as unknown,
      yearFrom: 1980,
    });
    const parsed = parseSearchText('tolkein hobbits', genres);
    expect(parsed.genres).toEqual([]);
    expect(parsed.q).toBe('tolkein hobbits');
  });

  it('applies word boundaries to Arabic too (JavaScript \\b is ASCII-only)', () => {
    expect(parseSearchText('روايات تاريخية قبل 1950', genres)).toMatchObject({
      yearTo: 1949,
      genres: ['historical-fiction'],
    });
    expect(parseSearchText('شعر الأعلى تقييما', genres)).toMatchObject({
      sort: 'rating',
      genres: ['poetry'],
    });
  });

  it('accepts the Arabic definite article and feminine ending on aliases', () => {
    expect(parseSearchText('الخيال العلمي', genres).genres).toEqual(['science-fiction']);
    expect(parseSearchText('روايات بوليسية', genres).genres).toEqual(['mystery']);
  });

  it('reads decades of any century', () => {
    expect(parseSearchText('romance from the 1840s', genres)).toMatchObject({
      yearFrom: 1840,
      yearTo: 1849,
    });
  });

  it('understands before/after/between', () => {
    expect(parseSearchText('books before 1950', genres)).toMatchObject({ yearTo: 1949 });
    expect(parseSearchText('after 2000', genres)).toMatchObject({ yearFrom: 2001 });
    expect(parseSearchText('between 1960 and 1970', genres)).toMatchObject({
      yearFrom: 1960,
      yearTo: 1970,
    });
  });
});

describe('prompt ordering and cost', () => {
  it('produces a byte-identical stable prefix across two calls and puts data after the breakpoint', () => {
    const first = composeSystem({
      instructions: 'Parse.',
      vocabulary: 'Books.',
      examples: 'x',
      perUserContext: 'user 1',
      dataBlocks: ['<data/>'],
    });
    const second = composeSystem({
      instructions: 'Parse.',
      vocabulary: 'Books.',
      examples: 'x',
      perUserContext: 'user 2',
    });
    expect(stablePrefix(first)).toBe(stablePrefix(second));
    expect(first[0]?.cache).toBe(true);
    expect(first[1]?.text).toContain('user 1');
    expect(first[1]?.cache).toBeUndefined();
  });

  it('prices known models, reports unknown ones as unknown, and routes features to tiers', () => {
    expect(priceFor('eu.anthropic.claude-haiku-4-5-20251001-v1:0').known).toBe(true);
    expect(priceFor('made-up').known).toBe(false);
    expect(
      costUsd('claude-haiku-4-5', {
        tokensIn: 1_000_000,
        tokensOut: 0,
        tokensCachedRead: 0,
        tokensCachedWrite: 0,
      })
    ).toBe(1);
    expect(
      costUsd('claude-haiku-4-5', {
        tokensIn: 1_000_000,
        tokensOut: 0,
        tokensCachedRead: 1_000_000,
        tokensCachedWrite: 0,
      })
    ).toBeCloseTo(0.1, 8);
    expect(
      costUsd('mock-small', {
        tokensIn: 5,
        tokensOut: 5,
        tokensCachedRead: 0,
        tokensCachedWrite: 0,
      })
    ).toBe(0);
    expect(tierFor(AiFeature.enum.NL_SEARCH)).toBe('small');
    expect(tierFor(AiFeature.enum.AGENT_CHAT)).toBe('strong');
  });

  it('mock provider answers forced tools and free text with usage and latency', async () => {
    const llm = createMockProvider({ tools: { t: () => ({ ok: true }) }, reply: () => 'hello' });
    const forced = await llm.generate({
      tier: AiTier.enum.small,
      system: [{ text: 's' }],
      messages: [{ role: 'user', content: 'u' }],
      maxOutputTokens: 10,
      tools: [{ name: 't', description: '', inputSchema: {} }],
      toolChoice: { type: 'tool', name: 't' },
    });
    expect(forced.toolCalls[0]).toMatchObject({ name: 't', input: { ok: true } });
    expect(forced.stopReason).toBe('tool_use');
    const free = await llm.generate({
      tier: AiTier.enum.strong,
      system: [],
      messages: [{ role: 'user', content: 'u' }],
      maxOutputTokens: 10,
    });
    expect(free).toMatchObject({ text: 'hello', model: 'mock-strong', stopReason: 'end_turn' });
    expect(free.usage.tokensIn).toBeGreaterThan(0);
  });
});
