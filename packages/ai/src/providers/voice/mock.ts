import { createQueue } from './types.js';
import type {
  VoiceProvider,
  VoiceProviderEvent,
  VoiceSessionConfig,
  VoiceStream,
} from './types.js';
import { VoiceProviderName, ToolName, ReadingState } from '@library/contracts';

export const MOCK_VOICE_MODEL = 'mock-voice';

const VOICED_RMS = 400;
const START_FRAMES = 3;
const END_FRAMES = 20;

const rms = (pcm: Uint8Array): number => {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
};

const tone = (ms: number): Uint8Array => {
  const samples = new Int16Array(Math.round((24_000 * ms) / 1000));
  for (let i = 0; i < samples.length; i++)
    samples[i] = Math.round(1500 * Math.sin((2 * Math.PI * 440 * i) / 24_000));
  return new Uint8Array(samples.buffer);
};

const LINES = {
  en: {
    turn1: 'books by tolkien',
    turn2: 'add the first one to my reading list',
    later: 'thank you',
    found: (titles: string[]) =>
      titles.length > 0 ? `I found ${titles.join(' and ')}.` : 'I found nothing.',
    pending: 'I have put a card on your screen: please press Confirm to add it.',
    welcome: 'You are welcome.',
    confirmed: 'Done: it is on your reading list.',
    cancelled: 'All right, nothing changed.',
    other: 'All right.',
    greeting: "Hi, I'm the librarian. What are you in the mood for?",
  },
  fr: {
    turn1: 'des livres de tolkien',
    turn2: 'ajoute le premier à ma liste de lecture',
    later: 'merci',
    found: (titles: string[]) =>
      titles.length > 0 ? `J'ai trouvé ${titles.join(' et ')}.` : "Je n'ai rien trouvé.",
    pending: "J'ai affiché une carte à l'écran : appuyez sur Confirmer pour l'ajouter.",
    welcome: 'Avec plaisir.',
    confirmed: "C'est fait : il est dans votre liste de lecture.",
    cancelled: "D'accord, rien n'a changé.",
    other: "D'accord.",
    greeting: 'Bonjour, je suis le bibliothécaire. Qu’avez-vous envie de lire ?',
  },
} as const;

export const createMockVoiceProvider = (
  options: { replyDelayMs?: number } = {}
): VoiceProvider => ({
  name: VoiceProviderName.enum.mock,
  model: MOCK_VOICE_MODEL,
  region: null,
  async open(config: VoiceSessionConfig): Promise<VoiceStream> {
    const lines = LINES[/Reply in French/.test(config.system) ? 'fr' : 'en'];
    const delay = options.replyDelayMs ?? 30;
    const events = createQueue<VoiceProviderEvent>();
    const usage = {
      speechIn: 0,
      speechOut: 0,
      textIn: Math.ceil(config.system.length / 4),
      textOut: 0,
    };
    let voiced = 0;
    let silent = 0;
    let inUtterance = false;
    let speaking = false;
    let turn = 0;
    let content = 0;
    let closed = false;
    let firstBookId: number | null = null;
    const pendingTools = new Map<string, (result: Record<string, unknown>) => void>();
    const later = (ms = delay) => new Promise(resolve => setTimeout(resolve, ms));

    const say = async (text: string) => {
      if (closed) return;
      const id = `mock-${++content}`;
      speaking = true;
      events.push({ type: 'text', role: 'assistant', stage: 'speculative', contentId: id, text });
      const audio = tone(400);
      for (let offset = 0; offset < audio.length; offset += 4800) {
        if (!speaking || closed) return;
        events.push({
          type: 'audio',
          contentId: `${id}-audio`,
          pcm: audio.slice(offset, offset + 4800),
        });
        await later(10);
      }
      usage.speechOut += 10;
      usage.textOut += Math.ceil(text.length / 4);
      events.push({
        type: 'text',
        role: 'assistant',
        stage: 'final',
        contentId: `${id}-final`,
        text,
      });
      events.push({ type: 'turnEnd' });
      events.push({ type: 'usage', total: { ...usage, speechIn: Math.round(usage.speechIn) } });
      speaking = false;
    };
    const tool = (name: string, input: unknown) =>
      new Promise<Record<string, unknown>>(resolve => {
        const toolUseId = `mock-tool-${++content}`;
        pendingTools.set(toolUseId, resolve);
        events.push({ type: 'toolUse', toolUseId, name, input });
      });

    const answer = async () => {
      turn += 1;
      const userText = turn === 1 ? lines.turn1 : turn === 2 ? lines.turn2 : lines.later;
      events.push({
        type: 'text',
        role: 'user',
        stage: 'final',
        contentId: `mock-user-${turn}`,
        text: userText,
      });
      await later();
      if (turn === 1) {
        const result = await tool(ToolName.enum.searchBooks, { q: 'tolkien', limit: 5 });
        const books = (
          (result['books'] as Array<{ id: number; title: string }> | undefined) ?? []
        ).slice(0, 2);
        firstBookId = books[0]?.id ?? null;
        await say(lines.found(books.map(book => book.title)));
      } else if (turn === 2 && firstBookId !== null) {
        await tool(ToolName.enum.addToReadingList, {
          bookId: firstBookId,
          state: ReadingState.enum.WANT_TO_READ,
        });
        await say(lines.pending);
      } else {
        await say(lines.welcome);
      }
    };

    return {
      sendAudio(pcm) {
        if (closed) return;
        usage.speechIn += 0.3;
        const isVoiced = rms(pcm) > VOICED_RMS;
        voiced = isVoiced ? voiced + 1 : 0;
        silent = isVoiced ? 0 : silent + 1;
        if (!inUtterance && voiced >= START_FRAMES) {
          inUtterance = true;
          events.push({ type: 'userSpeechStart' });
          if (speaking) {
            speaking = false;
            events.push({ type: 'interrupted' });
          }
        } else if (inUtterance && silent >= END_FRAMES) {
          inUtterance = false;
          events.push({ type: 'userSpeechEnd' });
          void answer();
        }
      },
      sendToolResult(toolUseId, result) {
        pendingTools.get(toolUseId)?.(result);
        pendingTools.delete(toolUseId);
      },
      sendText(text) {
        if (!text.startsWith('[app]')) return;
        void say(
          /confirmed/i.test(text)
            ? lines.confirmed
            : /cancelled/i.test(text)
              ? lines.cancelled
              : /just connected/i.test(text)
                ? lines.greeting
                : lines.other
        );
      },
      async close() {
        if (closed) return;
        closed = true;
        events.push({ type: 'usage', total: { ...usage, speechIn: Math.round(usage.speechIn) } });
        events.end();
      },
      events,
    };
  },
});
