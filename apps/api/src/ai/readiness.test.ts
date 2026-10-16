import { API_PREFIX, SERVICE_PATHS, apiPaths } from '@library/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { runSeed } from '../../prisma/seed.js';
import { createApp } from '../app.js';
import { api, createTestV1, serve } from '../test/client.js';
import { testPrisma } from '../test/db.js';
import { testDatabaseUrl } from '../test/env.js';
import { createReader } from '../test/factories.js';
import { silentLogger } from '../test/logger.js';
import { createReadiness } from './readiness.js';

const searchPath = `${API_PREFIX}${apiPaths.ai.search}`;

const runningApi = async () => {
  const v1 = createTestV1();
  const server = await serve(
    createApp({
      ping: async () => {
        await testPrisma().$queryRaw`SELECT 1`;
      },
      readiness: createReadiness({
        prisma: testPrisma(),
        sync: v1.embeddingSync,
        embeddings: v1.ai.embeddings,
        logger: silentLogger,
      }),
      logger: silentLogger,
      apis: [v1.api],
    })
  );
  return server;
};

const pollReady = async (server: Awaited<ReturnType<typeof runningApi>>) => {
  for (let i = 0; i < 100; i++) {
    const res = await request(server).get(SERVICE_PATHS.ready);
    if (res.status === 200) return res;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('/ready never turned 200');
};

describe('readiness waits for the embeddings', () => {
  it('a reseed under a running API makes /ready 503 with a reason until the vectors match, then semantic search works', async () => {
    const server = await runningApi();
    await runSeed(testDatabaseUrl(), 'always', { bcryptRounds: 4 });
    const active = await testPrisma().book.count({ where: { archivedAt: null } });
    expect(active).toBeGreaterThan(100);

    const pending = await request(server).get(SERVICE_PATHS.ready);
    expect(pending.status).toBe(503);
    expect(pending.body.error).toMatchObject({
      code: 'NOT_READY',
      details: { reason: 'embeddings_pending', missing: active },
    });
    await pollReady(server);

    await runSeed(testDatabaseUrl(), 'always', { bcryptRounds: 4 });
    const again = await request(server).get(SERVICE_PATHS.ready);
    expect(again.status).toBe(503);
    expect(again.body.error.details.reason).toBe('embeddings_pending');
    const ready = await pollReady(server);
    expect(ready.body.data).toEqual({ status: 'ready', database: 'up', embeddings: 'current' });
    expect(await testPrisma().bookEmbedding.count()).toBe(active);

    const dune = await testPrisma().book.findFirstOrThrow({ where: { title: 'Dune' } });
    const reader = await api(Promise.resolve(server)).as(await createReader());
    const res = await reader
      .get(searchPath)
      .query({ q: 'a young heir survives betrayal in the deep desert', limit: 5 });
    expect(res.status).toBe(200);
    const hit = (
      res.body.data.items as Array<{ book: { id: number }; scores: { semantic: number | null } }>
    ).find(item => item.book.id === dune.id);
    expect(hit?.scores.semantic).toEqual(expect.any(Number));
  }, 60_000);
});
