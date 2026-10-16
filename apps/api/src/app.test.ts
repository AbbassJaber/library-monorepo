import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_PREFIX, API_ROOT, HEADERS, SERVICE_PATHS } from '@library/contracts';
import request from 'supertest';
import { serve } from './test/client.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app.js';
import { mountApi } from './lib/apiMount.js';
import { createModuleRouter } from './lib/route.js';
import type { AppDeps } from './app.js';

const deps = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  ping: async () => undefined,
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  ...overrides,
});

describe('GET /health', () => {
  it('answers 200 with the service name and never touches the database', async () => {
    const app = createApp(
      deps({
        ping: async () => {
          throw new Error('db down');
        },
      })
    );
    const res = await request(await serve(app)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', service: 'library-api' });
  });
});

describe('GET /ready', () => {
  it('answers 200 when the database is reachable', async () => {
    const res = await request(await serve(createApp(deps()))).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', database: 'up', embeddings: 'not-checked' });
  });

  it('answers 503 when the database ping fails', async () => {
    const res = await request(
      await serve(
        createApp(
          deps({
            ping: async () => {
              throw new Error('connection refused');
            },
          })
        )
      )
    ).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});

describe('envelope and errors', () => {
  it('returns a 404 error envelope with a request id for unknown routes', async () => {
    const res = await request(await serve(createApp(deps()))).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.headers[HEADERS.requestId]).toBe(res.body.error.requestId);
  });

  it('echoes a caller-provided X-Request-Id', async () => {
    const res = await request(await serve(createApp(deps())))
      .get('/health')
      .set(HEADERS.requestId, 'abc-123');
    expect(res.headers[HEADERS.requestId]).toBe('abc-123');
  });
});

describe('defineRoute', () => {
  const buildApp = () => {
    const mod = createModuleRouter('/demo', { publicOnly: true });
    mod.define(
      {
        method: 'get',
        path: '/items/:id',
        access: 'public',
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ verbose: z.enum(['true', 'false']).default('false') }),
        response: z.object({ id: z.number(), name: z.string() }),
        summary: 'Demo item',
      },
      async ({ params, query }) => ({
        id: params.id,
        name: query.verbose === 'true' ? 'verbose item' : 'item',
        passwordHash: 'must-never-leak',
      })
    );
    return createApp(deps({ apis: [mountApi(API_PREFIX, [mod])] }));
  };

  it('parses params and query and strips undeclared response fields', async () => {
    const res = await request(await serve(buildApp())).get('/api/v1/demo/items/7?verbose=true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 7, name: 'verbose item' } });
  });

  it('rejects invalid input with 400 VALIDATION_ERROR and field-level issues', async () => {
    const res = await request(await serve(buildApp())).get('/api/v1/demo/items/abc?verbose=maybe');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['params.id', 'query.verbose']));
  });

  it('registers the route for the OpenAPI document with its path under the version', () => {
    const mod = createModuleRouter('/demo', { publicOnly: true });
    mod.define(
      {
        method: 'get',
        path: '/ping',
        access: 'public',
        response: z.object({ ok: z.boolean() }),
        summary: 'Ping',
      },
      async () => ({ ok: true })
    );
    expect(mod.registry.map(entry => `${entry.method.toUpperCase()} ${entry.path}`)).toEqual([
      'GET /demo/ping',
    ]);
  });
});

describe('API versions', () => {
  const V2_PREFIX = `${API_ROOT}/v2`;
  const ping = () => {
    const mod = createModuleRouter('/ping', { publicOnly: true });
    mod.define(
      {
        method: 'get',
        path: '/',
        access: 'public',
        response: z.object({ ok: z.boolean() }),
        summary: 'Ping',
      },
      async () => ({ ok: true })
    );
    return mod;
  };
  const greeting = (response: z.ZodType) => {
    const mod = createModuleRouter('/greeting', { publicOnly: true });
    mod.define(
      { method: 'get', path: '/', access: 'public', response, summary: 'Greeting' },
      async () => ({ text: 'hello', language: 'en' })
    );
    return mod;
  };
  const buildApp = () => {
    const shared = ping();
    return createApp(
      deps({
        apis: [
          mountApi(API_PREFIX, [shared, greeting(z.object({ text: z.string() }))]),
          mountApi(V2_PREFIX, [
            shared,
            greeting(z.object({ text: z.string(), language: z.string() })),
          ]),
        ],
      })
    );
  };

  it('serves both versions side by side, each with its own contract', async () => {
    const server = await serve(buildApp());
    expect((await request(server).get(`${API_PREFIX}/ping`)).body).toEqual({ data: { ok: true } });
    expect((await request(server).get(`${V2_PREFIX}/ping`)).body).toEqual({ data: { ok: true } });
    expect((await request(server).get(`${API_PREFIX}/greeting`)).body).toEqual({
      data: { text: 'hello' },
    });
    expect((await request(server).get(`${V2_PREFIX}/greeting`)).body).toEqual({
      data: { text: 'hello', language: 'en' },
    });
  });

  it('documents every version in one OpenAPI document', async () => {
    const res = await request(await serve(buildApp())).get('/api/docs.json');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        `${API_PREFIX}/ping`,
        `${API_PREFIX}/greeting`,
        `${V2_PREFIX}/ping`,
        `${V2_PREFIX}/greeting`,
      ])
    );
    const ids = Object.values(
      res.body.paths as Record<string, { get: { operationId: string } }>
    ).map(path => path.get.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('serving the web app (one service: WEB_DIST_DIR)', () => {
  const root = mkdtempSync(join(tmpdir(), 'web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Library</title>');
  writeFileSync(join(root, 'assets', 'app-1234.js'), 'console.log(1)');
  writeFileSync(join(root, 'robots.txt'), 'User-agent: *');
  const app = () => createApp(deps({ webRoot: root }));

  it('serves the page for the root and for any client route', async () => {
    const server = await serve(app());
    for (const path of ['/', '/catalog', '/books/12']) {
      const res = await request(server).get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toContain('<title>Library</title>');
      expect(res.headers['cache-control'], path).toBe('no-cache');
    }
  });

  it('serves hashed assets as immutable, and a missing asset as 404, never the page', async () => {
    const server = await serve(app());
    const asset = await request(server).get('/assets/app-1234.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const missing = await request(server).get('/assets/gone-9999.js');
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain('<title>Library</title>');
    expect((await request(server).get('/robots.txt')).text).toBe('User-agent: *');
  });

  it('leaves the API, its 404s and the probes alone', async () => {
    const server = await serve(app());
    const unknown = await request(server).get(`${API_PREFIX}/nothing-here`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect((await request(server).get(SERVICE_PATHS.health)).status).toBe(200);
    expect((await request(server).post('/catalog')).status).toBe(404);
  });

  it('serves nothing extra when WEB_DIST_DIR is not set', async () => {
    expect((await request(await serve(createApp(deps()))).get('/catalog')).status).toBe(404);
  });
});
