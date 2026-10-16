import type { RequestHandler } from 'express';
import { HEADERS } from '@library/contracts';
import { MESSAGES } from '../config/constants.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const originCheck =
  (allowedOrigins: string[]): RequestHandler =>
  (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.header(HEADERS.origin);
    if (origin === undefined) return next();
    const authorization = req.header(HEADERS.authorization);
    if (authorization !== undefined && /^Bearer\s+/i.test(authorization)) return next();
    if (allowedOrigins.includes(origin)) return next();
    next(forbidden(MESSAGES.crossOriginRefused));
  };
