import { ForcedToolChoiceMode, type AiProviderName } from '@library/contracts';
import { ProviderRequestError, ProviderUnavailableError, singleProviderTiers } from './types.js';
import type {
  GenerateRequest,
  GenerateResult,
  LlmProvider,
  Message,
  MessageContent,
  Tier,
} from './types.js';

export interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  };
}

interface MessagesResponse {
  content: Array<
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
  model?: string;
}

const toApiContent = (content: string | MessageContent[]) =>
  typeof content === 'string'
    ? content
    : content.map(part =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : part.type === 'tool_use'
            ? { type: 'tool_use', id: part.id, name: part.name, input: part.input }
            : {
                type: 'tool_result',
                tool_use_id: part.toolUseId,
                content: part.content,
                ...(part.isError ? { is_error: true } : {}),
              }
      );

const toApiMessages = (messages: Message[]) =>
  messages.map(message => ({ role: message.role, content: toApiContent(message.content) }));

export const mustCallInstruction = (tool: string): string =>
  `You must answer by calling the tool "${tool}" exactly once, with valid input, and produce no other content.`;

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;

const isForcedToolRejection = (error: unknown): boolean => {
  if (statusOf(error) !== 400) return false;
  const text = String((error as { message?: string }).message ?? '').toLowerCase();
  return text.includes('tool_choice') || text.includes('thinking');
};

export interface AnthropicFamilyOptions {
  name: AiProviderName;
  models: Record<Tier, string>;
  temperatures: Record<Tier, number>;
  client: () => Promise<MessagesClient>;
  forcedToolChoice?: 'forced' | 'auto-with-instruction';
}

export const createAnthropicFamilyProvider = (options: AnthropicFamilyOptions): LlmProvider => {
  let forcedToolChoice = options.forcedToolChoice ?? ForcedToolChoiceMode.enum.forced;
  let clientPromise: Promise<MessagesClient> | undefined;
  const client = () => (clientPromise ??= options.client());

  const call = async (
    request: GenerateRequest,
    mode: 'forced' | 'auto-with-instruction'
  ): Promise<GenerateResult> => {
    const forcedName = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
    const system = request.system.map(block => ({
      type: 'text',
      text: block.text,
      ...(block.cache ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
    if (forcedName && mode === ForcedToolChoiceMode.enum['auto-with-instruction'])
      system.push({ type: 'text', text: mustCallInstruction(forcedName) });
    const params: Record<string, unknown> = {
      model: options.models[request.tier],
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? options.temperatures[request.tier],
      system,
      messages: toApiMessages(request.messages),
    };
    if (request.tools && request.tools.length > 0) {
      params['tools'] = request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
      const choice = request.toolChoice ?? { type: 'auto' };
      params['tool_choice'] =
        choice.type === 'tool' && mode === ForcedToolChoiceMode.enum.forced
          ? { type: 'tool', name: choice.name }
          : choice.type === 'none'
            ? { type: 'none' }
            : { type: 'auto' };
    }
    const started = Date.now();
    const response = (await (
      await client()
    ).messages.create(
      params,
      request.signal ? { signal: request.signal } : undefined
    )) as MessagesResponse;
    const toolCalls = response.content
      .filter(
        (part): part is Extract<MessagesResponse['content'][number], { type: 'tool_use' }> =>
          part.type === 'tool_use'
      )
      .map(part => ({ id: part.id, name: part.name, input: part.input }));
    return {
      provider: options.name,
      model: options.models[request.tier],
      text: response.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join(''),
      toolCalls,
      stopReason:
        response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence'
          ? 'end_turn'
          : response.stop_reason === 'tool_use'
            ? 'tool_use'
            : response.stop_reason === 'max_tokens'
              ? 'max_tokens'
              : 'other',
      usage: {
        tokensIn:
          response.usage.input_tokens +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0),
        tokensOut: response.usage.output_tokens,
        tokensCachedRead: response.usage.cache_read_input_tokens ?? 0,
        tokensCachedWrite: response.usage.cache_creation_input_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
      forcedToolChoiceFallback:
        mode === ForcedToolChoiceMode.enum['auto-with-instruction'] && forcedName !== null,
    };
  };

  const provider: LlmProvider = {
    name: options.name,
    models: options.models,
    supportsPromptCaching: true,
    get forcedToolChoice() {
      return forcedToolChoice;
    },
    get tiers() {
      return singleProviderTiers(provider);
    },
    async generate(request) {
      try {
        return await call(request, forcedToolChoice);
      } catch (error) {
        if (
          forcedToolChoice === ForcedToolChoiceMode.enum.forced &&
          request.toolChoice?.type === 'tool' &&
          isForcedToolRejection(error)
        ) {
          forcedToolChoice = ForcedToolChoiceMode.enum['auto-with-instruction'];
          return call(request, forcedToolChoice);
        }
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
    },
  };
  return provider;
};
