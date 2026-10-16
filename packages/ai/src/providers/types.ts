import type {
  AiProviderName,
  AiTier,
  EmbeddingProviderName,
  TraceProviderName,
} from '@library/contracts';

export type Tier = AiTier;

export interface SystemBlock {
  text: string;
  cache?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface Message {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

export interface GenerateRequest {
  tier: Tier;
  system: SystemBlock[];
  messages: Message[];
  tools?: ToolSpec[];
  toolChoice?: { type: 'tool'; name: string } | { type: 'auto' } | { type: 'none' };
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Usage {
  tokensIn: number;
  tokensOut: number;
  tokensCachedRead: number;
  tokensCachedWrite: number;
}

export interface GenerateResult {
  provider: TraceProviderName;
  model: string;
  text: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: Usage;
  latencyMs: number;
  forcedToolChoiceFallback: boolean;
}

export interface TierInfo {
  provider: AiProviderName;
  model: string;
  supportsPromptCaching: boolean;
  forcedToolChoice: 'forced' | 'auto-with-instruction';
}

export interface LlmProvider {
  name: AiProviderName;
  models: Record<Tier, string>;
  supportsPromptCaching: boolean;
  forcedToolChoice: 'forced' | 'auto-with-instruction';
  readonly tiers: Record<Tier, TierInfo>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export const singleProviderTiers = (provider: {
  name: AiProviderName;
  models: Record<Tier, string>;
  supportsPromptCaching: boolean;
  forcedToolChoice: 'forced' | 'auto-with-instruction';
}): Record<Tier, TierInfo> => ({
  small: {
    provider: provider.name,
    model: provider.models.small,
    supportsPromptCaching: provider.supportsPromptCaching,
    forcedToolChoice: provider.forcedToolChoice,
  },
  strong: {
    provider: provider.name,
    model: provider.models.strong,
    supportsPromptCaching: provider.supportsPromptCaching,
    forcedToolChoice: provider.forcedToolChoice,
  },
});

export interface EmbeddingProvider {
  name: EmbeddingProviderName;
  model: string;
  dimensions: number;
  embed(texts: string[], signal?: AbortSignal, options?: EmbedOptions): Promise<EmbedResult>;
}

export interface EmbedOptions {
  purpose?: 'document' | 'query';
}

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
  }
}

export class ProviderRequestError extends Error {
  override readonly name = 'ProviderRequestError';
  constructor(
    message: string,
    readonly status: number,
    override readonly cause?: unknown
  ) {
    super(message);
  }
}
