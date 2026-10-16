import type { Response } from 'express';

import { COOKIES, REFRESH_COOKIE_PATH } from '../config/constants.js';

export interface CookieConfig {
  secure: boolean;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

const base = (secure: boolean) => ({ httpOnly: true, sameSite: 'lax' as const, secure });

export const setAuthCookies = (
  res: Response,
  tokens: { access: string; refresh: string },
  config: CookieConfig
): void => {
  res.cookie(COOKIES.access, tokens.access, {
    ...base(config.secure),
    path: '/',
    maxAge: config.accessTtlSeconds * 1000,
  });
  res.cookie(COOKIES.refresh, tokens.refresh, {
    ...base(config.secure),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.refreshTtlSeconds * 1000,
  });
};

export const clearAuthCookies = (res: Response, config: CookieConfig): void => {
  res.clearCookie(COOKIES.access, { ...base(config.secure), path: '/' });
  res.clearCookie(COOKIES.refresh, { ...base(config.secure), path: REFRESH_COOKIE_PATH });
};
