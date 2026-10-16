import { API_PREFIX, ReadingState } from '@library/contracts';
import { http, HttpResponse } from 'msw';
import { aiStatus, book, entry, genres, reader, summary } from '../fixtures';

export const API = API_PREFIX;

const ok = (data: unknown, meta?: unknown, init?: { status?: number }) =>
  HttpResponse.json(meta === undefined ? { data } : { data, meta }, init);
export const error = (status: number, code: string, message = code, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, requestId: 'test' } }, { status });

const page = (items: unknown[], pageNumber: number, pageSize: number, total: number) => ({
  items,
  meta: { page: pageNumber, pageSize, total, totalPages: Math.ceil(total / pageSize) },
});

export const handlers = [
  http.get(`${API}/auth/me`, () => ok(reader)),
  http.post(`${API}/auth/login`, () => ok({ user: reader })),
  http.post(`${API}/auth/register`, () => ok({ user: reader }, undefined, { status: 201 })),
  http.post(`${API}/auth/logout`, () => ok({ loggedOut: true })),
  http.post(`${API}/auth/refresh`, () => ok({ user: reader })),

  http.get(`${API}/books/newest`, () => ok([1, 2, 3, 4, 5, 6].map(id => summary(id)))),
  http.get(`${API}/books`, ({ request }) => {
    const url = new URL(request.url);
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '24');
    const total = 50;
    const start = (pageNumber - 1) * pageSize;
    const items = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) =>
      summary(start + i + 1)
    );
    return ok(page(items, pageNumber, pageSize, total));
  }),
  http.get(`${API}/books/:id`, ({ params }) => ok(book(Number(params['id'])))),
  http.get(`${API}/genres`, () => ok(genres)),
  http.get(`${API}/me/reading-list`, () =>
    ok([entry(1, 1), entry(2, 2, { state: ReadingState.enum.READING })])
  ),
  http.get(`${API}/me/favorite-genres`, () => ok([])),
  http.get(`${API}/me/recommendations`, () => ok([])),
  http.get(`${API}/ai/status`, () => ok(aiStatus)),
  http.get(`${API}/ai/recommendations`, () => ok([], { reason: 'no-history' })),
];

export { ok };
