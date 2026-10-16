import { API_PREFIX, apiPaths } from '@library/contracts';
import { ProviderUnavailableError, createMockProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { api, createTestV1, serve } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createReader } from '../../test/factories.js';
import { silentLogger } from '../../test/logger.js';

const path = `${API_PREFIX}${apiPaths.ai.recommendations}`;

const library = async () => {
  const fantasy = await createGenre({ name: 'Fantasy', slug: 'fantasy' });
  const hobbit = await createBook({ title: 'The Hobbit', genreIds: [fantasy.id] });
  const fellowship = await createBook({
    title: 'The Fellowship of the Ring',
    genreIds: [fantasy.id],
  });
  return { fantasy, hobbit, fellowship };
};

describe('GET /ai/recommendations', () => {
  it('explains each pick with the reader’s own entries, never a book on the shelf; traced', async () => {
    const { fantasy, hobbit, fellowship } = await library();
    const reader = await createReader();
    const client = await api().as(reader);
    await client.put(`${API_PREFIX}${apiPaths.favoriteGenres}`).send({ genreIds: [fantasy.id] });
    const entry = await client
      .post(`${API_PREFIX}${apiPaths.readingList.list}`)
      .send({ bookId: hobbit.id, state: 'FINISHED' });
    const res = await client.get(`${path}?locale=en`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        book: expect.objectContaining({ id: fellowship.id }),
        citedEntryIds: [entry.body.data.id],
        citedBooks: [{ bookId: hobbit.id, title: 'The Hobbit' }],
        explanation: 'Fantasy, like The Hobbit on your list.',
      }),
    ]);
    expect(res.body.meta).toMatchObject({
      reason: 'ok',
      ai: { feature: 'RECOMMEND', provider: 'mock' },
    });
    expect(
      await testPrisma().aiRun.count({ where: { feature: 'RECOMMEND', userId: reader.id } })
    ).toBe(1);
  });

  it('an empty shelf answers [] with reason no-history and no model call', async () => {
    await library();
    const reader = await createReader();
    const res = await (await api().as(reader)).get(path);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], meta: { reason: 'no-history' } });
    expect(await testPrisma().aiRun.count({ where: { feature: 'RECOMMEND' } })).toBe(0);
  });

  it('a provider outage is 503 AI_UNAVAILABLE (the page falls back to the plain list)', async () => {
    const { fantasy, hobbit } = await library();
    const reader = await createReader();
    const v1 = createTestV1();
    const down = createMockProvider();
    Object.assign(v1.ai, {
      llm: {
        ...down,
        tiers: down.tiers,
        generate: () => Promise.reject(new ProviderUnavailableError('down')),
      },
    });
    const server = serve(
      createApp({ ping: async () => undefined, logger: silentLogger, apis: [v1.api] })
    );
    const client = await api(server).as(reader);
    await client.put(`${API_PREFIX}${apiPaths.favoriteGenres}`).send({ genreIds: [fantasy.id] });
    await client.post(`${API_PREFIX}${apiPaths.readingList.list}`).send({ bookId: hobbit.id });
    const res = await client.get(path);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });
});
