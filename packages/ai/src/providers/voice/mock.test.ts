import { ChatLocale, PendingActionStatus, type VoiceServerMessage } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { VOICE_GREETING_CUE, startVoiceSession } from '../../features/voiceSession.js';
import { book, createFakePorts, createFakeState, reader } from '../../testing/index.js';
import { catalogTools } from '../../tools/catalogTools.js';
import { createToolRegistry } from '../../tools/registry.js';
import { createMockVoiceProvider } from './mock.js';

const frame = (amplitude: number) => {
  const samples = new Int16Array(512);
  for (let i = 0; i < samples.length; i++) samples[i] = i % 2 === 0 ? amplitude : -amplitude;
  return new Uint8Array(samples.buffer);
};
const utterance = (send: (pcm: Uint8Array) => void) => {
  for (let i = 0; i < 10; i++) send(frame(3000));
  for (let i = 0; i < 25; i++) send(frame(0));
};
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 10));
};

describe('scripted mock voice provider', () => {
  it('plays its script through a real session: search, a proposed add, and the spoken confirmation', async () => {
    const state = createFakeState({
      books: [
        book(1, { title: 'The Hobbit', author: 'J. R. R. Tolkien' }),
        book(2, { title: 'The Fellowship of the Ring', author: 'J. R. R. Tolkien' }),
      ],
    });
    const messages: VoiceServerMessage[] = [];
    let audioBytes = 0;
    const session = await startVoiceSession(
      {
        voice: createMockVoiceProvider({ replyDelayMs: 1 }),
        ports: createFakePorts(state),
        registry: createToolRegistry(catalogTools),
        confirmSecret: 'test-confirm-secret-test-confirm',
        voiceId: 'tiffany',
        limits: { maxSeconds: 60, idleSeconds: 60 },
      },
      { actor: reader, requestId: 'r' },
      { sessionId: 's', locale: ChatLocale.enum.en },
      { send: message => messages.push(message), audio: pcm => (audioBytes += pcm.length) }
    );
    const finals = () =>
      messages.flatMap(m =>
        m.type === 'transcript' && m.stage === 'final' ? [`${m.role}: ${m.text}`] : []
      );

    utterance(pcm => session.audio(pcm));
    await until(() => finals().some(line => line.startsWith('assistant: I found')));
    expect(finals()).toEqual([
      'user: books by tolkien',
      'assistant: I found The Fellowship of the Ring and The Hobbit.',
    ]);
    expect(messages).toContainEqual({
      type: 'citations',
      citations: [
        { bookId: 2, title: 'The Fellowship of the Ring' },
        { bookId: 1, title: 'The Hobbit' },
      ],
    });
    expect(audioBytes).toBeGreaterThan(0);

    utterance(pcm => session.audio(pcm));
    await until(() => messages.some(m => m.type === 'pending-action'));
    const pending = messages.find(m => m.type === 'pending-action');
    expect(pending).toMatchObject({ action: { tool: 'addToReadingList', input: { bookId: 2 } } });
    expect(state.shelf.get(reader.id) ?? []).toEqual([]);

    session.decided({
      actionId: 'x',
      status: PendingActionStatus.enum.confirmed,
      summary: 'Add “The Fellowship of the Ring”',
    });
    await until(() => finals().includes('assistant: Done: it is on your reading list.'));
    const summary = await session.stop();
    expect(summary.toolCalls).toEqual([
      { name: 'searchBooks', ok: true, input: { q: 'tolkien', limit: 5 } },
      { name: 'addToReadingList', ok: true, input: { bookId: 2, state: 'WANT_TO_READ' } },
    ]);
    expect(state.runs.at(-1)).toMatchObject({ feature: 'VOICE', provider: 'mock', success: true });
  });

  it('answers the greeting cue with a short greeting in the prompt language', async () => {
    for (const [system, expected] of [
      ['Reply in English.', "Hi, I'm the librarian. What are you in the mood for?"],
      ['Reply in French.', 'Bonjour, je suis le bibliothécaire. Qu’avez-vous envie de lire ?'],
    ] as const) {
      const stream = await createMockVoiceProvider({ replyDelayMs: 1 }).open({
        system,
        tools: [],
        voiceId: 'tiffany',
      });
      const texts: string[] = [];
      void (async () => {
        for await (const event of stream.events) if (event.type === 'text') texts.push(event.text);
      })();
      stream.sendText(VOICE_GREETING_CUE);
      await until(() => texts.length > 0);
      expect(texts[0]).toBe(expected);
      await stream.close();
    }
  });

  it('speech over its own answer is a barge-in', async () => {
    const stream = await createMockVoiceProvider({ replyDelayMs: 1 }).open({
      system: '',
      tools: [],
      voiceId: 'tiffany',
    });
    const seen: string[] = [];
    void (async () => {
      for await (const event of stream.events) seen.push(event.type);
    })();
    stream.sendText('[app] The user confirmed on screen.');
    await until(() => seen.includes('audio'));
    for (let i = 0; i < 5; i++) stream.sendAudio(frame(3000));
    await until(() => seen.includes('interrupted'));
    expect(seen).toContain('interrupted');
    await stream.close();
  });
});
