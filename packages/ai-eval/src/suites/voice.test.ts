import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMockVoiceProvider, mockToolHandlers, selectLlmProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import {
  VOICE_FIXTURES,
  fixtureSeconds,
  loadVoiceCases,
  runVoiceInProcess,
  scoreVoiceChecks,
  voiceCaseWorstUsd,
} from './voice.js';
import type { VoiceCase } from './voice.js';
import { ChatLocale } from '@library/contracts';

describe('voice suite', () => {
  it('has ~20 EN and FR spoken requests, each with its committed 16 kHz fixture', () => {
    const cases = loadVoiceCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map(c => c.language))).toEqual(new Set(['en', 'fr']));
    expect(cases.some(c => c.expect.pending)).toBe(true);
    expect(cases.some(c => c.bargeIn)).toBe(true);
    expect(cases.some(c => c.actor === 'librarian')).toBe(true);
    for (const id of cases.flatMap(c => [c.id, ...(c.bargeIn ? [c.bargeIn.id] : [])])) {
      expect(existsSync(join(VOICE_FIXTURES, `${id}.wav`)), id).toBe(true);
      expect(fixtureSeconds(id), id).toBeGreaterThan(0.5);
    }
  });

  it('runs a request through a real session at real-time pace (scripted mock): nothing is written', async () => {
    const [first] = loadVoiceCases();
    const rows = await runVoiceInProcess([first!], createMockVoiceProvider({ replyDelayMs: 1 }), {
      llm: selectLlmProvider({ AI_PROVIDER: 'mock' }, { tools: mockToolHandlers }),
      maxSeconds: 12,
    });
    expect(rows[0]).toMatchObject({
      id: 'v-01',
      error: null,
      checks: { tools: true, noMutation: true },
      toolCalls: [expect.stringMatching(/^searchBooks /)],
    });
    expect(rows[0]!.firstAudioMs).not.toBeNull();
  }, 20_000);

  it('the worst case per request is a full capped session of speech both ways', () => {
    expect(voiceCaseWorstUsd('amazon.nova-2-sonic-v1:0', 30)).toBeCloseTo(
      (30 * 9.5 * 2.91 + 30 * 25 * 11.65 + 2000 * 0.363 + 500 * 2.992) / 1e6,
      8
    );
    expect(voiceCaseWorstUsd('unknown', 30)).toBe(Number.POSITIVE_INFINITY);
  });

  it('recovery: a refused ISBN must be followed by asking again or offering a title search', () => {
    const c: VoiceCase = {
      id: 'v-x',
      language: ChatLocale.enum.en,
      actor: 'librarian',
      say: '…',
      expect: { refused: ['draftBook'], recovers: true, noPending: true },
    };
    const refused = [{ name: 'draftBook', ok: false }];
    const score = (answer: string, toolCalls = refused) =>
      scoreVoiceChecks(c, { toolCalls, pending: null, answer });
    expect(score('That ISBN is not valid. Could you say it again, slowly?')).toMatchObject({
      tools: true,
      pending: true,
      recovery: true,
    });
    expect(score('Or I can search for the book by its title.').recovery).toBe(true);
    expect(score('Pouvez-vous le répéter, ou je cherche par titre ?').recovery).toBe(true);
    expect(score('Sorry, the ISBN you gave is not valid.').recovery).toBe(false);
    expect(score('Say it again?', [{ name: 'draftBook', ok: true }]).tools).toBe(false);
    expect(
      scoreVoiceChecks({ ...c, expect: {} }, { toolCalls: [], pending: null, answer: '' }).recovery
    ).toBeNull();
  });

  it('has an invalid-ISBN recovery case', () => {
    expect(loadVoiceCases().some(c => c.expect.recovers === true)).toBe(true);
  });
});
