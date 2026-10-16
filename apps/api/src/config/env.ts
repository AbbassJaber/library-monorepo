import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  AiProviderName,
  EmbeddingProviderName,
  AiTier,
  EmbeddingExpansion,
  VoiceProviderSetting,
} from '@library/contracts';
import { DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_VOICE_ID } from '@library/ai';
import { LOOKUP_SOURCE } from '@library/domain-config';
import { NODE_ENV, SEED_MODE } from './constants.js';

export const loadDotenv = (): void => {
  if (process.env['DATABASE_URL']) return;
  for (const candidate of ['..', '../..', '../../..']) {
    const envFile = path.join(import.meta.dirname, candidate, '.env');
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
      return;
    }
  }
};

const csv = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
  );

const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform(value => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV).default(NODE_ENV.development),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: csv,
  WEB_DIST_DIR: z.string().min(1).optional(),
  COOKIE_SECURE: flag(false),
  SEED_ON_START: z.enum(SEED_MODE).default(SEED_MODE.ifEmpty),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),
  JWT_ACCESS_SECRET: z.string().min(32, 'use at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).default(604800),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AI_PROVIDER: AiProviderName.default(AiProviderName.enum.mock),
  AI_PROVIDER_STRONG: z.union([z.literal(''), AiProviderName]).default(''),
  AI_MODEL_SMALL: z.string().default(''),
  AI_MODEL_STRONG: z.string().default(''),
  AI_CHAT_TIER: AiTier.default(AiTier.enum.small),
  BEDROCK_MODEL_SMALL: z.string().optional(),
  BEDROCK_MODEL_STRONG: z.string().optional(),
  ANTHROPIC_MODEL_SMALL: z.string().optional(),
  ANTHROPIC_MODEL_STRONG: z.string().optional(),
  KIMI_MODEL_SMALL: z.string().optional(),
  KIMI_MODEL_STRONG: z.string().optional(),
  OPENAI_COMPAT_MODEL_SMALL: z.string().optional(),
  OPENAI_COMPAT_MODEL_STRONG: z.string().optional(),
  AI_TEMPERATURE_SMALL: z.string().default(''),
  AI_TEMPERATURE_STRONG: z.string().default(''),
  AWS_REGION: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_COMPAT_BASE_URL: z.string().default(''),
  OPENAI_COMPAT_API_KEY: z.string().default(''),
  EMBEDDING_PROVIDER: EmbeddingProviderName.default(EmbeddingProviderName.enum.mock),
  EMBEDDING_MODEL: z.string().default(''),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(8).default(DEFAULT_EMBEDDING_DIMENSIONS),
  TRANSFORMERS_CACHE: z.string().default(''),
  AI_CONFIRM_SECRET: z
    .string()
    .min(16, 'use at least 16 characters')
    .default('dev-only-change-me-confirm'),
  RATE_LIMIT_AI_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),
  LOOKUP_PROVIDER: z.enum(LOOKUP_SOURCE).default(LOOKUP_SOURCE.openLibrary),
  OPEN_LIBRARY_BASE_URL: z.string().default(''),
  LOOKUP_TIMEOUT_MS: z.coerce.number().int().min(500).default(5000),
  NL_SEARCH_CACHE_PADDING: flag(false),
  HYBRID_SEARCH_RERANK: flag(false),
  EMBEDDING_EXPANSION: EmbeddingExpansion.default(EmbeddingExpansion.enum.off),
  HYBRID_MIN_SIMILARITY: z.preprocess(
    value => (value === '' ? undefined : value),
    z.coerce.number().min(0).max(1).optional()
  ),
  EMBED_SYNC_ON_START: flag(true),
  EMBED_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  READY_REQUIRE_EMBEDDINGS: flag(true),
  VOICE_PROVIDER: VoiceProviderSetting.default(VoiceProviderSetting.enum.off),
  VOICE_MODEL: z.string().optional(),
  VOICE_AWS_REGION: z.string().default('eu-north-1'),
  VOICE_ID: z.string().default(DEFAULT_VOICE_ID),
  VOICE_MAX_SECONDS: z.coerce.number().int().min(10).max(470).default(420),
  VOICE_IDLE_SECONDS: z.coerce.number().int().min(5).default(60),
  VOICE_MAX_SESSIONS: z.coerce.number().int().min(1).max(20).default(10),
  VOICE_SESSIONS_PER_HOUR: z.coerce.number().int().min(1).default(6),
  VOICE_DAILY_SECONDS: z.coerce.number().int().min(0).default(600),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n  ${issues.join('\n  ')}`);
  }
  return result.data;
};
