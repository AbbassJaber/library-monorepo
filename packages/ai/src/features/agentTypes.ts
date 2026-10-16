import type {
  BookSummary,
  ChatContext,
  ChatLocale,
  ChatMessage,
  SearchBooksInput,
} from '@library/contracts';
import type { Actor, Ports } from '../ports/index.js';
import type { LlmProvider, Tier } from '../providers/types.js';
import type { ToolRegistry } from '../tools/registry.js';

export interface AgentStep {
  text?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
}

export interface AgentDeps {
  llm: LlmProvider;
  ports: Ports;
  registry: ToolRegistry;
  confirmSecret: string;
  tier?: Tier;
  search?: (actor: Actor, input: SearchBooksInput) => Promise<BookSummary[]>;
}

export interface AgentContext {
  actor: Actor;
  requestId: string | null;
}

export interface AgentInput {
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>;
  locale: ChatLocale;
  context?: ChatContext | undefined;
}
