import {
  AiRunSummary,
  AiRunsResponse,
  AiStatus,
  API_RESOURCES,
  AutofillBody,
  BookDraft,
  ChatBody,
  ChatResponse,
  ConfirmActionBody,
  ConfirmActionResponse,
  ExplainedRecommendationsQuery,
  ExplainedRecommendationsResponse,
  HybridSearchQuery,
  HybridSearchResponse,
  SimilarBooksResponse,
  ParseSearchBody,
  ParsedSearch,
  Role,
} from '@library/contracts';
import {
  ProviderUnavailableError,
  agentTurn,
  autofill,
  confirmAction,
  recommend,
  hybridSearch,
  nlSearch,
  similarBooks,
} from '@library/ai';
import { z } from 'zod';
import { authorize } from '../../lib/authz.js';
import { MESSAGES } from '../../config/constants.js';
import { aiUnavailable, notFound } from '../../lib/errors.js';
import { getRequestId } from '../../middleware/requestId.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { AiRuntime } from '../adapters/index.js';

export const AI_RUNS_LIMIT = 50;

export const aiRoutes = (
  runtime: AiRuntime,
  prisma: PrismaClient,
  guards: RouteGuards
): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.ai, { guards });

  mod.define(
    {
      method: 'get',
      path: '/status',
      access: 'public',
      response: AiStatus,
      summary: 'What the AI layer is configured with',
      description:
        'Provider and model ids exactly as configured (never implied), embeddings, enabled features, voice mode.',
      tags: ['ai'],
    },
    async () => runtime.status()
  );

  mod.define(
    {
      method: 'get',
      path: '/runs',
      access: 'librarian',
      query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(AI_RUNS_LIMIT) }),
      response: AiRunsResponse,
      summary: 'Recent model calls with cost and latency',
      tags: ['ai'],
    },
    async ({ actor, query }) => {
      authorize(actor, Role.enum.LIBRARIAN);
      const [rows, totals] = await Promise.all([
        prisma.aiRun.findMany({ orderBy: { id: 'desc' }, take: query.limit }),
        prisma.aiRun.aggregate({ _count: { _all: true }, _sum: { costUsd: true } }),
      ]);
      const failures = await prisma.aiRun.count({ where: { success: false } });
      return {
        items: rows.map(row =>
          AiRunSummary.parse({
            id: row.id,
            userId: row.userId,
            feature: row.feature,
            provider: row.provider,
            model: row.model,
            tokensIn: row.tokensIn,
            tokensOut: row.tokensOut,
            tokensCachedRead: row.tokensCachedRead,
            tokensCachedWrite: row.tokensCachedWrite,
            tokensSpeechIn: row.tokensSpeechIn,
            tokensSpeechOut: row.tokensSpeechOut,
            costUsd: row.costUsd.toNumber(),
            latencyMs: row.latencyMs,
            fallbackUsed: row.fallbackUsed,
            success: row.success,
            errorCode: row.errorCode,
            createdAt: row.createdAt.toISOString(),
          })
        ),
        totals: {
          runs: totals._count._all,
          costUsd: totals._sum.costUsd?.toNumber() ?? 0,
          failures,
        },
      };
    }
  );

  mod.define(
    {
      method: 'post',
      path: '/search/parse',
      access: 'user',
      body: ParseSearchBody,
      response: ParsedSearch,
      summary: 'Natural-language search → catalog filters',
      description:
        'Parses free text (English, Arabic or French) into a validated BooksQuery plus editable chips. ' +
        'Nothing is searched here: the client applies the query to GET /books. `meta.ai` carries the ' +
        'model, tokens, cost and latency; 503 AI_UNAVAILABLE means "use the plain search".',
      tags: ['ai'],
    },
    async ({ actor, body, res }) => {
      try {
        const outcome = await nlSearch(
          {
            llm: runtime.llm,
            ports: runtime.ports,
            cachePadding: runtime.options.nlSearchCachePadding,
          },
          { actor, requestId: getRequestId(res) ?? null },
          { text: body.text }
        );
        (res.locals as { meta?: Record<string, unknown> }).meta = { ai: outcome.meta };
        return outcome.value;
      } catch (error) {
        if (error instanceof ProviderUnavailableError) throw aiUnavailable();
        throw error;
      }
    }
  );

  mod.define(
    {
      method: 'post',
      path: '/books/autofill',
      access: 'librarian',
      body: AutofillBody,
      response: BookDraft,
      summary: 'Draft a book from an ISBN or a title',
      description:
        'Looks the book up in the external catalog (Open Library), then lets the small model fill ' +
        'only the gaps: author, first-publication year, synopsis and genres from the live list. ' +
        'Every field carries its source (lookup, input, model, empty) and a confidence. Nothing ' +
        'is saved. `meta.lookupHit` says whether the catalog knew the book; `meta.aiUnavailable` ' +
        'means the provider was down and the draft is lookup-only (still 200).',
      tags: ['ai'],
    },
    async ({ actor, body, res }) => {
      authorize(actor, Role.enum.LIBRARIAN);
      const outcome = await autofill(
        { llm: runtime.llm, ports: runtime.ports },
        { actor, requestId: getRequestId(res) ?? null },
        body
      );
      (res.locals as { meta?: Record<string, unknown> }).meta = {
        ai: outcome.meta,
        lookupHit: outcome.lookupHit,
        aiUnavailable: outcome.aiUnavailable,
      };
      return outcome.value;
    }
  );

  mod.define(
    {
      method: 'get',
      path: '/search',
      access: 'user',
      query: HybridSearchQuery,
      response: HybridSearchResponse,
      summary: 'Hybrid search: lexical + semantic, fused (RRF k = 60), optional rerank',
      description:
        'The catalog search and a KNN over the book embeddings, 20 candidates each, fused with ' +
        'reciprocal rank fusion. `rerank=true` reorders the top 20 with the small model (only ids it ' +
        'was shown); absent, the server default applies (HYBRID_SEARCH_RERANK). `scores.lexical` is ' +
        'the lexical rank, `scores.semantic` the cosine similarity, `scores.fused` the RRF score. ' +
        'Active books only. A provider outage degrades to the lexical leg (`meta.ai.fallbackUsed`); ' +
        '`meta.rerank` says how the rerank went: off, applied, invalid (fused order kept) or unavailable.',
      tags: ['ai'],
    },
    async ({ actor, query, res }) => {
      try {
        const outcome = await hybridSearch(
          {
            llm: runtime.llm,
            embeddings: runtime.embeddings,
            ports: runtime.ports,
            minSimilarity: runtime.options.minSimilarity,
          },
          { actor, requestId: getRequestId(res) ?? null },
          {
            q: query.q,
            limit: query.limit,
            genre: query.genre,
            rerank: query.rerank ?? runtime.options.hybridRerank,
          }
        );
        (res.locals as { meta?: Record<string, unknown> }).meta = {
          ai: outcome.meta,
          rerank: outcome.rerank,
        };
        return outcome.value;
      } catch (error) {
        if (error instanceof ProviderUnavailableError) throw aiUnavailable();
        throw error;
      }
    }
  );

  mod.define(
    {
      method: 'post',
      path: '/chat',
      access: 'user',
      body: ChatBody,
      response: ChatResponse,
      summary: 'One turn of the librarian agent',
      description:
        'The strong model answers with the catalog tools your role allows (readers never get ' +
        'draftBook). Books it mentions are cited by id, and only ids a tool returned survive. ' +
        'Nothing is ever changed here: a reading-list change comes back as `pendingAction` with ' +
        'a signed token, to be confirmed or cancelled with POST /ai/actions/confirm | cancel. ' +
        'Tool results are data, never instructions. 503 AI_UNAVAILABLE when the model is down.',
      tags: ['ai'],
    },
    async ({ actor, body, res }) => {
      try {
        const outcome = await agentTurn(
          runtime.agentDeps(),
          { actor, requestId: getRequestId(res) ?? null },
          { messages: body.messages, locale: body.locale, context: body.context }
        );
        (res.locals as { meta?: Record<string, unknown> }).meta = { ai: outcome.meta };
        return outcome.value;
      } catch (error) {
        if (error instanceof ProviderUnavailableError) throw aiUnavailable();
        throw error;
      }
    }
  );

  mod.define(
    {
      method: 'get',
      path: '/recommendations',
      access: 'user',
      query: ExplainedRecommendationsQuery,
      response: ExplainedRecommendationsResponse,
      summary: 'Up to six books for you, each explained by books on your reading list',
      description:
        'The small model picks from at most twelve candidates (your favourite genres, best rated, and ' +
        'the books nearest to your shelf by meaning) and explains each pick in a sentence that cites ' +
        'your own reading-list entries. Only candidates can be recommended and only entries it was ' +
        'shown can be cited. `meta.reason`: ok, no-history (empty shelf, no model call), ' +
        'no-candidates, or fallback (invalid output twice: an empty list). 503 AI_UNAVAILABLE when ' +
        'the model is down; the page then shows the plain "For your shelves" list.',
      tags: ['ai'],
    },
    async ({ actor, query, res }) => {
      try {
        const outcome = await recommend(
          {
            llm: runtime.llm,
            ports: runtime.ports,
            embeddingModel: runtime.embeddings.model,
          },
          { actor, requestId: getRequestId(res) ?? null },
          { locale: query.locale }
        );
        (res.locals as { meta?: Record<string, unknown> }).meta = {
          reason: outcome.reason,
          ...(outcome.meta ? { ai: outcome.meta } : {}),
        };
        return outcome.value;
      } catch (error) {
        if (error instanceof ProviderUnavailableError) throw aiUnavailable();
        throw error;
      }
    }
  );

  for (const [path, decision, summary] of [
    ['/actions/confirm', 'confirm', 'Run a change the agent proposed'],
    ['/actions/cancel', 'cancel', 'Drop a change the agent proposed'],
  ] as const)
    mod.define(
      {
        method: 'post',
        path,
        access: 'user',
        body: ConfirmActionBody,
        response: ConfirmActionResponse,
        summary,
        description:
          'Shared by text chat and voice. The token must be signed by this server, unexpired ' +
          '(10 min) and issued to you: 401 CONFIRM_TOKEN_INVALID otherwise, 403 for another ' +
          "user's token. Each action is decided once: a second confirm or cancel, concurrent or " +
          'not, is 409 ACTION_ALREADY_DECIDED. The tool runs with the input from the token, ' +
          'through the same services and role checks as the REST endpoints.',
        tags: ['ai'],
      },
      async ({ actor, body, res }) => {
        const outcome = await confirmAction(
          runtime.agentDeps(),
          { actor, requestId: getRequestId(res) ?? null },
          { token: body.token, decision }
        );
        runtime.voiceSessions.get(actor.id)?.decided({
          actionId: outcome.actionId,
          status: outcome.status,
          summary: outcome.summary,
        });
        return outcome;
      }
    );

  return mod;
};

export const SIMILAR_BOOKS_COUNT = 6;

export const aiBookRoutes = (runtime: AiRuntime, guards: RouteGuards): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.books, { guards });
  mod.define(
    {
      method: 'get',
      path: '/:id/similar',
      access: 'user',
      params: z.object({ id: z.coerce.number().int().positive() }),
      response: SimilarBooksResponse,
      summary: 'Books like this one',
      description:
        'The nearest active books to this book by embedding (cosine), itself excluded. Empty until ' +
        'the book is embedded by the configured model. Readers get 404 for an archived book.',
      tags: ['ai', 'books'],
    },
    async ({ actor, params }) => {
      if ((await runtime.ports.catalog.getBook(actor, params.id)) === null)
        throw notFound(MESSAGES.bookNotFound);
      return similarBooks(
        { embeddings: runtime.embeddings, ports: runtime.ports },
        { actor },
        { bookId: params.id, limit: SIMILAR_BOOKS_COUNT }
      );
    }
  );
  return mod;
};
