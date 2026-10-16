import type { Request, RequestHandler } from 'express';
import { HEADERS } from '@library/contracts';
import { COOKIES, MESSAGES } from '../config/constants.js';
import { unauthenticated } from '../lib/errors.js';
import type { PrismaClient } from '../lib/prisma.js';
import { setContextActor } from '../lib/requestContext.js';
import type { Actor } from '../lib/route.js';
import { verifyAccessToken } from '../lib/tokens.js';
import type { TokenConfig } from '../lib/tokens.js';

export const extractAccessToken = (
  req: Request
): { token: string; via: 'bearer' | 'cookie' } | null => {
  const header = req.header(HEADERS.authorization);
  if (header !== undefined && /^Bearer\s+\S+$/i.test(header)) {
    return { token: header.replace(/^Bearer\s+/i, ''), via: 'bearer' };
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const cookie = cookies?.[COOKIES.access];
  if (typeof cookie === 'string' && cookie.length > 0) return { token: cookie, via: 'cookie' };
  return null;
};

export const createAuthenticate =
  (prisma: PrismaClient, config: TokenConfig): RequestHandler =>
  async (req, res, next) => {
    const extracted = extractAccessToken(req);
    if (extracted === null) return next(unauthenticated());
    const userId = verifyAccessToken(extracted.token, config);
    if (userId === null) return next(unauthenticated(MESSAGES.accessTokenInvalid));
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, disabledAt: true },
    });
    if (!user || user.disabledAt !== null) return next(unauthenticated());
    const actor: Actor = { id: user.id, role: user.role };
    res.locals['actor'] = actor;
    res.locals['authVia'] = extracted.via;
    setContextActor(actor);
    next();
  };
