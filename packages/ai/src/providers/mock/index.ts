import { singleProviderTiers } from '../types.js';
import type { GenerateRequest, GenerateResult, LlmProvider, Message } from '../types.js';
import { AiProviderName, ForcedToolChoiceMode } from '@library/contracts';

export const MOCK_MODELS = { small: 'mock-small', strong: 'mock-strong' } as const;

export type MockToolHandler = (request: GenerateRequest) => unknown;

export interface MockProviderOptions {
  tools?: Record<string, MockToolHandler>;
  agent?: (request: GenerateRequest) => {
    text?: string;
    toolCalls?: Array<{ name: string; input: unknown }>;
  };
  reply?: (request: GenerateRequest) => string;
  latencyMs?: number;
}

export const lastUserText = (messages: Message[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string') return message.content;
    const text = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('\n');
    if (text) return text;
  }
  return '';
};

const roughTokens = (request: GenerateRequest): number =>
  Math.ceil(
    (request.system.reduce((sum, block) => sum + block.text.length, 0) +
      request.messages.reduce(
        (sum, message) =>
          sum +
          (typeof message.content === 'string'
            ? message.content.length
            : JSON.stringify(message.content).length),
        0
      )) /
      4
  );

export const createMockProvider = (options: MockProviderOptions = {}): LlmProvider => {
  let counter = 0;
  const provider: LlmProvider = {
    name: AiProviderName.enum.mock,
    models: { ...MOCK_MODELS },
    supportsPromptCaching: false,
    forcedToolChoice: ForcedToolChoiceMode.enum.forced,
    get tiers() {
      return singleProviderTiers(provider);
    },
    async generate(request): Promise<GenerateResult> {
      const started = Date.now();
      if (options.latencyMs) await new Promise(resolve => setTimeout(resolve, options.latencyMs));
      const tokensIn = roughTokens(request);
      const forced = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
      let text = '';
      const toolCalls: GenerateResult['toolCalls'] = [];
      if (forced) {
        const handler = options.tools?.[forced];
        toolCalls.push({
          id: `mock-${++counter}`,
          name: forced,
          input: handler ? handler(request) : {},
        });
      } else if (options.agent) {
        const step = options.agent(request);
        text = step.text ?? '';
        for (const call of step.toolCalls ?? [])
          toolCalls.push({ id: `mock-${++counter}`, name: call.name, input: call.input });
      } else {
        text = options.reply
          ? options.reply(request)
          : `(mock) ${lastUserText(request.messages).slice(0, 200)}`;
      }
      return {
        provider: AiProviderName.enum.mock,
        model: MOCK_MODELS[request.tier],
        text,
        toolCalls,
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
        usage: {
          tokensIn,
          tokensOut: Math.ceil((text.length + JSON.stringify(toolCalls).length) / 4),
          tokensCachedRead: 0,
          tokensCachedWrite: 0,
        },
        latencyMs: Date.now() - started,
        forcedToolChoiceFallback: false,
      };
    },
  };
  return provider;
};
