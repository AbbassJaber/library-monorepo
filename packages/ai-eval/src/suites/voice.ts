import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VOICE_TOKENS_PER_SECOND,
  VOICE_PRICING,
  catalogTools,
  createToolRegistry,
  hybridSearch,
  startVoiceSession,
  syncEmbeddings,
  DEFAULT_VOICE_ID,
} from '@library/ai';
import type { EmbeddingProvider, LlmProvider, VoiceProvider } from '@library/ai';
import { createFakePorts, librarian, reader } from '@library/ai/testing';
import { VoiceEndReason, type VoiceServerMessage } from '@library/contracts';
import { z } from 'zod';
import { seedState } from './agent.js';

const Case = z.object({
  id: z.string(),
  language: z.enum(['en', 'fr']),
  actor: z.enum(['reader', 'librarian']),
  say: z.string(),
  bargeIn: z.object({ id: z.string(), say: z.string() }).optional(),
  expect: z.object({
    tools: z.array(z.string()).optional(),
    notTools: z.array(z.string()).optional(),
    pending: z.object({ tool: z.string(), input: z.record(z.string(), z.unknown()) }).optional(),
    noPending: z.boolean().optional(),
    refused: z.array(z.string()).optional(),
    recovers: z.boolean().optional(),
  }),
});
export type VoiceCase = z.infer<typeof Case>;

const ROOT = join(import.meta.dirname, '../..');
export const VOICE_FIXTURES = join(ROOT, 'fixtures/voice');

export const loadVoiceCases = (): VoiceCase[] =>
  z
    .object({ cases: z.array(Case).min(15) })
    .parse(JSON.parse(readFileSync(join(ROOT, 'src/cases/voice.json'), 'utf8'))).cases;

export const pcmOf = (id: string): Buffer => {
  const buf = readFileSync(join(VOICE_FIXTURES, `${id}.wav`));
  for (let offset = 12; offset < buf.length;) {
    const size = buf.readUInt32LE(offset + 4);
    if (buf.toString('ascii', offset, offset + 4) === 'data')
      return buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${id}.wav has no data chunk`);
};

export const fixtureSeconds = (id: string) => pcmOf(id).length / 32_000;

export interface VoiceRow {
  id: string;
  language: string;
  actor: string;
  checks: {
    tools: boolean;
    pending: boolean;
    noMutation: boolean;
    bargeIn: boolean | null;
    recovery: boolean | null;
  };
  userText: string;
  answer: string;
  toolCalls: string[];
  pending: { tool: string; input: unknown } | null;
  firstAudioMs: number | null;
  turnMs: number | null;
  usage: { speechIn: number; speechOut: number; textIn: number; textOut: number };
  costUsd: number;
  error: string | null;
}

const RECOVERY =
  /\b(again|repeat|say it|read it|spell|one more time|title|search)\b|répét|redi[rst]|à nouveau|encore|titre|cherch/i;

export const scoreVoiceChecks = (
  c: VoiceCase,
  run: {
    toolCalls: Array<{ name: string; ok: boolean }>;
    pending: { tool: string; input: unknown } | null;
    answer: string;
  }
): Pick<VoiceRow['checks'], 'tools' | 'pending' | 'recovery'> => {
  const ok = new Set(run.toolCalls.filter(call => call.ok).map(call => call.name));
  const failed = new Set(run.toolCalls.filter(call => !call.ok).map(call => call.name));
  const tools =
    (c.expect.tools === undefined ||
      (c.expect.tools.length === 0
        ? run.toolCalls.length === 0
        : c.expect.tools.every(t => ok.has(t)))) &&
    (c.expect.notTools ?? []).every(t => !ok.has(t)) &&
    (c.expect.refused ?? []).every(t => failed.has(t) && !ok.has(t));
  const pending = c.expect.pending
    ? run.pending !== null &&
      run.pending.tool === c.expect.pending.tool &&
      subset(c.expect.pending.input, run.pending.input)
    : c.expect.noPending
      ? run.pending === null
      : true;
  const recovery = c.expect.recovers ? failed.size > 0 && RECOVERY.test(run.answer) : null;
  return { tools, pending, recovery };
};

const FRAME = 1024;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const voiceCaseWorstUsd = (model: string, maxSeconds: number): number => {
  const price = VOICE_PRICING[model];
  if (!price) return Number.POSITIVE_INFINITY;
  return (
    (maxSeconds * VOICE_TOKENS_PER_SECOND.speechIn * price.speechInPerMTok +
      maxSeconds * VOICE_TOKENS_PER_SECOND.speechOut * price.speechOutPerMTok +
      2_000 * price.textInPerMTok +
      500 * price.textOutPerMTok) /
    1_000_000
  );
};

const subset = (expected: Record<string, unknown>, actual: unknown) =>
  typeof actual === 'object' &&
  actual !== null &&
  Object.entries(expected).every(
    ([key, value]) => (actual as Record<string, unknown>)[key] === value
  );

export const runVoiceInProcess = async (
  cases: VoiceCase[],
  voice: VoiceProvider,
  options: {
    llm: LlmProvider;
    embeddings?: EmbeddingProvider;
    minSimilarity?: number;
    maxSeconds?: number;
    maxUsd?: number;
    voiceId?: string;
  }
): Promise<VoiceRow[]> => {
  const maxSeconds = options.maxSeconds ?? 30;
  const perCaseWorst = voiceCaseWorstUsd(voice.model, maxSeconds);
  const embedded = seedState();
  if (options.embeddings) {
    const fake = createFakePorts(embedded);
    await syncEmbeddings(
      await fake.catalog.listBooksForEmbedding(),
      options.embeddings,
      fake.vectorStore
    );
  }
  const rows: VoiceRow[] = [];
  let spent = 0;
  for (const c of cases) {
    const base: Omit<VoiceRow, 'checks'> = {
      id: c.id,
      language: c.language,
      actor: c.actor,
      userText: '',
      answer: '',
      toolCalls: [],
      pending: null,
      firstAudioMs: null,
      turnMs: null,
      usage: { speechIn: 0, speechOut: 0, textIn: 0, textOut: 0 },
      costUsd: 0,
      error: null,
    };
    if (options.maxUsd !== undefined && spent + perCaseWorst > options.maxUsd) {
      rows.push({
        ...base,
        checks: { tools: false, pending: false, noMutation: true, bargeIn: null, recovery: null },
        error: 'skipped: spending cap reached',
      });
      continue;
    }
    const state = seedState();
    state.vectors = new Map(embedded.vectors);
    const ports = createFakePorts(state);
    const actor = c.actor === 'librarian' ? librarian : reader;
    const messages: Array<{ at: number; message: VoiceServerMessage }> = [];
    let audioAt: number | null = null;
    let lastActivity = Date.now();
    const embeddings = options.embeddings;
    try {
      const session = await startVoiceSession(
        {
          voice,
          ports,
          registry: createToolRegistry(catalogTools),
          confirmSecret: 'eval-confirm-secret-eval-confirm-secret',
          voiceId: options.voiceId ?? DEFAULT_VOICE_ID,
          limits: { maxSeconds, idleSeconds: maxSeconds },
          ...(embeddings
            ? {
                search: async (who, input) =>
                  (
                    await hybridSearch(
                      {
                        llm: options.llm,
                        embeddings,
                        ports,
                        minSimilarity: options.minSimilarity ?? 0,
                      },
                      { actor: who, requestId: null },
                      { q: input.q ?? '', limit: input.limit, rerank: false }
                    )
                  ).value.items.map(item => item.book),
              }
            : {}),
        },
        { actor, requestId: `eval-${c.id}` },
        { sessionId: c.id, locale: c.language },
        {
          send: message => {
            messages.push({ at: Date.now(), message });
            lastActivity = Date.now();
          },
          audio: () => {
            audioAt ??= Date.now();
            lastActivity = Date.now();
          },
        }
      );
      let ended = false;
      void session.done.then(() => (ended = true));
      let speech = pcmOf(c.id);
      let bargedIn = false;
      const started = Date.now();
      const silence = Buffer.alloc(FRAME);
      const answered = () =>
        messages.some(
          m =>
            m.message.type === 'transcript' &&
            m.message.role === 'assistant' &&
            m.message.stage === 'final'
        );
      while (!ended && Date.now() - started < maxSeconds * 1000) {
        if (speech.length > 0) {
          const frame = speech.subarray(0, FRAME);
          speech = speech.subarray(FRAME);
          session.audio(
            frame.length === FRAME ? frame : Buffer.concat([frame, silence.subarray(frame.length)])
          );
        } else session.audio(silence);
        if (c.bargeIn && !bargedIn && audioAt !== null && Date.now() - audioAt > 1200) {
          bargedIn = true;
          speech = pcmOf(c.bargeIn.id);
        }
        if (answered() && speech.length === 0 && Date.now() - lastActivity > 3000) break;
        await sleep(32);
      }
      const summary = await session.stop();
      const finals = (role: 'user' | 'assistant') =>
        messages
          .map(m => m.message)
          .filter(
            (m): m is Extract<VoiceServerMessage, { type: 'transcript' }> =>
              m.type === 'transcript' && m.role === role && m.stage === 'final'
          )
          .map(m => m.text)
          .join(' ')
          .trim();
      const pendingMessage = messages.map(m => m.message).find(m => m.type === 'pending-action');
      const pending = pendingMessage?.type === 'pending-action' ? pendingMessage.action : null;
      const scored = scoreVoiceChecks(c, {
        toolCalls: summary.toolCalls,
        pending,
        answer: finals('assistant'),
      });
      const finalAt = messages.find(
        m =>
          m.message.type === 'transcript' &&
          m.message.role === 'assistant' &&
          m.message.stage === 'final'
      )?.at;
      spent += summary.costUsd;
      rows.push({
        ...base,
        checks: {
          tools: scored.tools,
          pending: scored.pending,
          recovery: scored.recovery,
          noMutation: (state.shelf.get(actor.id) ?? []).length === 0,
          bargeIn: c.bargeIn ? messages.some(m => m.message.type === 'interrupted') : null,
        },
        userText: finals('user'),
        answer: finals('assistant'),
        toolCalls: summary.toolCalls.map(
          call => `${call.name} ${JSON.stringify(call.input)}${call.ok ? '' : ' (error)'}`
        ),
        pending: pending ? { tool: pending.tool, input: pending.input } : null,
        firstAudioMs: summary.firstAudioMs[0] ?? null,
        turnMs:
          finalAt !== undefined && summary.firstAudioMs[0] !== undefined && audioAt !== null
            ? finalAt - (audioAt - summary.firstAudioMs[0])
            : null,
        usage: summary.usage,
        costUsd: summary.costUsd,
        error:
          summary.endReason === VoiceEndReason.enum.provider ? 'provider closed the session' : null,
      });
    } catch (error) {
      rows.push({
        ...base,
        checks: { tools: false, pending: false, noMutation: true, bargeIn: null, recovery: null },
        error: String((error as Error).message).slice(0, 300),
      });
    }
  }
  return rows;
};
