import { API_PREFIX, API_RESOURCES } from '@library/contracts';

export const COOKIES = {
  access: 'lib_access',
  refresh: 'lib_refresh',
} as const;

export const REFRESH_COOKIE_PATH = `${API_PREFIX}${API_RESOURCES.auth}`;

export const NODE_ENV = {
  development: 'development',
  test: 'test',
  production: 'production',
} as const;

export const SEED_MODE = { always: 'always', ifEmpty: 'if-empty', never: 'never' } as const;
export type SeedMode = (typeof SEED_MODE)[keyof typeof SEED_MODE];

export const POWERED_BY_SETTING = 'x-powered-by';

export const LEGACY_TEST_ACTOR_HEADER = 'x-test-actor';

export const MESSAGES = {
  bookNotFound: 'Book not found',
  genreNotFound: 'Genre not found',
  notOnShelf: 'Book is not on your reading list',
  notYourRecord: 'Not your record',
  requiresRole: (role: string) => `Requires the ${role} role`,
  crossOriginRefused: 'Cross-origin request refused',
  accessTokenInvalid: 'Invalid or expired access token',
} as const;
