import type { RequestHandler } from 'express';
import type { Role } from '@library/contracts';
import { authorize } from '../lib/authz.js';
import { unauthenticated } from '../lib/errors.js';
import type { Actor } from '../lib/route.js';

export const requireRole =
  (role: Role): RequestHandler =>
  (_req, res, next) => {
    const actor = res.locals['actor'] as Actor | undefined;
    if (actor === undefined) return next(unauthenticated());
    try {
      authorize(actor, role);
      next();
    } catch (error) {
      next(error);
    }
  };
