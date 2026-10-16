import { API_PREFIX, apiPaths, ChatLocale } from '@library/contracts';
import { ProviderUnavailableError, createMockProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { api, createTestV1, serve } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createLibrarian, createReader } from '../../test/factories.js';
import { silentLogger } from '../../test/logger.js';

const chatPath = `${API_PREFIX}${apiPaths.ai.chat}`;
const confirmPath = `${API_PREFIX}${apiPaths.ai.confirmAction}`;
const cancelPath = `${API_PREFIX}${apiPaths.ai.cancelAction}`;

const say = (content: string, locale: 'en' | 'fr' = ChatLocale.enum.en) => ({
  messages: [{ role: 'user', content }],
  locale,
});

const catalog = async () => {
  const genre = await createGenre({ name: 'Science Fiction', slug: 'science-fiction' });
  const dune = await createBook({ title: 'Dune', author: 'Frank Herbert', genreIds: [genre.id] });
  const hobbit = await createBook({
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    genreIds: [genre.id],
  });
  return { dune, hobbit };
};

describe('POST /ai/chat', () => {
  it('answers with citations to the books the tools found, and traces the turn', async () => {
    const { hobbit } = await catalog();
    const reader = await createReader();
    const res = await (await api().as(reader)).post(chatPath).send(say('books by tolkien'));
    expect(res.status).toBe(200);
    expect(res.body.data.message.citations).toEqual([{ bookId: hobbit.id, title: 'The Hobbit' }]);
    expect(res.body.data.pendingAction).toBeUndefined();
    expect(res.body.meta.ai).toMatchObject({ feature: 'AGENT_CHAT', provider: 'mock' });
    expect(await testPrisma().aiRun.findFirst({ where: { feature: 'AGENT_CHAT' } })).toMatchObject({
      userId: reader.id,
      success: true,
    });
  });

  it('a mutating tool call comes back as a pending action; nothing is written until it is confirmed', async () => {
    const { dune } = await catalog();
    const reader = await createReader();
    const client = await api().as(reader);
    const res = await client.post(chatPath).send(say('add dune to my reading list'));
    expect(res.status).toBe(200);
    const action = res.body.data.pendingAction;
    expect(action).toMatchObject({ tool: 'addToReadingList', input: { bookId: dune.id } });
    expect(await testPrisma().readingListEntry.count()).toBe(0);

    const confirmed = await client.post(confirmPath).send({ token: action.token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ status: 'confirmed', tool: 'addToReadingList' });
    expect(
      await testPrisma().readingListEntry.count({ where: { userId: reader.id, bookId: dune.id } })
    ).toBe(1);

    const replay = await client.post(confirmPath).send({ token: action.token });
    expect(replay.status).toBe(409);
    expect(await testPrisma().readingListEntry.count()).toBe(1);
  });

  it('a removal from the shelf is proposed, then done on confirm (the entry is soft-removed)', async () => {
    const { dune } = await catalog();
    const reader = await createReader();
    const client = await api().as(reader);
    expect(
      (await client.post(`${API_PREFIX}${apiPaths.readingList.list}`).send({ bookId: dune.id }))
        .status
    ).toBe(201);
    const res = await client.post(chatPath).send(say('remove dune from my reading list'));
    const action = res.body.data.pendingAction;
    expect(action).toMatchObject({ tool: 'removeFromReadingList', input: { bookId: dune.id } });
    expect(action.summary).toBe('Remove “Dune” from your reading list');
    expect(await testPrisma().readingListEntry.count({ where: { removedAt: null } })).toBe(1);
    expect((await client.post(confirmPath).send({ token: action.token })).status).toBe(200);
    expect(await testPrisma().readingListEntry.count({ where: { removedAt: null } })).toBe(0);
    expect(await testPrisma().readingListEntry.count()).toBe(1);
  });

  it('"remove every book" is one batch card; concurrent confirms apply it once, all together', async () => {
    const { dune, hobbit } = await catalog();
    const reader = await createReader();
    const client = await api().as(reader);
    for (const book of [dune, hobbit])
      await client.post(`${API_PREFIX}${apiPaths.readingList.list}`).send({ bookId: book.id });
    const res = await client.post(chatPath).send(say('remove every book from my reading list'));
    const action = res.body.data.pendingAction;
    expect(action.tool).toBe('changeReadingList');
    expect(action.input.changes.map((c: { bookId: number }) => c.bookId).sort()).toEqual(
      [dune.id, hobbit.id].sort()
    );
    expect(action.summary).toMatch(/^Remove 2 books from your reading list/);
    expect(await testPrisma().readingListEntry.count({ where: { removedAt: null } })).toBe(2);
    const results = await Promise.all(
      [1, 2, 3].map(() => client.post(confirmPath).send({ token: action.token }))
    );
    expect(results.map(r => r.status).sort()).toEqual([200, 409, 409]);
    expect(await testPrisma().readingListEntry.count({ where: { removedAt: null } })).toBe(0);
    const many = await client.post(chatPath).send(say('add every book in the catalog to my list'));
    expect(many.body.data.pendingAction).toBeUndefined();
  });

  it('concurrent confirms of one action execute it once', async () => {
    await catalog();
    const reader = await createReader();
    const client = await api().as(reader);
    const { body } = await client.post(chatPath).send(say('add dune to my reading list'));
    const token = body.data.pendingAction.token as string;
    const results = await Promise.all(
      [1, 2, 3].map(() => client.post(confirmPath).send({ token }))
    );
    expect(results.map(r => r.status).sort()).toEqual([200, 409, 409]);
    expect(await testPrisma().readingListEntry.count()).toBe(1);
  });

  it('confirm-token tampering is 401, another user is 403, a cancelled action cannot be confirmed', async () => {
    await catalog();
    const reader = await createReader();
    const client = await api().as(reader);
    const { body } = await client.post(chatPath).send(say('add dune to my reading list'));
    const token = body.data.pendingAction.token as string;
    const [payload, signature] = token.split('.');
    const tampered = `${payload}x.${signature}`;
    expect((await client.post(confirmPath).send({ token: tampered })).status).toBe(401);
    const other = await api().as(await createReader());
    expect((await other.post(confirmPath).send({ token })).status).toBe(403);
    expect((await client.post(cancelPath).send({ token })).status).toBe(200);
    expect((await client.post(confirmPath).send({ token })).status).toBe(409);
    expect(await testPrisma().readingListEntry.count()).toBe(0);
  });

  it('readers are refused draftBook through the agent; librarians get the tool', async () => {
    await catalog();
    const readerRes = await (
      await api().as(await createReader())
    )
      .post(chatPath)
      .send(say('draft a book from isbn 9780441172719'));
    expect(readerRes.status).toBe(200);
    expect(readerRes.body.data.message.toolCalls ?? []).not.toContainEqual(
      expect.objectContaining({ name: 'draftBook', ok: true })
    );
    const librarianRes = await (
      await api().as(await createLibrarian())
    )
      .post(chatPath)
      .send(say('draft a book from isbn 9780441172719'));
    expect(librarianRes.body.data.message.toolCalls).toContainEqual(
      expect.objectContaining({ name: 'draftBook', ok: true })
    );
  });

  it("a book context reaches the model as data, loaded with the reader's permissions", async () => {
    const { dune } = await catalog();
    const v1 = createTestV1();
    const systems: string[] = [];
    const mock = createMockProvider();
    Object.assign(v1.ai, {
      llm: {
        ...mock,
        tiers: mock.tiers,
        generate: (request: Parameters<typeof mock.generate>[0]) => {
          systems.push(request.system.map(block => block.text).join('\n'));
          return mock.generate(request);
        },
      },
    });
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [v1.api],
    });
    const client = await api(serve(app)).as(await createReader());
    const ok = await client
      .post(chatPath)
      .send({ ...say('is it long?'), context: { bookId: dune.id } });
    expect(ok.status).toBe(200);
    expect(systems.at(-1)).toContain('<data name="current_book">');
    expect(systems.at(-1)).toContain('"title":"Dune"');

    const unknown = await client
      .post(chatPath)
      .send({ ...say('is it long?'), context: { bookId: 999_999 } });
    expect(unknown.status).toBe(200);
    expect(systems.at(-1)).not.toContain('current_book');
    expect(
      (await client.post(chatPath).send({ ...say('x'), context: { title: 'Dune' } })).status
    ).toBe(400);
  });

  it('validates the body and answers 503 AI_UNAVAILABLE when the model is down', async () => {
    const client = await api().as(await createReader());
    expect((await client.post(chatPath).send({ messages: [] })).status).toBe(400);
    expect((await client.post(chatPath).send({ ...say('x'), mode: 'admin' })).status).toBe(400);
    const v1 = createTestV1();
    const down = createMockProvider();
    Object.assign(v1.ai, {
      llm: {
        ...down,
        tiers: down.tiers,
        generate: () => Promise.reject(new ProviderUnavailableError('down')),
      },
    });
    const app = createApp({
      ping: async () => undefined,
      logger: silentLogger,
      apis: [v1.api],
    });
    const res = await (
      await api(serve(app)).as(await createReader())
    )
      .post(chatPath)
      .send(say('hello'));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });
});
