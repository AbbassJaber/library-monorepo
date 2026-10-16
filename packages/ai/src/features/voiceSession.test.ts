import {
  VoiceProviderName,
  ChatLocale,
  ReadingState,
  PendingActionStatus,
  type VoiceServerMessage,
} from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { createQueue } from '../providers/voice/types.js';
import type {
  VoiceProvider,
  VoiceProviderEvent,
  VoiceSessionConfig,
} from '../providers/voice/types.js';
import { book, createFakePorts, createFakeState, librarian, reader } from '../testing/index.js';
import { catalogTools } from '../tools/catalogTools.js';
import { createToolRegistry } from '../tools/registry.js';
import { VOICE_GREETING_CUE, startVoiceSession } from './voiceSession.js';

const SECRET = 'test-confirm-secret-test-confirm';
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

const fakeVoice = () => {
  const sent = {
    audio: [] as Uint8Array[],
    toolResults: [] as Array<{ toolUseId: string; result: Record<string, unknown> }>,
    texts: [] as string[],
    closed: false,
  };
  const events = createQueue<VoiceProviderEvent>();
  let config: VoiceSessionConfig | undefined;
  const provider: VoiceProvider = {
    name: VoiceProviderName.enum['nova-sonic'],
    model: 'amazon.nova-2-sonic-v1:0',
    region: 'eu-north-1',
    async open(c) {
      config = c;
      return {
        sendAudio: pcm => sent.audio.push(pcm),
        sendToolResult: (toolUseId, result) => sent.toolResults.push({ toolUseId, result }),
        sendText: text => sent.texts.push(text),
        async close() {
          sent.closed = true;
          events.end();
        },
        events,
      };
    },
  };
  return {
    provider,
    sent,
    emit: (event: VoiceProviderEvent) => events.push(event),
    config: () => config!,
  };
};

const setup = (
  options: {
    actor?: typeof reader;
    maxSeconds?: number;
    idleSeconds?: number;
    greet?: boolean;
  } = {}
) => {
  const state = createFakeState({
    books: [
      book(1, { title: 'The Hobbit', author: 'J. R. R. Tolkien' }),
      book(12, { title: 'Dune', author: 'Frank Herbert' }),
    ],
  });
  const ports = createFakePorts(state);
  const voice = fakeVoice();
  const messages: VoiceServerMessage[] = [];
  const audioOut: Uint8Array[] = [];
  const start = () =>
    startVoiceSession(
      {
        voice: voice.provider,
        ports,
        registry: createToolRegistry(catalogTools),
        confirmSecret: SECRET,
        voiceId: 'tiffany',
        limits: { maxSeconds: options.maxSeconds ?? 60, idleSeconds: options.idleSeconds ?? 60 },
      },
      { actor: options.actor ?? reader, requestId: 'r' },
      { sessionId: 's-1', locale: ChatLocale.enum.en, ...(options.greet ? { greet: true } : {}) },
      { send: message => messages.push(message), audio: pcm => audioOut.push(pcm) }
    );
  return { state, ports, voice, messages, audioOut, start };
};

describe('voice session', () => {
  it('opens with the registry tools for the role and the locale prompt, then says ready', async () => {
    const { voice, messages, start } = setup();
    const session = await start();
    expect(voice.config().tools.map(t => t.name)).not.toContain('draftBook');
    expect(voice.config().voiceId).toBe('tiffany');
    expect(voice.config().system).toContain('[app]');
    expect(voice.config().system).toContain(
      'never ask for confirmation in speech before proposing a change'
    );
    expect(messages[0]).toEqual({ type: 'ready', sessionId: 's-1', maxSeconds: 60 });
    await session.stop();
    const lib = setup({ actor: librarian });
    await (await lib.start()).stop();
    expect(lib.voice.config().tools.map(t => t.name)).toContain('draftBook');
  });

  it('speaks first only when asked: one greeting cue after ready, nothing otherwise', async () => {
    const quiet = setup();
    await (await quiet.start()).stop();
    expect(quiet.voice.sent.texts).toEqual([]);
    const greeting = setup({ greet: true });
    const session = await greeting.start();
    expect(greeting.messages[0]?.type).toBe('ready');
    expect(greeting.voice.sent.texts).toEqual([VOICE_GREETING_CUE]);
    expect(VOICE_GREETING_CUE.startsWith('[app]')).toBe(true);
    await session.stop();
  });

  it('relays microphone frames to the model and model audio to the browser', async () => {
    const { voice, audioOut, start } = setup();
    const session = await start();
    session.audio(new Uint8Array([1, 2]));
    voice.emit({ type: 'audio', contentId: 'a', pcm: new Uint8Array([7, 7]) });
    await tick();
    expect(voice.sent.audio).toEqual([new Uint8Array([1, 2])]);
    expect(audioOut).toEqual([new Uint8Array([7, 7])]);
    await session.stop();
  });

  it('every toolUse gets a result under its toolUseId, an object, including when the tool fails', async () => {
    const { voice, messages, start } = setup();
    const session = await start();
    voice.emit({ type: 'toolUse', toolUseId: 'u1', name: 'searchBooks', input: { q: 'dune' } });
    voice.emit({ type: 'toolUse', toolUseId: 'u2', name: 'getBook', input: { bookId: 999 } });
    voice.emit({
      type: 'toolUse',
      toolUseId: 'u3',
      name: 'draftBook',
      input: { isbn: '9780441172719' },
    });
    await tick(20);
    const byId = Object.fromEntries(voice.sent.toolResults.map(r => [r.toolUseId, r.result]));
    expect(byId['u1']).toEqual({
      books: [{ id: 12, title: 'Dune', author: 'Frank Herbert', year: expect.any(Number) }],
    });
    expect(byId['u2']).toMatchObject({ error: 'FAILED' });
    expect(byId['u3']).toMatchObject({ error: 'FORBIDDEN' });
    const lib = setup({ actor: librarian });
    const libSession = await lib.start();
    lib.voice.emit({
      type: 'toolUse',
      toolUseId: 'u4',
      name: 'draftBook',
      input: { isbn: '978044117271' },
    });
    await tick(20);
    expect(lib.voice.sent.toolResults[0]?.result).toMatchObject({
      error: 'INVALID_ISBN',
      isbn: '978044117271',
      next: expect.stringMatching(/repeat the ISBN.*search the catalog by title/i),
    });
    await libSession.stop();
    expect(
      messages.filter(m => m.type === 'tool').map(m => m.type === 'tool' && `${m.name}:${m.status}`)
    ).toEqual(
      expect.arrayContaining([
        'searchBooks:running',
        'searchBooks:done',
        'getBook:error',
        'draftBook:error',
      ])
    );
    await session.stop();
  });

  it('a mutating tool becomes a pending action on screen; nothing is written by voice', async () => {
    const { voice, messages, state, start } = setup();
    const session = await start();
    voice.emit({ type: 'toolUse', toolUseId: 'u1', name: 'searchBooks', input: { q: 'dune' } });
    voice.emit({
      type: 'toolUse',
      toolUseId: 'u2',
      name: 'addToReadingList',
      input: { bookId: 12 },
    });
    await tick(20);
    expect(voice.sent.toolResults.find(r => r.toolUseId === 'u2')?.result).toMatchObject({
      status: 'pending_confirmation',
      summary: expect.stringContaining('Dune'),
    });
    const pending = messages.find(m => m.type === 'pending-action');
    expect(pending).toMatchObject({ action: { tool: 'addToReadingList', input: { bookId: 12 } } });
    expect(state.shelf.get(reader.id) ?? []).toEqual([]);
    await session.stop();
  });

  it('reads the reading list compactly, and a batch of shelf changes is one pending card', async () => {
    const { voice, messages, state, ports, start } = setup();
    await ports.catalog.addToReadingList(reader, { bookId: 1, state: ReadingState.enum.READING });
    await ports.catalog.addToReadingList(reader, {
      bookId: 12,
      state: ReadingState.enum.WANT_TO_READ,
    });
    const before = JSON.stringify(state.shelf.get(reader.id));
    const session = await start();
    voice.emit({ type: 'toolUse', toolUseId: 'u1', name: 'getReadingList', input: {} });
    voice.emit({
      type: 'toolUse',
      toolUseId: 'u2',
      name: 'changeReadingList',
      input: {
        changes: [
          { action: 'remove', bookId: 1 },
          { action: 'remove', bookId: 12 },
        ],
      },
    });
    await tick(20);
    const byId = Object.fromEntries(voice.sent.toolResults.map(r => [r.toolUseId, r.result]));
    expect(byId['u1']).toEqual({
      entries: expect.arrayContaining([
        {
          id: 1,
          title: 'The Hobbit',
          author: 'J. R. R. Tolkien',
          year: expect.any(Number),
          state: 'READING',
        },
        {
          id: 12,
          title: 'Dune',
          author: 'Frank Herbert',
          year: expect.any(Number),
          state: 'WANT_TO_READ',
        },
      ]),
    });
    expect(byId['u2']).toMatchObject({ status: 'pending_confirmation' });
    expect(messages.filter(m => m.type === 'pending-action')).toHaveLength(1);
    expect(JSON.stringify(state.shelf.get(reader.id))).toBe(before);
    await session.stop();
  });

  it('a confirm or cancel from the page is told to the model as an [app] line', async () => {
    const { voice, messages, start } = setup();
    const session = await start();
    session.decided({
      actionId: 'a1',
      status: PendingActionStatus.enum.confirmed,
      summary: 'Add “Dune” to your reading list',
    });
    session.decided({
      actionId: 'a2',
      status: PendingActionStatus.enum.cancelled,
      summary: 'Add “Dune” to your reading list',
    });
    await tick();
    expect(voice.sent.texts).toEqual([
      '[app] The user confirmed on screen: Add “Dune” to your reading list. It is done.',
      '[app] The user cancelled on screen: Add “Dune” to your reading list. Nothing changed.',
    ]);
    expect(messages.filter(m => m.type === 'action-decided')).toEqual([
      { type: 'action-decided', actionId: 'a1', status: 'confirmed' },
      { type: 'action-decided', actionId: 'a2', status: 'cancelled' },
    ]);
    await session.stop();
  });

  it('cites per turn: whole titles only, reading-list books too, and only what this turn returned', async () => {
    const { voice, messages, ports, start } = setup();
    await ports.catalog.addToReadingList(reader, { bookId: 1, state: ReadingState.enum.READING });
    const session = await start();
    const say = (contentId: string, text: string) =>
      voice.emit({ type: 'text', role: 'assistant', stage: 'final', contentId, text });
    const cites = () =>
      messages.flatMap(m => (m.type === 'citations' ? [m.citations.map(c => c.bookId)] : []));
    voice.emit({ type: 'userSpeechStart' });
    voice.emit({ type: 'toolUse', toolUseId: 'u1', name: 'getReadingList', input: {} });
    voice.emit({ type: 'toolUse', toolUseId: 'u2', name: 'searchBooks', input: { q: 'dune' } });
    await tick(20);
    say('a1', 'You are reading the hobbit. Dunes aside, Dune is here too.');
    await tick();
    expect(cites()).toEqual([[1, 12]]);
    voice.emit({ type: 'userSpeechStart' });
    say('a2', 'As I said, Dune.');
    await tick();
    expect(cites()).toEqual([[1, 12]]);
    voice.emit({ type: 'userSpeechStart' });
    voice.emit({ type: 'toolUse', toolUseId: 'u3', name: 'searchBooks', input: { q: 'dune' } });
    await tick(20);
    say('a3', 'Dune, by Frank Herbert.');
    await tick();
    expect(cites()).toEqual([[1, 12], [12]]);
    await session.stop();
  });

  it('relays transcripts by stage, says interrupted, and cites only books a tool returned', async () => {
    const { voice, messages, start } = setup();
    const session = await start();
    voice.emit({ type: 'toolUse', toolUseId: 'u1', name: 'searchBooks', input: { q: 'dune' } });
    await tick(20);
    voice.emit({
      type: 'text',
      role: 'user',
      stage: 'final',
      contentId: 'c1',
      text: 'do you have dune?',
    });
    voice.emit({
      type: 'text',
      role: 'assistant',
      stage: 'speculative',
      contentId: 'c2',
      text: 'Yes, Dune.',
    });
    voice.emit({ type: 'interrupted' });
    voice.emit({
      type: 'text',
      role: 'assistant',
      stage: 'final',
      contentId: 'c3',
      text: 'Yes, Dune, and The Hobbit.',
    });
    await tick();
    expect(messages.filter(m => m.type !== 'tool' && m.type !== 'ready')).toEqual([
      { type: 'transcript', id: 'c1', role: 'user', stage: 'final', text: 'do you have dune?' },
      { type: 'transcript', id: 'c2', role: 'assistant', stage: 'speculative', text: 'Yes, Dune.' },
      { type: 'interrupted' },
      {
        type: 'transcript',
        id: 'c3',
        role: 'assistant',
        stage: 'final',
        text: 'Yes, Dune, and The Hobbit.',
      },
      { type: 'citations', citations: [{ bookId: 12, title: 'Dune' }] },
    ]);
    await session.stop();
  });

  it('usage becomes cost, and the session is traced once as a VOICE run with speech tokens', async () => {
    const { voice, ports, start } = setup();
    const session = await start();
    voice.emit({
      type: 'usage',
      total: { speechIn: 1000, speechOut: 2000, textIn: 300, textOut: 100 },
    });
    await tick();
    const summary = await session.stop();
    expect(summary.endReason).toBe('user');
    expect(summary.costUsd).toBeCloseTo(
      (1000 * 2.91 + 2000 * 11.65 + 300 * 0.363 + 100 * 2.992) / 1e6,
      8
    );
    expect(ports.state.runs).toEqual([
      expect.objectContaining({
        feature: 'VOICE',
        provider: 'nova-sonic',
        model: 'amazon.nova-2-sonic-v1:0',
        tokensSpeechIn: 1000,
        tokensSpeechOut: 2000,
        tokensIn: 300,
        tokensOut: 100,
        success: true,
        errorCode: null,
      }),
    ]);
  });

  it('at the duration limit it asks for a goodbye, then closes in order with max-duration', async () => {
    const { voice, messages, start } = setup({ maxSeconds: 0.05 });
    const session = await start();
    await tick(80);
    expect(voice.sent.texts.at(-1)).toMatch(/^\[app\] The session time limit is reached/);
    voice.emit({ type: 'turnEnd' });
    const summary = await session.done;
    expect(summary.endReason).toBe('max-duration');
    expect(voice.sent.closed).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'ended', reason: 'max-duration' });
  });

  it('closes as idle when nobody speaks, and as provider when the stream fails', async () => {
    const idle = setup({ idleSeconds: 0.05 });
    const idleSession = await idle.start();
    expect((await idleSession.done).endReason).toBe('idle');
    const failing = setup();
    const failingSession = await failing.start();
    failing.voice.emit({ type: 'error', message: 'model stream error' });
    const summary = await failingSession.done;
    expect(summary.endReason).toBe('provider');
    expect(failing.ports.state.runs[0]).toMatchObject({ success: false, errorCode: 'provider' });
  });
});
