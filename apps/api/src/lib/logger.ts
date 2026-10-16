import winston from 'winston';
import { HEADERS } from '@library/contracts';

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  HEADERS.authorization,
  'cookie',
  'set-cookie',
  'token',
  'refreshToken',
  'accessToken',
]);

export const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : redact(entry, depth + 1);
  }
  return out;
};

export const createLogger = (level: string, service = 'library-api'): Logger => {
  const logger = winston.createLogger({
    level: level === 'silent' ? 'error' : level,
    silent: level === 'silent',
    defaultMeta: { service },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [new winston.transports.Console()],
  });
  return {
    info: (message, meta) => logger.info(message, redact(meta)),
    warn: (message, meta) => logger.warn(message, redact(meta)),
    error: (message, meta) => logger.error(message, redact(meta)),
  };
};
