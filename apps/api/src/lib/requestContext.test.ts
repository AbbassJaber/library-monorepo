import { API_PREFIX, HEADERS } from '@library/contracts';
import request from 'supertest';
import { serve } from '../test/client.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app.js';
import { silentLogger } from '../test/logger.js';
import { getRequestContext } from './requestContext.js';
import { mountApi } from './apiMount.js';
import { createModuleRouter } from './route.js';

describe('request context', () => {
  it('exposes the request id to code that has no access to req/res', async () => {
    const mod = createModuleRouter('/ctx', { publicOnly: true });
    mod.define(
      {
        method: 'get',
        path: '/',
        access: 'public',
        response: z.object({ id: z.string() }),
        summary: 'ctx',
      },
      async () => ({ id: getRequestContext()?.requestId ?? 'none' })
    );
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [mountApi(API_PREFIX, [mod])],
    });
    const res = await request(await serve(app))
      .get('/api/v1/ctx')
      .set(HEADERS.requestId, 'ctx-42');
    expect(res.body.data.id).toBe('ctx-42');
  });
});
