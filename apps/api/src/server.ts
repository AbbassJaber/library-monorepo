import { createReadiness } from './ai/readiness.js';
import { attachVoiceGateway } from './ai/voice/voiceGateway.js';
import { createApp } from './app.js';
import { loadDotenv, loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { startScheduler } from './lib/scheduler.js';
import { pruneExpiredTokens } from './lib/tokens.js';
import { createV1 } from './modules/v1.js';
import { NODE_ENV } from './config/constants.js';

loadDotenv();
const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);
const auth = {
  accessSecret: env.JWT_ACCESS_SECRET,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
  refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  bcryptRounds: env.BCRYPT_ROUNDS,
};
const cookies = {
  secure: env.COOKIE_SECURE,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
  refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
};

const v1 = createV1({ prisma, logger, auth, cookies, ai: env });

const app = createApp({
  ping: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  ...(env.READY_REQUIRE_EMBEDDINGS
    ? {
        readiness: createReadiness({
          prisma,
          sync: v1.embeddingSync,
          embeddings: v1.ai.embeddings,
          logger,
        }),
      }
    : {}),
  logger,
  exposeStack: env.NODE_ENV === NODE_ENV.development,
  corsOrigins: env.CORS_ORIGINS,
  rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX_REQUESTS },
  authRateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_AUTH_MAX_REQUESTS },
  aiRateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_AI_MAX_REQUESTS },
  apis: [v1.api],
  ...(env.WEB_DIST_DIR ? { webRoot: env.WEB_DIST_DIR } : {}),
});

const scheduler = startScheduler(
  [
    {
      name: 'prune-refresh-tokens',
      intervalMs: 60 * 60 * 1000,
      run: () => pruneExpiredTokens(prisma),
    },
  ],
  logger
);

let embeddingScheduler: { stop: () => void } | undefined;
const server = app.listen(env.PORT, () => {
  logger.info('listening', { port: env.PORT, env: env.NODE_ENV });
  if (env.EMBED_SYNC_ON_START)
    embeddingScheduler = startScheduler(
      [
        {
          name: 'embedding-sync',
          intervalMs: env.EMBED_SYNC_INTERVAL_MS,
          run: () => v1.embeddingSync.syncAll(),
          report: result => (result as { embedded?: number }).embedded !== 0,
        },
      ],
      logger
    );
});

const voiceGateway = attachVoiceGateway(server, {
  prisma,
  logger,
  runtime: v1.ai,
  tokens: auth,
  corsOrigins: env.CORS_ORIGINS,
});

const shutdown = (signal: string) => {
  logger.info('shutting down', { signal });
  void voiceGateway.close();
  scheduler.stop();
  embeddingScheduler?.stop();
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
