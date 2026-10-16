import { API_PREFIX, apiPaths } from '@library/contracts';
import { ProviderUnavailableError, createMockProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { api, createTestV1, serve } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createGenre, createReader } from '../../test/factories.js';
import { createApp } from '../../app.js';
import { silentLogger } from '../../test/logger.js';

const parsePath = `${API_PREFIX}${apiPaths.ai.parseSearch}`;

describe('POST /ai/search/parse', () => {
  it('returns a validated BooksQuery with chips and meta.ai, and traces the run', async () => {
    await createGenre({ name: 'Fantasy', slug: 'fantasy' });
    const reader = await createReader();
    const res = await (
      await api().as(reader)
    )
      .post(parsePath)
      .send({ text: 'fantasy from the 90s sorted by rating' });
    expect(res.status).toBe(200);
    expect(res.body.data.query).toMatchObject({
      genre: ['fantasy'],
      yearFrom: 1990,
      yearTo: 1999,
      sort: 'rating',
    });
    expect(res.body.data.chips.map((c: { key: string }) => c.key)).toEqual([
      'genre',
      'yearFrom',
      'yearTo',
      'sort',
    ]);
    expect(res.body.meta.ai).toMatchObject({
      feature: 'NL_SEARCH',
      provider: 'mock',
      model: 'mock-small',
      fallbackUsed: false,
      runId: expect.any(Number) as number,
    });
    const runs = await testPrisma().aiRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ feature: 'NL_SEARCH', userId: reader.id, success: true });
  });

  it('rejects an empty or oversized text with field issues, and anonymous callers', async () => {
    const client = await api().as(await createReader());
    expect((await client.post(parsePath).send({ text: '' })).status).toBe(400);
    expect((await client.post(parsePath).send({ text: 'x'.repeat(301) })).status).toBe(400);
    expect((await client.post(parsePath).send({ text: 'ok', extra: 1 })).status).toBe(400);
    expect((await (await api().anonymous()).post(parsePath).send({ text: 'dune' })).status).toBe(
      401
    );
  });

  it('answers 503 AI_UNAVAILABLE when the provider is down, and the run is traced as failed', async () => {
    const v1 = createTestV1();
    const down = createMockProvider();
    Object.assign(v1.ai, {
      llm: {
        ...down,
        tiers: down.tiers,
        generate: async () => {
          throw new ProviderUnavailableError('connect ECONNREFUSED');
        },
      },
    });
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [v1.api],
    });
    const reader = await createReader();
    const res = await (await api(serve(app)).as(reader)).post(parsePath).send({ text: 'dune' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    expect(await testPrisma().aiRun.findFirst()).toMatchObject({
      success: false,
      errorCode: 'AI_UNAVAILABLE',
    });
  });
});
