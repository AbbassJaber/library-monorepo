import { describe, expect, it } from 'vitest';
import { createAnthropicFamilyProvider, mustCallInstruction } from './anthropicMessages.js';
import type { MessagesClient } from './anthropicMessages.js';
import { createOpenAiCompatibleProvider } from './openaiCompatible.js';
import { costUsd } from '../cost/usage.js';
import type { ChatClient } from './openaiCompatible.js';
import { ProviderRequestError, ProviderUnavailableError } from './types.js';
import type { GenerateRequest } from './types.js';
import { AiProviderName, AiTier } from '@library/contracts';

const request = (toolChoice?: GenerateRequest['toolChoice']): GenerateRequest => ({
  tier: AiTier.enum.small,
  system: [{ text: 'stable', cache: true }, { text: 'variable' }],
  messages: [
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'parse', input: { a: 1 } }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', toolUseId: 't1', content: 'bad', isError: true }],
    },
  ],
  tools: [{ name: 'parse', description: 'd', inputSchema: { type: 'object' } }],
  ...(toolChoice ? { toolChoice } : {}),
  maxOutputTokens: 100,
});

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

describe('Anthropic-family provider', () => {
  const anthropicResponse = (input: unknown) => ({
    content: [
      { type: 'text', text: 'thinking…' },
      { type: 'tool_use', id: 'x', name: 'parse', input },
    ],
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 120,
      output_tokens: 9,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 20,
    },
    model: 'eu.small',
  });

  it('sends cache_control on the stable block, forces the tool, and maps usage incl. cached tokens', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: MessagesClient = {
      messages: {
        create: async params => {
          calls.push(params);
          return anthropicResponse({ q: 'dune' });
        },
      },
    };
    const llm = createAnthropicFamilyProvider({
      name: AiProviderName.enum.bedrock,
      models: { small: 'eu.small', strong: 'eu.strong' },
      temperatures: { small: 0, strong: 0.3 },
      client: async () => client,
    });
    const result = await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(result).toMatchObject({
      model: 'eu.small',
      stopReason: 'tool_use',
      text: 'thinking…',
      forcedToolChoiceFallback: false,
    });
    expect(result.toolCalls).toEqual([{ id: 'x', name: 'parse', input: { q: 'dune' } }]);
    expect(result.usage).toEqual({
      tokensIn: 240,
      tokensOut: 9,
      tokensCachedRead: 100,
      tokensCachedWrite: 20,
    });
    const params = calls[0]!;
    expect(params['tool_choice']).toEqual({ type: 'tool', name: 'parse' });
    expect((params['system'] as Array<Record<string, unknown>>)[0]).toMatchObject({
      cache_control: { type: 'ephemeral' },
    });
    expect((params['system'] as Array<Record<string, unknown>>)[1]).not.toHaveProperty(
      'cache_control'
    );
    expect((params['messages'] as Array<Record<string, unknown>>)[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: 'bad', is_error: true }],
    });
    expect(llm.forcedToolChoice).toBe('forced');
  });

  it('reports the inference-profile id it called (what is billed), not the base id Bedrock echoes', async () => {
    const profile = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
    const client: MessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1_000_000, output_tokens: 0 },
          model: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        }),
      },
    };
    const llm = createAnthropicFamilyProvider({
      name: AiProviderName.enum.bedrock,
      models: { small: profile, strong: profile },
      temperatures: { small: 0, strong: 0 },
      client: async () => client,
    });
    const result = await llm.generate({
      tier: AiTier.enum.small,
      system: [],
      messages: [{ role: 'user', content: 'x' }],
      maxOutputTokens: 5,
    });
    expect(result.model).toBe(profile);
    expect(costUsd(result.model, result.usage)).toBeCloseTo(1.1, 8);
  });

  it('falls back to auto + "must call" once a model rejects forced tool choice with a 400', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: MessagesClient = {
      messages: {
        create: async params => {
          calls.push(params);
          const choice = params['tool_choice'] as { type: string };
          if (choice.type === 'tool')
            throw apiError(400, 'tool_choice: forced tool use is not supported with thinking');
          return anthropicResponse({ q: 'x' });
        },
      },
    };
    const llm = createAnthropicFamilyProvider({
      name: AiProviderName.enum.anthropic,
      models: { small: 's', strong: 'st' },
      temperatures: { small: 0, strong: 0 },
      client: async () => client,
    });
    const result = await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(result.forcedToolChoiceFallback).toBe(true);
    expect(llm.forcedToolChoice).toBe('auto-with-instruction');
    expect(calls).toHaveLength(2);
    expect(calls[1]!['tool_choice']).toEqual({ type: 'auto' });
    expect((calls[1]!['system'] as Array<{ text: string }>).at(-1)?.text).toBe(
      mustCallInstruction('parse')
    );
    await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(calls).toHaveLength(3);
    expect(calls[2]!['tool_choice']).toEqual({ type: 'auto' });
  });

  it('maps other 4xx to ProviderRequestError and 5xx/network to ProviderUnavailableError', async () => {
    const failing = (error: Error) =>
      createAnthropicFamilyProvider({
        name: AiProviderName.enum.anthropic,
        models: { small: 's', strong: 'st' },
        temperatures: { small: 0, strong: 0 },
        client: async () => ({
          messages: {
            create: async () => {
              throw error;
            },
          },
        }),
      });
    await expect(failing(apiError(401, 'bad key')).generate(request())).rejects.toBeInstanceOf(
      ProviderRequestError
    );
    await expect(failing(apiError(529, 'overloaded')).generate(request())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
    await expect(failing(new Error('ECONNRESET')).generate(request())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
    await expect(failing(apiError(429, 'slow down')).generate(request())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
  });

  it('maps end_turn and max_tokens stop reasons without tools', async () => {
    const make = (stop: string) =>
      createAnthropicFamilyProvider({
        name: AiProviderName.enum.anthropic,
        models: { small: 's', strong: 'st' },
        temperatures: { small: 0, strong: 0 },
        client: async () => ({
          messages: {
            create: async () => ({
              content: [{ type: 'text', text: 'hi' }],
              stop_reason: stop,
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
          },
        }),
      });
    expect(
      (
        await make('end_turn').generate({
          tier: AiTier.enum.strong,
          system: [],
          messages: [{ role: 'user', content: 'x' }],
          maxOutputTokens: 5,
        })
      ).stopReason
    ).toBe('end_turn');
    expect(
      (
        await make('max_tokens').generate({
          tier: AiTier.enum.strong,
          system: [],
          messages: [{ role: 'user', content: 'x' }],
          maxOutputTokens: 5,
        })
      ).stopReason
    ).toBe('max_tokens');
    expect(
      (
        await make('refusal').generate({
          tier: AiTier.enum.strong,
          system: [],
          messages: [{ role: 'user', content: 'x' }],
          maxOutputTokens: 5,
        })
      ).stopReason
    ).toBe('other');
  });
});

describe('OpenAI-compatible provider', () => {
  const completion = (args: string, finish = 'tool_calls', cached?: number) => ({
    model: 'kimi-k2.6',
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: 'c1', function: { name: 'parse', arguments: args } }],
        },
        finish_reason: finish,
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 7,
      prompt_tokens_details: cached === undefined ? null : { cached_tokens: cached },
    },
  });

  it('flattens system blocks, forces a function tool and parses JSON arguments', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: ChatClient = {
      chat: {
        completions: {
          create: async params => {
            calls.push(params);
            return completion('{"q":"dune"}', 'tool_calls', 30);
          },
        },
      },
    };
    const llm = createOpenAiCompatibleProvider({
      name: 'kimi',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      models: { small: 'kimi-k2.6', strong: 'kimi-k3' },
      temperatures: { small: 0, strong: 0.3 },
      client: async () => client,
    });
    const result = await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'parse', input: { q: 'dune' } }]);
    expect(result.usage).toEqual({
      tokensIn: 50,
      tokensOut: 7,
      tokensCachedRead: 30,
      tokensCachedWrite: 0,
    });
    expect(result.stopReason).toBe('tool_use');
    const params = calls[0]!;
    expect(params['tool_choice']).toEqual({ type: 'function', function: { name: 'parse' } });
    const messages = params['messages'] as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: 'system', content: 'stable\n\nvariable' });
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 't1', type: 'function' }],
    });
    expect(messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'bad' });
    expect(llm.supportsPromptCaching).toBe(false);
  });

  it('adopts the only temperature a model allows after its 400, then keeps using it', async () => {
    const temperatures: unknown[] = [];
    const client: ChatClient = {
      chat: {
        completions: {
          create: async params => {
            temperatures.push(params['temperature']);
            if (params['temperature'] !== 1)
              throw apiError(400, 'invalid temperature: only 1 is allowed for this model');
            return completion('{"q":"x"}');
          },
        },
      },
    };
    const llm = createOpenAiCompatibleProvider({
      name: 'kimi',
      baseUrl: 'u',
      apiKey: 'k',
      models: { small: 'kimi-k2.6', strong: 'kimi-k3' },
      temperatures: { small: 0, strong: 0.3 },
      client: async () => client,
    });
    await llm.generate(request({ type: 'tool', name: 'parse' }));
    await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(temperatures).toEqual([0, 1, 1]);
  });

  it('falls back to auto + "must call" when a thinking model rejects a forced tool (real Kimi 400)', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: ChatClient = {
      chat: {
        completions: {
          create: async params => {
            calls.push(params);
            if (typeof params['tool_choice'] === 'object')
              throw apiError(400, "tool_choice 'specified' is incompatible with thinking enabled");
            return completion('{"q":"x"}');
          },
        },
      },
    };
    const llm = createOpenAiCompatibleProvider({
      name: 'kimi',
      baseUrl: 'u',
      apiKey: 'k',
      models: { small: 'kimi-k2.6', strong: 'kimi-k3' },
      temperatures: { small: 1, strong: 1 },
      client: async () => client,
    });
    expect(llm.forcedToolChoice).toBe('forced');
    const result = await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(result.forcedToolChoiceFallback).toBe(true);
    expect(result.toolCalls[0]?.input).toEqual({ q: 'x' });
    expect(llm.forcedToolChoice).toBe('auto-with-instruction');
    expect(calls[1]!['tool_choice']).toBe('auto');
    const system = (calls[1]!['messages'] as Array<{ role: string; content: string }>)[0]!.content;
    expect(system).toContain(mustCallInstruction('parse'));
    await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(calls).toHaveLength(3);
    expect(calls[2]!['tool_choice']).toBe('auto');
  });

  it('reports 0 cached tokens when the endpoint does not say, keeps raw arguments when not JSON, maps errors', async () => {
    const client: ChatClient = {
      chat: { completions: { create: async () => completion('not json', 'length') } },
    };
    const llm = createOpenAiCompatibleProvider({
      name: 'openai-compatible',
      baseUrl: 'u',
      apiKey: 'k',
      models: { small: 'a', strong: 'b' },
      temperatures: { small: 0, strong: 0 },
      client: async () => client,
    });
    const result = await llm.generate(request({ type: 'tool', name: 'parse' }));
    expect(result.usage.tokensCachedRead).toBe(0);
    expect(result.toolCalls[0]?.input).toBe('not json');
    expect(result.stopReason).toBe('max_tokens');
    const failing = (error: Error) =>
      createOpenAiCompatibleProvider({
        name: 'kimi',
        baseUrl: 'u',
        apiKey: 'k',
        models: { small: 'a', strong: 'b' },
        temperatures: { small: 0, strong: 0 },
        client: async () => ({
          chat: {
            completions: {
              create: async () => {
                throw error;
              },
            },
          },
        }),
      });
    await expect(failing(apiError(400, 'bad')).generate(request())).rejects.toBeInstanceOf(
      ProviderRequestError
    );
    await expect(failing(apiError(503, 'down')).generate(request())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
  });
});
