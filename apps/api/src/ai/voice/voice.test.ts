import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { API_PREFIX, VoiceServerMessage, apiPaths } from '@library/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../../app.js';
import { COOKIES } from '../../config/constants.js';
import { signAccessToken } from '../../lib/tokens.js';
import { createV1 } from '../../modules/v1.js';
import { TEST_ORIGIN, api, serve, testAuthConfig, testModuleDeps } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createReader } from '../../test/factories.js';
import { silentLogger } from '../../test/logger.js';
import { VOICE_PATH, attachVoiceGateway } from './voiceGateway.js';

type Gateway = ReturnType<typeof attachVoiceGateway>;
const gateways: Gateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map(gateway => gateway.close()));
});

const voiceServer = async (voice: Record<string, unknown> = {}) => {
  const deps = testModuleDeps();
  const v1 = createV1({ ...deps, ai: { ...deps.ai, VOICE_PROVIDER: 'mock', ...voice } });
  const app = createApp({
    ping: async () => undefined,
    logger: silentLogger,
    corsOrigins: [TEST_ORIGIN],
    apis: [v1.api],
  });
  const server = await serve(app);
  gateways.push(
    attachVoiceGateway(server, {
      prisma: testPrisma(),
      logger: silentLogger,
      runtime: v1.ai,
      tokens: testAuthConfig,
      corsOrigins: [TEST_ORIGIN],
    })
  );
  return { server, v1 };
};

const url = (server: Server) =>
  `ws://127.0.0.1:${(server.address() as AddressInfo).port}${VOICE_PATH}`;
const cookieFor = (userId: number) =>
  `${COOKIES.access}=${signAccessToken(userId, testAuthConfig)}`;

const connect = (server: Server, headers: Record<string, string>) =>
  new Promise<{
    ws: WebSocket;
    messages: VoiceServerMessage[];
    audio: () => number;
    closed: Promise<number>;
  }>((resolve, reject) => {
    const ws = new WebSocket(url(server), { headers });
    const messages: VoiceServerMessage[] = [];
    let audio = 0;
    const closed = new Promise<number>(done => ws.on('close', code => done(code)));
    ws.on('message', (data, isBinary) => {
      if (isBinary) audio += (data as Buffer).length;
      else messages.push(VoiceServerMessage.parse(JSON.parse(String(data))));
    });
    ws.on('open', () => resolve({ ws, messages, audio: () => audio, closed }));
    ws.on('unexpected-response', (_req, res) =>
      reject(Object.assign(new Error('refused'), { status: res.statusCode }))
    );
    ws.on('error', reject);
  });
const refusedWith = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: { status?: number }) => error.status ?? null
  );

const frame = (amplitude: number) => {
  const samples = new Int16Array(512);
  for (let i = 0; i < samples.length; i++) samples[i] = i % 2 === 0 ? amplitude : -amplitude;
  return Buffer.from(samples.buffer);
};
const speak = async (ws: WebSocket) => {
  const pace = () => new Promise(resolve => setTimeout(resolve, 16));
  for (let i = 0; i < 10; i++) {
    ws.send(frame(3000));
    await pace();
  }
  for (let i = 0; i < 25; i++) {
    ws.send(frame(0));
    await pace();
  }
};
const until = async (check: () => boolean, explain: () => unknown = () => '', ms = 3000) => {
  for (let waited = 0; !check() && waited < ms; waited += 10)
    await new Promise(resolve => setTimeout(resolve, 10));
  expect(check(), JSON.stringify(explain())).toBe(true);
};

describe('voice WebSocket', () => {
  it('refuses before upgrading: no cookie 401, a foreign Origin 403, a disabled user 401, voice off 404', async () => {
    const { server } = await voiceServer();
    const reader = await createReader();
    expect(await refusedWith(connect(server, { Origin: TEST_ORIGIN }))).toBe(401);
    expect(
      await refusedWith(
        connect(server, { Origin: 'https://evil.example', Cookie: cookieFor(reader.id) })
      )
    ).toBe(403);
    expect(await refusedWith(connect(server, { Cookie: cookieFor(reader.id) }))).toBe(403);
    const disabled = await createReader();
    await testPrisma().user.update({
      where: { id: disabled.id },
      data: { disabledAt: new Date() },
    });
    expect(
      await refusedWith(connect(server, { Origin: TEST_ORIGIN, Cookie: cookieFor(disabled.id) }))
    ).toBe(401);
    const off = await voiceServer({ VOICE_PROVIDER: 'off' });
    expect(
      await refusedWith(connect(off.server, { Origin: TEST_ORIGIN, Cookie: cookieFor(reader.id) }))
    ).toBe(404);
  });

  it('one session per user (4409), a server-wide cap (4503), an hourly limit and a daily budget (4429)', async () => {
    const { server } = await voiceServer({ VOICE_MAX_SESSIONS: 2 });
    const [a, b, c] = await Promise.all([createReader(), createReader(), createReader()]);
    const headers = (id: number) => ({ Origin: TEST_ORIGIN, Cookie: cookieFor(id) });
    const first = await connect(server, headers(a.id));
    first.ws.send(JSON.stringify({ type: 'start', locale: 'en' }));
    await until(() => first.messages.some(m => m.type === 'ready'));
    const second = await connect(server, headers(a.id));
    expect(await second.closed).toBe(4409);
    const other = await connect(server, headers(b.id));
    other.ws.send(JSON.stringify({ type: 'start' }));
    await until(() => other.messages.some(m => m.type === 'ready'));
    const third = await connect(server, headers(c.id));
    expect(await third.closed).toBe(4503);
    first.ws.close();
    other.ws.close();

    const limited = await voiceServer({ VOICE_SESSIONS_PER_HOUR: 1 });
    const run = (userId: number, latencyMs: number) =>
      testPrisma().aiRun.create({
        data: {
          userId,
          feature: 'VOICE',
          provider: 'mock',
          model: 'mock-voice',
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          latencyMs,
          success: true,
        },
      });
    await run(c.id, 1000);
    expect(await (await connect(limited.server, headers(c.id))).closed).toBe(4429);
    const budget = await voiceServer({ VOICE_DAILY_SECONDS: 60 });
    const d = await createReader();
    await run(d.id, 60_000);
    const spent = await connect(budget.server, headers(d.id));
    expect(await spent.closed).toBe(4429);
    expect(spent.messages).toContainEqual({ type: 'ended', reason: 'daily-budget' });
  });

  it('a spoken request becomes transcript, tool and audio; Confirm over HTTP changes the shelf and is spoken; one AiRun', async () => {
    const genre = await createGenre();
    const hobbit = await createBook({
      title: 'The Hobbit',
      author: 'J. R. R. Tolkien',
      genreIds: [genre.id],
    });
    const reader = await createReader();
    const { server } = await voiceServer();
    const session = await connect(server, { Origin: TEST_ORIGIN, Cookie: cookieFor(reader.id) });
    session.ws.send(JSON.stringify({ type: 'start', locale: 'en' }));
    await until(
      () => session.messages.some(m => m.type === 'ready'),
      () => session.messages
    );
    await speak(session.ws);
    const final = (role: string, text: RegExp) =>
      session.messages.some(
        m => m.type === 'transcript' && m.role === role && m.stage === 'final' && text.test(m.text)
      );
    await until(
      () => final('assistant', /I found The Hobbit/),
      () => session.messages
    );
    expect(final('user', /books by tolkien/)).toBe(true);
    expect(session.messages).toContainEqual(
      expect.objectContaining({ type: 'tool', name: 'searchBooks', status: 'done' })
    );
    await until(
      () => session.messages.some(m => m.type === 'citations'),
      () => session.messages
    );
    expect(session.messages).toContainEqual({
      type: 'citations',
      citations: [{ bookId: hobbit.id, title: 'The Hobbit' }],
    });
    expect(session.audio()).toBeGreaterThan(0);

    await speak(session.ws);
    await until(
      () => session.messages.some(m => m.type === 'pending-action'),
      () => session.messages
    );
    const pending = session.messages.find(m => m.type === 'pending-action');
    if (pending?.type !== 'pending-action') throw new Error('no pending action');
    expect(await testPrisma().readingListEntry.count()).toBe(0);

    const client = await api(server).as(reader);
    const confirmed = await client
      .post(`${API_PREFIX}${apiPaths.ai.confirmAction}`)
      .send({ token: pending.action.token });
    expect(confirmed.status).toBe(200);
    expect(
      await testPrisma().readingListEntry.count({ where: { userId: reader.id, bookId: hobbit.id } })
    ).toBe(1);
    await until(() => final('assistant', /Done: it is on your reading list/));
    expect(session.messages).toContainEqual({
      type: 'action-decided',
      actionId: pending.action.id,
      status: 'confirmed',
    });

    session.ws.send(JSON.stringify({ type: 'stop' }));
    expect(await session.closed).toBe(1000);
    await until(() => session.messages.some(m => m.type === 'ended'));
    const runs = await testPrisma().aiRun.findMany({
      where: { feature: 'VOICE', userId: reader.id },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ provider: 'mock', success: true });
    expect(runs[0]!.tokensSpeechIn).toBeGreaterThan(0);
  });

  it('audio faster than twice real time is dropped, not relayed', async () => {
    const reader = await createReader();
    const { server } = await voiceServer();
    const session = await connect(server, { Origin: TEST_ORIGIN, Cookie: cookieFor(reader.id) });
    session.ws.send(JSON.stringify({ type: 'start' }));
    await until(
      () => session.messages.some(m => m.type === 'ready'),
      () => session.messages
    );
    for (let i = 0; i < 300; i++) session.ws.send(frame(0));
    await new Promise(resolve => setTimeout(resolve, 100));
    session.ws.send(JSON.stringify({ type: 'stop' }));
    await session.closed;
    const run = await testPrisma().aiRun.findFirst({
      where: { feature: 'VOICE', userId: reader.id },
    });
    expect(run!.tokensSpeechIn).toBeLessThanOrEqual(20);
  });

  it('a first frame that is not `start` closes 4400; status reports server voice only when configured', async () => {
    const { server } = await voiceServer();
    const reader = await createReader();
    const session = await connect(server, { Origin: TEST_ORIGIN, Cookie: cookieFor(reader.id) });
    session.ws.send(JSON.stringify({ type: 'confess' }));
    expect(await session.closed).toBe(4400);
    const status = await (await api(server).anonymous()).get(`${API_PREFIX}${apiPaths.ai.status}`);
    expect(status.body.data).toMatchObject({ voiceMode: 'server', features: { VOICE: true } });
    const off = await voiceServer({ VOICE_PROVIDER: 'off' });
    const offStatus = await (
      await api(off.server).anonymous()
    ).get(`${API_PREFIX}${apiPaths.ai.status}`);
    expect(offStatus.body.data).toMatchObject({ voiceMode: 'off', features: { VOICE: false } });
  });
});
