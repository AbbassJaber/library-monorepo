import { rateLimit as expressRateLimit } from 'express-rate-limit';
import type { Store } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { ApiErrorCode, type ErrorEnvelope } from '@library/contracts';
import { getRequestId } from './requestId.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  store?: Store;
}

export const rateLimit = (options: RateLimitOptions): RequestHandler =>
  expressRateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    ...(options.store ? { store: options.store } : {}),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ErrorEnvelope = {
        error: {
          code: ApiErrorCode.enum.RATE_LIMITED,
          message: 'Too many requests, please slow down',
          requestId: getRequestId(res),
        },
      };
      res.status(429).json(body);
    },
  });
