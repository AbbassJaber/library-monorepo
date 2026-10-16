import {
  selectVoiceProvider,
  agentMockPolicy,
  catalogTools,
  hybridSearch,
  createToolRegistry,
  minSimilarityFor,
  mockToolHandlers,
  selectEmbeddingProvider,
  selectLlmProvider,
  DEFAULT_VOICE_ID,
} from '@library/ai';
import type {
  VoiceProvider,
  VoiceSessionHandle,
  AgentDeps,
  AiEnv,
  EmbeddingProvider,
  LlmProvider,
  Ports,
  ToolRegistry,
} from '@library/ai';
import { AiTier, EmbeddingExpansion, VoiceMode, type AiStatus } from '@library/contracts';
import type { ExternalRecord, LookupSource } from '@library/domain-config';
import type { Logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { BooksService } from '../../modules/books/books.service.js';
import type { FavoritesService } from '../../modules/favorites/favorites.service.js';
import type { GenresService } from '../../modules/genres/genres.service.js';
import type { ShelfService } from '../../modules/shelf/shelf.service.js';
import { createCatalogAdapter } from './catalog.adapter.js';
import { createExpansionAdapter } from './expansion.adapter.js';
import { createLookupAdapter } from './lookup.adapter.js';
import { createPendingActionAdapter } from './pendingAction.adapter.js';
import { createTraceAdapter } from './trace.adapter.js';
import { createVectorStoreAdapter } from './vectorStore.adapter.js';

export interface AiRuntimeDeps {
  prisma: PrismaClient;
  logger: Logger;
  env: AiEnv & {
    AI_CONFIRM_SECRET: string;
    LOOKUP_PROVIDER: LookupSource;
    OPEN_LIBRARY_BASE_URL: string;
    LOOKUP_TIMEOUT_MS: number;
    NL_SEARCH_CACHE_PADDING?: boolean;
    HYBRID_SEARCH_RERANK?: boolean;
    HYBRID_MIN_SIMILARITY?: number | undefined;
    EMBEDDING_EXPANSION?: 'off' | 'fr-ar';
    AI_CHAT_TIER?: 'small' | 'strong';
    VOICE_PROVIDER?: 'off' | 'mock' | 'nova-sonic';
    VOICE_MODEL?: string | undefined;
    VOICE_AWS_REGION?: string;
    VOICE_ID?: string;
    VOICE_MAX_SECONDS?: number;
    VOICE_IDLE_SECONDS?: number;
    VOICE_MAX_SESSIONS?: number;
    VOICE_SESSIONS_PER_HOUR?: number;
    VOICE_DAILY_SECONDS?: number;
  };
  services: {
    books: BooksService;
    genres: GenresService;
    shelf: ShelfService;
    favorites: FavoritesService;
  };
  lookupFixtures?: ExternalRecord[];
}

export interface AiRuntime {
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
  ports: Ports;
  registry: ToolRegistry;
  confirmSecret: string;
  options: {
    nlSearchCachePadding: boolean;
    hybridRerank: boolean;
    minSimilarity: number;
    expansion: boolean;
  };
  agentDeps(): AgentDeps;
  voice: {
    provider: VoiceProvider;
    voiceId: string;
    limits: {
      maxSeconds: number;
      idleSeconds: number;
      maxSessions: number;
      sessionsPerHour: number;
      dailySeconds: number;
    };
  } | null;
  voiceSessions: Map<number, VoiceSessionHandle>;
  status(): AiStatus;
}

export const createAiRuntime = (deps: AiRuntimeDeps): AiRuntime => {
  const llm = selectLlmProvider(deps.env, { tools: mockToolHandlers, agent: agentMockPolicy });
  const embeddings = selectEmbeddingProvider(deps.env);
  const ports: Ports = {
    catalog: createCatalogAdapter({ prisma: deps.prisma, ...deps.services }),
    vectorStore: createVectorStoreAdapter(deps.prisma),
    trace: createTraceAdapter(deps.prisma),
    expansions: createExpansionAdapter(deps.prisma),
    pendingActions: createPendingActionAdapter(deps.prisma),
    lookup: createLookupAdapter({
      provider: deps.env.LOOKUP_PROVIDER,
      baseUrl: deps.env.OPEN_LIBRARY_BASE_URL || undefined,
      timeoutMs: deps.env.LOOKUP_TIMEOUT_MS,
      ...(deps.lookupFixtures ? { fixtures: deps.lookupFixtures } : {}),
    }),
  };
  deps.logger.info('ai runtime', {
    provider: llm.name,
    models: llm.models,
    embeddings: {
      provider: embeddings.name,
      model: embeddings.model,
      dimensions: embeddings.dimensions,
    },
  });
  const minSimilarity = minSimilarityFor(embeddings.model, deps.env.HYBRID_MIN_SIMILARITY);
  const voiceProvider = selectVoiceProvider(deps.env);
  const runtime: AiRuntime = {
    llm,
    embeddings,
    ports,
    registry: createToolRegistry(catalogTools),
    confirmSecret: deps.env.AI_CONFIRM_SECRET,
    voice: voiceProvider
      ? {
          provider: voiceProvider,
          voiceId: deps.env.VOICE_ID ?? DEFAULT_VOICE_ID,
          limits: {
            maxSeconds: deps.env.VOICE_MAX_SECONDS ?? 420,
            idleSeconds: deps.env.VOICE_IDLE_SECONDS ?? 60,
            maxSessions: deps.env.VOICE_MAX_SESSIONS ?? 10,
            sessionsPerHour: deps.env.VOICE_SESSIONS_PER_HOUR ?? 6,
            dailySeconds: deps.env.VOICE_DAILY_SECONDS ?? 600,
          },
        }
      : null,
    voiceSessions: new Map(),
    agentDeps: () => ({
      llm: runtime.llm,
      ports: runtime.ports,
      registry: runtime.registry,
      confirmSecret: runtime.confirmSecret,
      tier: deps.env.AI_CHAT_TIER ?? AiTier.enum.small,
      search: async (actor, input) => {
        const { value } = await hybridSearch(
          {
            llm: runtime.llm,
            embeddings: runtime.embeddings,
            ports: runtime.ports,
            minSimilarity,
          },
          { actor, requestId: null },
          { q: input.q ?? '', limit: input.limit, rerank: false }
        );
        return value.items.map(item => item.book);
      },
    }),
    options: {
      nlSearchCachePadding: deps.env.NL_SEARCH_CACHE_PADDING ?? false,
      hybridRerank: deps.env.HYBRID_SEARCH_RERANK ?? false,
      minSimilarity: minSimilarityFor(embeddings.model, deps.env.HYBRID_MIN_SIMILARITY),
      expansion: deps.env.EMBEDDING_EXPANSION === EmbeddingExpansion.enum['fr-ar'],
    },
    status: () => ({
      provider: llm.name,
      models: { small: llm.models.small || null, strong: llm.models.strong || null },
      cachingSupported: llm.supportsPromptCaching,
      forcedToolChoice: llm.forcedToolChoice,
      tiers: {
        small: {
          provider: llm.tiers.small.provider,
          model: llm.tiers.small.model,
          cachingSupported: llm.tiers.small.supportsPromptCaching,
          forcedToolChoice: llm.tiers.small.forcedToolChoice,
        },
        strong: {
          provider: llm.tiers.strong.provider,
          model: llm.tiers.strong.model,
          cachingSupported: llm.tiers.strong.supportsPromptCaching,
          forcedToolChoice: llm.tiers.strong.forcedToolChoice,
        },
      },
      embeddings: {
        provider: embeddings.name,
        model: embeddings.model,
        dimensions: embeddings.dimensions,
        expansion: deps.env.EMBEDDING_EXPANSION ?? EmbeddingExpansion.enum.off,
      },
      features: {
        NL_SEARCH: true,
        HYBRID_SEARCH: true,
        RERANK: deps.env.HYBRID_SEARCH_RERANK ?? false,
        SIMILAR: true,
        AUTOFILL: true,
        RECOMMEND: true,
        AGENT_CHAT: true,
        EMBEDDING: true,
        JUDGE: false,
        EXPANSION: deps.env.EMBEDDING_EXPANSION === EmbeddingExpansion.enum['fr-ar'],
        VOICE: voiceProvider !== null,
      },
      search: { minSimilarity },
      chat: { tier: deps.env.AI_CHAT_TIER ?? AiTier.enum.small },
      voiceMode: voiceProvider ? VoiceMode.enum.server : VoiceMode.enum.off,
    }),
  };
  return runtime;
};
