import { ForcedToolChoiceMode, type AiProviderName } from '@library/contracts';
import { ProviderRequestError, ProviderUnavailableError, singleProviderTiers } from './types.js';
import type { GenerateRequest, GenerateResult, LlmProvider, Tier } from './types.js';
import { mustCallInstruction } from './anthropicMessages.js';

export interface OpenAiCompatibleOptions {
  name: Extract<AiProviderName, 'kimi' | 'openai-compatible'>;
  baseUrl: string;
  apiKey: string;
  models: Record<Tier, string>;
  temperatures: Record<Tier, number>;
  timeoutMs?: number;
  reportsCachedTokens?: boolean;
  forcedToolChoice?: 'forced' | 'auto-with-instruction';
  client?: () => Promise<ChatClient>;
}

export interface ChatClient {
  chat: {
    completions: {
      create: (
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal }
      ) => Promise<unknown>;
    };
  };
}

export const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';

interface ChatCompletion {
  model?: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  };
}

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;

export const createOpenAiCompatibleProvider = (options: OpenAiCompatibleOptions): LlmProvider => {
  let clientPromise: Promise<ChatClient> | undefined;
  const pinnedTemperature = new Map<string, number>();
  let forcedToolChoice: 'forced' | 'auto-with-instruction' =
    options.forcedToolChoice ?? ForcedToolChoiceMode.enum.forced;
  const client = () =>
    (clientPromise ??= (
      options.client ??
      (async () => {
        const { default: OpenAI } = await import('openai');
        return new OpenAI({
          apiKey: options.apiKey,
          baseURL: options.baseUrl,
          timeout: options.timeoutMs ?? 45_000,
          maxRetries: 1,
        }) as unknown as ChatClient;
      })
    )());

  const provider: LlmProvider = {
    name: options.name,
    models: options.models,
    supportsPromptCaching: options.reportsCachedTokens ?? false,
    get forcedToolChoice() {
      return forcedToolChoice;
    },
    get tiers() {
      return singleProviderTiers(provider);
    },
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const forcedName = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
      const systemText = request.system.map(block => block.text).join('\n\n');
      const messages: Array<Record<string, unknown>> = [{ role: 'system', content: systemText }];
      for (const message of request.messages) {
        if (typeof message.content === 'string') {
          messages.push({ role: message.role, content: message.content });
          continue;
        }
        const toolUses = message.content.filter(part => part.type === 'tool_use');
        const toolResults = message.content.filter(part => part.type === 'tool_result');
        const text = message.content
          .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map(part => part.text)
          .join('');
        if (toolUses.length > 0)
          messages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolUses.map(part =>
              part.type === 'tool_use'
                ? {
                    id: part.id,
                    type: 'function',
                    function: { name: part.name, arguments: JSON.stringify(part.input) },
                  }
                : null
            ),
          });
        for (const part of toolResults)
          if (part.type === 'tool_result')
            messages.push({ role: 'tool', tool_call_id: part.toolUseId, content: part.content });
        if (toolUses.length === 0 && toolResults.length === 0)
          messages.push({ role: message.role, content: text });
      }
      const params: Record<string, unknown> = {
        model: options.models[request.tier],
        messages,
        max_tokens: request.maxOutputTokens,
        temperature:
          pinnedTemperature.get(options.models[request.tier]) ??
          request.temperature ??
          options.temperatures[request.tier],
      };
      if (request.tools && request.tools.length > 0) {
        params['tools'] = request.tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));
        params['tool_choice'] = forcedName
          ? { type: 'function', function: { name: forcedName } }
          : request.toolChoice?.type === 'none'
            ? 'none'
            : 'auto';
      }
      const useInstructionFallback = () => {
        if (!forcedName) return;
        params['tool_choice'] = 'auto';
        messages[0] = {
          role: 'system',
          content: `${systemText}\n\n${mustCallInstruction(forcedName)}`,
        };
      };
      if (forcedToolChoice === ForcedToolChoiceMode.enum['auto-with-instruction'])
        useInstructionFallback();
      const started = Date.now();
      const send = async () =>
        (await (
          await client()
        ).chat.completions.create(
          params,
          request.signal ? { signal: request.signal } : undefined
        )) as ChatCompletion;
      let response: ChatCompletion;
      try {
        let attempt = 0;
        for (;;) {
          try {
            response = await send();
            break;
          } catch (error) {
            const message = String((error as Error).message);
            if (statusOf(error) !== 400 || attempt >= 2) throw error;
            attempt += 1;
            const only = /only (\d+(?:\.\d+)?) is allowed/i.exec(message);
            if (only && /temperature/i.test(message)) {
              pinnedTemperature.set(options.models[request.tier], Number(only[1]));
              params['temperature'] = Number(only[1]);
              continue;
            }
            if (
              forcedName &&
              forcedToolChoice === ForcedToolChoiceMode.enum.forced &&
              /tool_choice/i.test(message)
            ) {
              forcedToolChoice = ForcedToolChoiceMode.enum['auto-with-instruction'];
              useInstructionFallback();
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const status = statusOf(error);
        if (
          status !== undefined &&
          status >= 400 &&
          status < 500 &&
          status !== 408 &&
          status !== 429
        )
          throw new ProviderRequestError(
            `${options.name}: ${String((error as Error).message)}`,
            status,
            error
          );
        throw new ProviderUnavailableError(
          `${options.name}: ${String((error as Error).message)}`,
          error
        );
      }
      const choice = response.choices[0];
      const toolCalls = (choice?.message.tool_calls ?? []).map(call => {
        let input: unknown;
        try {
          input = JSON.parse(call.function.arguments);
        } catch {
          input = call.function.arguments;
        }
        return { id: call.id, name: call.function.name, input };
      });
      return {
        provider: options.name,
        model: response.model ?? options.models[request.tier],
        text: choice?.message.content ?? '',
        toolCalls,
        stopReason:
          choice?.finish_reason === 'tool_calls'
            ? 'tool_use'
            : choice?.finish_reason === 'length'
              ? 'max_tokens'
              : choice?.finish_reason === 'stop'
                ? 'end_turn'
                : 'other',
        usage: {
          tokensIn: response.usage?.prompt_tokens ?? 0,
          tokensOut: response.usage?.completion_tokens ?? 0,
          tokensCachedRead: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          tokensCachedWrite: 0,
        },
        latencyMs: Date.now() - started,
        forcedToolChoiceFallback:
          forcedName !== null &&
          forcedToolChoice === ForcedToolChoiceMode.enum['auto-with-instruction'],
      };
    },
  };
  return provider;
};
