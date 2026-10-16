import { API_PREFIX, apiPaths } from '@library/contracts';
import { ProviderUnavailableError, createMockProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { api, createTestV1, serve } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createGenre, createLibrarian, createReader } from '../../test/factories.js';
import { silentLogger } from '../../test/logger.js';

const autofillPath = `${API_PREFIX}${apiPaths.ai.autofill}`;
const DUNE_ISBN = '9780441013593';

describe('POST /ai/books/autofill', () => {
  it('drafts from the fixture lookup with sources, maps genres to live ids, and saves nothing', async () => {
    const scifi = await createGenre({ name: 'Science Fiction', slug: 'science-fiction' });
    await createGenre({ name: 'Fantasy', slug: 'fantasy' });
    const librarian = await createLibrarian();
    const booksBefore = await testPrisma().book.count();
    const res = await (await api().as(librarian)).post(autofillPath).send({ isbn: DUNE_ISBN });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: { value: 'Dune', source: 'lookup' },
      author: { value: 'Frank Herbert', source: 'lookup' },
      publishedYear: { value: 1965, source: 'lookup' },
      synopsis: { value: 'Paul Atreides on Arrakis.', source: 'lookup' },
      isbn: { value: DUNE_ISBN, source: 'lookup' },
      genreIds: { value: [scifi.id], source: 'model' },
      lookupSource: 'fixture',
    });
    expect(res.body.meta).toMatchObject({
      ai: { feature: 'AUTOFILL', provider: 'mock', fallbackUsed: false },
      lookupHit: true,
      aiUnavailable: false,
    });
    expect(await testPrisma().book.count()).toBe(booksBefore);
    expect(await testPrisma().aiRun.findFirst()).toMatchObject({
      feature: 'AUTOFILL',
      userId: librarian.id,
      success: true,
    });
  });

  it('readers get 403', async () => {
    const res = await (
      await api().as(await createReader())
    )
      .post(autofillPath)
      .send({ isbn: DUNE_ISBN });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await testPrisma().aiRun.count()).toBe(0);
  });

  it('needs an ISBN or a title, and rejects unknown keys', async () => {
    const client = await api().as(await createLibrarian());
    expect((await client.post(autofillPath).send({ author: 'Herbert' })).status).toBe(400);
    expect((await client.post(autofillPath).send({ isbn: 'not-an-isbn' })).status).toBe(400);
    expect((await client.post(autofillPath).send({ title: 'Dune', genreIds: [1] })).status).toBe(
      400
    );
  });

  it('an unknown ISBN alone returns an empty draft without a model call', async () => {
    const res = await (
      await api().as(await createLibrarian())
    )
      .post(autofillPath)
      .send({ isbn: '9780000000002' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toEqual({ value: null, source: 'empty', confidence: 0 });
    expect(res.body.data.isbn).toMatchObject({ value: '9780000000002', source: 'input' });
    expect(res.body.meta).toMatchObject({ ai: null, lookupHit: false });
    expect(await testPrisma().aiRun.count()).toBe(0);
  });

  it('still returns the lookup draft, flagged, when the provider is down', async () => {
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
    const res = await (
      await api(serve(app)).as(await createLibrarian())
    )
      .post(autofillPath)
      .send({ isbn: DUNE_ISBN });
    expect(res.status).toBe(200);
    expect(res.body.data.title.value).toBe('Dune');
    expect(res.body.data.genreIds.source).toBe('empty');
    expect(res.body.meta).toMatchObject({ ai: null, aiUnavailable: true });
    expect(await testPrisma().aiRun.findFirst()).toMatchObject({
      success: false,
      errorCode: 'AI_UNAVAILABLE',
    });
  });
});
