import type { Request, Response } from 'express';
import {
  API_RESOURCES,
  AuthResponse,
  LoginBody,
  MeResponse,
  RefreshBody,
  RegisterBody,
} from '@library/contracts';
import { z } from 'zod';
import { COOKIES } from '../../config/constants.js';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies.js';
import type { CookieConfig } from '../../lib/cookies.js';
import { unauthenticated } from '../../lib/errors.js';
import { createModuleRouter } from '../../lib/route.js';
import type { ModuleRouter, RouteGuards } from '../../lib/route.js';
import type { AuthService, Session } from './auth.service.js';

const isBrowser = (req: Request): boolean => req.header('origin') !== undefined;

const refreshTokenFrom = (
  req: Request,
  body: { refreshToken?: string | undefined } | undefined
): string | undefined => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[COOKIES.refresh];
  return (
    body?.refreshToken ??
    (typeof fromCookie === 'string' && fromCookie.length > 0 ? fromCookie : undefined)
  );
};

const respond = (
  req: Request,
  res: Response,
  session: Session,
  cookies: CookieConfig
): AuthResponse => {
  setAuthCookies(res, session.tokens, cookies);
  return isBrowser(req)
    ? { user: session.user }
    : {
        user: session.user,
        accessToken: session.tokens.access,
        refreshToken: session.tokens.refresh,
      };
};

export const authRoutes = (
  service: AuthService,
  guards: RouteGuards,
  cookies: CookieConfig
): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.auth, { guards });
  const tags = ['auth'];

  mod.define(
    {
      method: 'post',
      path: '/register',
      access: 'public',
      body: RegisterBody,
      response: AuthResponse,
      status: 201,
      summary: 'Register a reader account',
      description:
        'Always creates a READER. Sets the auth cookies; non-browser clients also receive the tokens in the body.',
      tags,
    },
    async ({ body, req, res }) => respond(req, res, await service.register(body), cookies)
  );

  mod.define(
    {
      method: 'post',
      path: '/login',
      access: 'public',
      body: LoginBody,
      response: AuthResponse,
      summary: 'Log in',
      tags,
    },
    async ({ body, req, res }) => respond(req, res, await service.login(body), cookies)
  );

  mod.define(
    {
      method: 'post',
      path: '/refresh',
      access: 'public',
      body: RefreshBody,
      response: AuthResponse,
      summary: 'Rotate the refresh token',
      description:
        'Reads the refresh cookie or the body token. Reusing a rotated-out token revokes its whole family.',
      tags,
    },
    async ({ body, req, res }) => {
      const raw = refreshTokenFrom(req, body);
      if (raw === undefined) throw unauthenticated('Refresh token required');
      try {
        return respond(req, res, await service.refresh(raw), cookies);
      } catch (error) {
        clearAuthCookies(res, cookies);
        throw error;
      }
    }
  );

  mod.define(
    {
      method: 'post',
      path: '/logout',
      access: 'public',
      body: RefreshBody,
      response: z.object({ loggedOut: z.literal(true) }),
      summary: 'Log out',
      description:
        'Revokes the session family and clears cookies; works without a valid access token.',
      tags,
    },
    async ({ body, req, res }) => {
      await service.logout(refreshTokenFrom(req, body));
      clearAuthCookies(res, cookies);
      return { loggedOut: true };
    }
  );

  mod.define(
    {
      method: 'get',
      path: '/me',
      access: 'user',
      response: MeResponse,
      summary: 'The current user',
      tags,
    },
    async ({ actor }) => service.me(actor)
  );

  return mod;
};

export const meRoutes = (
  service: AuthService,
  guards: RouteGuards,
  cookies: CookieConfig
): ModuleRouter => {
  const mod = createModuleRouter(API_RESOURCES.me, { guards });
  mod.define(
    {
      method: 'delete',
      path: '/',
      access: 'user',
      response: z.object({ disabled: z.literal(true) }),
      summary: 'Disable my account',
      description: 'Soft-disables the account (no hard delete) and revokes every session.',
      tags: ['auth'],
    },
    async ({ actor, res }) => {
      await service.disable(actor);
      clearAuthCookies(res, cookies);
      return { disabled: true };
    }
  );
  return mod;
};
