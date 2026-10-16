import request from 'supertest';
import { serve } from '../test/client.js';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { silentLogger } from '../test/logger.js';

describe('rate limiting', () => {
  it('answers 429 RATE_LIMITED in the error envelope once the window is exhausted', async () => {
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      rateLimit: { windowMs: 60_000, max: 2 },
    });
    await request(await serve(app)).get('/api/v1/anything');
    await request(await serve(app)).get('/api/v1/anything');
    const res = await request(await serve(app)).get('/api/v1/anything');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined();
  });

  it('applies the credential limiter to login and register but not to /auth/me', async () => {
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      authRateLimit: { windowMs: 60_000, max: 1 },
    });
    await request(await serve(app))
      .post('/api/v1/auth/login')
      .send({});
    expect(
      (
        await request(await serve(app))
          .post('/api/v1/auth/login')
          .send({})
      ).status
    ).toBe(429);
    expect(
      (
        await request(await serve(app))
          .post('/api/v1/auth/register')
          .send({})
      ).status
    ).toBe(429);
    expect((await request(await serve(app)).get('/api/v1/auth/me')).status).not.toBe(429);
  });

  it('applies the AI limiter to model-calling routes but never to /ai/status or /ai/runs', async () => {
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      aiRateLimit: { windowMs: 60_000, max: 1 },
    });
    const server = await serve(app);
    for (let i = 0; i < 3; i++)
      expect((await request(server).get('/api/v1/ai/status')).status).not.toBe(429);
    expect((await request(server).get('/api/v1/ai/runs')).status).not.toBe(429);
    await request(server).post('/api/v1/ai/search/parse').send({});
    expect((await request(server).post('/api/v1/ai/search/parse').send({})).status).toBe(429);
  });

  it('never limits the liveness probe', async () => {
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      rateLimit: { windowMs: 60_000, max: 1 },
    });
    await request(await serve(app)).get('/health');
    const res = await request(await serve(app)).get('/health');
    expect(res.status).toBe(200);
  });
});
