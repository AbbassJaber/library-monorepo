import { API_PREFIX } from '@library/contracts';
import { DEMO_ACCOUNTS } from '@library/domain-config/seed';
import { afterAll } from 'vitest';

export const BASE_URL = (process.env['SMOKE_BASE_URL'] ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
);
export const API = `${BASE_URL}${API_PREFIX}`;
export const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const PASSWORD = process.env['SMOKE_PASSWORD'] ?? DEMO_ACCOUNTS.password;
export const DEMO = {
  reader: {
    email: process.env['SMOKE_READER_EMAIL'] ?? DEMO_ACCOUNTS.reader.email,
    password: PASSWORD,
  },
  librarian: {
    email: process.env['SMOKE_LIBRARIAN_EMAIL'] ?? DEMO_ACCOUNTS.librarian.email,
    password: PASSWORD,
  },
};

export interface SmokeResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: {
    data?: T;
    meta?: Record<string, unknown>;
    error?: { code: string; message: string; details?: unknown };
  };
}

export const http = async <T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<SmokeResponse<T>> => {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let body: SmokeResponse<T>['body'] = {};
  try {
    body = text.length > 0 ? (JSON.parse(text) as SmokeResponse<T>['body']) : {};
  } catch {
    body = {};
  }
  return { status: res.status, headers: res.headers, body };
};

export const data = <T>(res: SmokeResponse<T>): T => {
  if (res.body.data === undefined) {
    throw new Error(`Expected data, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
};

export interface Session {
  token: string;
  refreshToken: string;
  user: { id: number; email: string; role: 'READER' | 'LIBRARIAN' };
}

const toSession = (
  res: SmokeResponse<{ user: Session['user']; accessToken?: string; refreshToken?: string }>
): Session => {
  const payload = data(res);
  if (!payload.accessToken || !payload.refreshToken)
    throw new Error('Login did not return tokens (is an Origin header being sent?)');
  return { token: payload.accessToken, refreshToken: payload.refreshToken, user: payload.user };
};

const sessions = new Map<string, Promise<Session>>();

export const login = (credentials: { email: string; password: string }): Promise<Session> => {
  let pending = sessions.get(credentials.email);
  if (pending === undefined) {
    pending = http<{ user: Session['user']; accessToken?: string; refreshToken?: string }>(
      '/auth/login',
      { method: 'POST', body: credentials }
    ).then(toSession);
    sessions.set(credentials.email, pending);
  }
  return pending;
};

export const registerReader = async (label: string): Promise<Session> => {
  const email = `smoke-${label}-${RUN_ID}@example.test`;
  const session = toSession(
    await http('/auth/register', {
      method: 'POST',
      body: { email, password: DEMO.reader.password, displayName: `Smoke ${label} ${RUN_ID}` },
    })
  );
  cleanup.account(session);
  return session;
};

export const name = (base: string): string => `${base} [smoke-${RUN_ID}]`;

type Step = () => Promise<void>;
const steps: { shelf: Step[]; books: Step[]; genres: Step[]; accounts: Step[] } = {
  shelf: [],
  books: [],
  genres: [],
  accounts: [],
};

export const cleanup = {
  shelf(session: Session, bookId: number) {
    steps.shelf.push(async () => {
      await http(`/me/reading-list/${bookId}`, { method: 'DELETE', token: session.token });
    });
  },
  book(librarian: Session, bookId: number) {
    steps.books.push(async () => {
      const current = await http<{ version: number; archivedAt: string | null }>(
        `/books/${bookId}`,
        { token: librarian.token }
      );
      if (current.body.data && current.body.data.archivedAt === null) {
        await http(`/books/${bookId}/archive`, {
          method: 'POST',
          body: { version: current.body.data.version },
          token: librarian.token,
        });
      }
    });
  },
  genre(librarian: Session, genreId: number) {
    steps.genres.push(async () => {
      await http(`/genres/${genreId}/archive`, { method: 'POST', token: librarian.token });
    });
  },
  account(session: Session) {
    steps.accounts.push(async () => {
      await http('/me', { method: 'DELETE', token: session.token });
    });
  },
};

export const runCleanup = async (): Promise<void> => {
  for (const group of [steps.shelf, steps.books, steps.genres, steps.accounts]) {
    for (const step of group.splice(0)) await step();
  }
};

afterAll(async () => {
  await runCleanup();
});
