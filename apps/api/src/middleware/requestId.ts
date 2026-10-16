import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HEADERS } from '@library/contracts';
import { runWithRequestContext } from '../lib/requestContext.js';

const SAFE = /^[A-Za-z0-9._-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(HEADERS.requestId);
  const id = incoming !== undefined && SAFE.test(incoming) ? incoming : randomUUID();
  res.locals['requestId'] = id;
  res.setHeader(HEADERS.requestId, id);
  runWithRequestContext({ requestId: id }, () => next());
};

export const getRequestId = (res: { locals: Record<string, unknown> }): string =>
  typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : 'unknown';
