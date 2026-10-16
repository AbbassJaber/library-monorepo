import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { api, ApiError, setSessionExpiredHandler } from './api';

describe('api client', () => {
  it('unwraps the envelope and throws ApiError for error responses', async () => {
    server.use(
      http.get(`${API}/thing`, () => ok({ id: 1 })),
      http.get(`${API}/missing`, () => error(404, 'NOT_FOUND', 'Nope'))
    );
    expect((await api.get<{ id: number }>('/thing')).data).toEqual({ id: 1 });
    await expect(api.get('/missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Nope',
    });
    await expect(api.get('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('refreshes once after a 401 and retries the original request', async () => {
    let authed = false;
    const refreshes: number[] = [];
    server.use(
      http.get(`${API}/me/reading-list`, () => (authed ? ok([]) : error(401, 'UNAUTHENTICATED'))),
      http.post(`${API}/auth/refresh`, () => {
        refreshes.push(1);
        authed = true;
        return ok({ user: {} });
      })
    );
    const res = await api.get<unknown[]>('/me/reading-list');
    expect(res.data).toEqual([]);
    expect(refreshes).toHaveLength(1);
  });

  it('is single-flight: three parallel 401s trigger exactly one refresh', async () => {
    let authed = false;
    let refreshes = 0;
    server.use(
      http.get(`${API}/a`, () => (authed ? ok('a') : error(401, 'UNAUTHENTICATED'))),
      http.get(`${API}/b`, () => (authed ? ok('b') : error(401, 'UNAUTHENTICATED'))),
      http.get(`${API}/c`, () => (authed ? ok('c') : error(401, 'UNAUTHENTICATED'))),
      http.post(`${API}/auth/refresh`, async () => {
        refreshes += 1;
        await new Promise(r => setTimeout(r, 30));
        authed = true;
        return ok({ user: {} });
      })
    );
    const results = await Promise.all([
      api.get<string>('/a'),
      api.get<string>('/b'),
      api.get<string>('/c'),
    ]);
    expect(results.map(r => r.data)).toEqual(['a', 'b', 'c']);
    expect(refreshes).toBe(1);
  });

  it('calls the session-expired handler when the refresh fails and does not retry again', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    let calls = 0;
    server.use(
      http.get(`${API}/me/reading-list`, () => {
        calls += 1;
        return error(401, 'UNAUTHENTICATED');
      }),
      http.post(`${API}/auth/refresh`, () => error(401, 'UNAUTHENTICATED'))
    );
    await expect(api.get('/me/reading-list')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it('never tries to refresh for login itself', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/login`, () =>
        error(401, 'UNAUTHENTICATED', 'Invalid email or password')
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshes += 1;
        return ok({});
      })
    );
    await expect(api.post('/auth/login', { email: 'a@b.co', password: 'x' })).rejects.toMatchObject(
      { status: 401 }
    );
    expect(refreshes).toBe(0);
  });
});
