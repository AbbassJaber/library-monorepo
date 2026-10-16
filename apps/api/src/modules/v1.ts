import { API_PREFIX } from '@library/contracts';
import { mountApi } from '../lib/apiMount.js';
import type { ApiMount } from '../lib/apiMount.js';
import type { CookieConfig } from '../lib/cookies.js';
import type { Logger } from '../lib/logger.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { RouteGuards } from '../lib/route.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { authRoutes, meRoutes } from './auth/auth.routes.js';
import { createAuthService } from './auth/auth.service.js';
import type { AuthConfig } from './auth/auth.service.js';
import { auditRoutes } from './audit/audit.routes.js';
import { createAuditService } from './audit/audit.service.js';
import { booksRoutes } from './books/books.routes.js';
import { favoritesRoutes } from './favorites/favorites.routes.js';
import { createFavoritesService } from './favorites/favorites.service.js';
import { createBooksService } from './books/books.service.js';
import { genresRoutes } from './genres/genres.routes.js';
import { createGenresService } from './genres/genres.service.js';
import { recommendationsRoutes } from './recommendations/recommendations.routes.js';
import { createRecommendationsService } from './recommendations/recommendations.service.js';
import { shelfRoutes } from './shelf/shelf.routes.js';
import { createShelfService } from './shelf/shelf.service.js';
import { createAiRuntime } from '../ai/adapters/index.js';
import type { AiRuntime, AiRuntimeDeps } from '../ai/adapters/index.js';
import { createEmbeddingSync, syncInBackground } from '../ai/embeddingSync.js';
import type { EmbeddingSync } from '../ai/embeddingSync.js';
import { aiBookRoutes, aiRoutes } from '../ai/router/ai.routes.js';

export interface ModuleDeps {
  prisma: PrismaClient;
  logger: Logger;
  auth: AuthConfig;
  cookies: CookieConfig;
  ai: AiRuntimeDeps['env'];
  lookupFixtures?: AiRuntimeDeps['lookupFixtures'];
}

export interface V1 {
  api: ApiMount;
  ai: AiRuntime;
  embeddingSync: EmbeddingSync;
}

export const createGuards = (prisma: PrismaClient, auth: AuthConfig): RouteGuards => ({
  authenticate: createAuthenticate(prisma, auth),
  requireRole,
});

export const createV1 = (deps: ModuleDeps): V1 => {
  const guards = createGuards(deps.prisma, deps.auth);
  const auth = createAuthService(deps.prisma, deps.auth);
  const genres = createGenresService(deps.prisma);
  const hooks: { embeddingSync?: EmbeddingSync } = {};
  const books = createBooksService(deps.prisma, {
    afterWrite: bookId => {
      if (hooks.embeddingSync) syncInBackground(hooks.embeddingSync, deps.logger, bookId);
    },
  });
  const shelf = createShelfService(deps.prisma);
  const favorites = createFavoritesService(deps.prisma);
  const recommendations = createRecommendationsService(deps.prisma, favorites);
  const audit = createAuditService(deps.prisma);
  const ai = createAiRuntime({
    prisma: deps.prisma,
    logger: deps.logger,
    env: deps.ai,
    services: { books, genres, shelf, favorites },
    ...(deps.lookupFixtures ? { lookupFixtures: deps.lookupFixtures } : {}),
  });
  const embeddingSync = createEmbeddingSync(ai, deps.prisma, deps.logger);
  hooks.embeddingSync = embeddingSync;
  const api = mountApi(API_PREFIX, [
    authRoutes(auth, guards, deps.cookies),
    meRoutes(auth, guards, deps.cookies),
    genresRoutes(genres, guards),
    booksRoutes(books, guards),
    shelfRoutes(shelf, guards),
    favoritesRoutes(favorites, guards),
    recommendationsRoutes(recommendations, guards),
    auditRoutes(audit, guards),
    aiRoutes(ai, deps.prisma, guards),
    aiBookRoutes(ai, guards),
  ]);
  return { api, ai, embeddingSync };
};
