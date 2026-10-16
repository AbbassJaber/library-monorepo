import { loadDotenv, loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { createV1 } from '../modules/v1.js';

loadDotenv();
const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);
const v1 = createV1({
  prisma,
  logger,
  auth: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    bcryptRounds: env.BCRYPT_ROUNDS,
  },
  cookies: {
    secure: env.COOKIE_SECURE,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  },
  ai: env,
});
const result = await v1.embeddingSync.syncAll();
// eslint-disable-next-line no-console
console.log(
  JSON.stringify({ ...result, provider: v1.ai.embeddings.name, model: v1.ai.embeddings.model })
);
await prisma.$disconnect();
