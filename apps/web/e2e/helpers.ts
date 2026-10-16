import { API_PREFIX, HEADERS, apiPaths } from '@library/contracts';
import type { Page } from '@playwright/test';
import { DEMO, E2E_BASE_URL } from './config';

export const loginAs = async (page: Page, who: keyof typeof DEMO): Promise<void> => {
  const base = new URL(E2E_BASE_URL);
  const res = await page.request.post(`${base.origin}${API_PREFIX}${apiPaths.auth.login}`, {
    data: DEMO[who],
    headers: { [HEADERS.origin]: base.origin },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
};

export const firstBookId = async (page: Page): Promise<number> => {
  const res = await page.request.get(`${API_PREFIX}${apiPaths.books.newest}`);
  const body = (await res.json()) as { data: Array<{ id: number }> };
  const first = body.data[0];
  if (!first) throw new Error('newest list is empty');
  return first.id;
};

export const apiCall = async <T = unknown>(
  page: Page,
  method: 'get' | 'post' | 'patch' | 'delete' | 'put',
  path: string,
  data?: unknown
): Promise<{ status: number; data: T }> => {
  const base = new URL(E2E_BASE_URL);
  const res = await page.request.fetch(`${base.origin}${API_PREFIX}${path}`, {
    method: method.toUpperCase(),
    headers: { [HEADERS.origin]: base.origin },
    ...(data === undefined ? {} : { data }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T };
  return { status: res.status(), data: body.data as T };
};

export const runId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
