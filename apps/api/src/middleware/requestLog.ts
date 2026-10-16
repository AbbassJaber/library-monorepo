import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';
import { getRequestId } from './requestId.js';

export const requestLog =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const actor = res.locals['actor'] as { id: number } | undefined;
      logger.info('request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        requestId: getRequestId(res),
        ...(actor !== undefined ? { userId: actor.id } : {}),
      });
    });
    next();
  };
