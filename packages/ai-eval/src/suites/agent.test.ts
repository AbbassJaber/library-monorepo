import { agentMockPolicy, createMockProvider, mockToolHandlers } from '@library/ai';
import type { LlmProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { JUDGE_TOOL } from '../metrics/judge.js';
import { loadAgentCases, runAgentInProcess } from './agent.js';
import type { AgentCase } from './agent.js';
import { ChatLocale } from '@library/contracts';

const mock = () => createMockProvider({ tools: mockToolHandlers, agent: agentMockPolicy });
const fast = { throttleRetries: 1, backoffMs: 1 };

const cases: AgentCase[] = [
  {
    id: 'a-search',
    language: ChatLocale.enum.en,
    actor: 'reader',
    text: 'books by tolkien',
    expect: { tools: ['searchBooks'], cite: [1, 2], noPending: true },
  },
  {
    id: 'a-add',
    language: ChatLocale.enum.en,
    actor: 'reader',
    text: 'add dune to my reading list',
    expect: {
      tools: ['searchBooks'],
      pending: { tool: 'addToReadingList', input: { bookId: 12 } },
    },
  },
];

describe('agent suite', () => {
  it('has EN and FR cases for readers and librarians, including mutations and out-of-scope requests', () => {
    const all = loadAgentCases();
    expect(all.length).toBeGreaterThanOrEqual(15);
    expect(new Set(all.map(c => c.language))).toEqual(new Set(['en', 'fr']));
    expect(new Set(all.map(c => c.actor))).toEqual(new Set(['reader', 'librarian']));
    expect(all.some(c => c.expect.pending)).toBe(true);
    expect(all.some(c => c.expect.tools?.length === 0)).toBe(true);
  });

  it('keeps a hold-out set apart: never the same ids, same expectation format', () => {
    const tuned = loadAgentCases('tuned');
    const holdout = loadAgentCases('holdout');
    expect(holdout.length).toBeGreaterThanOrEqual(10);
    expect(holdout.every(c => c.set === 'holdout')).toBe(true);
    expect(tuned.every(c => c.set === 'tuned')).toBe(true);
    const ids = new Set(tuned.map(c => c.id));
    expect(holdout.filter(c => ids.has(c.id))).toEqual([]);
    expect(loadAgentCases('all')).toHaveLength(tuned.length + holdout.length);
  });

  it('on the Mock: the deterministic rubric holds and nothing is ever written', async () => {
    const rows = await runAgentInProcess(cases, mock(), null, fast);
    expect(rows.map(r => [r.id, r.checks])).toEqual([
      ['a-search', { tools: true, pending: true, noMutation: true, cited: true }],
      ['a-add', { tools: true, pending: true, noMutation: true, cited: true }],
    ]);
    expect(rows.every(r => r.judge === null)).toBe(true);
  });

  it('a batch expectation matches the exact set of books and the action, in any order', async () => {
    const batch = (bookIds: number[]): AgentCase => ({
      id: `b-${bookIds.join('-')}`,
      language: ChatLocale.enum.en,
      actor: 'reader',
      text: 'remove every book from my reading list',
      shelf: [16, 12, 104],
      expect: {
        tools: ['getReadingList'],
        pending: { tool: 'changeReadingList', changes: { action: 'remove', bookIds } },
      },
    });
    const rows = await runAgentInProcess(
      [batch([104, 16, 12]), batch([16, 12]), batch([16, 12, 104, 1])],
      mock(),
      null,
      fast
    );
    expect(rows.map(r => r.checks.pending)).toEqual([true, false, false]);
    expect(rows.every(r => r.checks.noMutation)).toBe(true);
  });

  it('asks the judge for a verdict on each answer, with the tool evidence as data', async () => {
    const seen: string[] = [];
    const judge: LlmProvider = createMockProvider({
      tools: {
        [JUDGE_TOOL]: request => {
          seen.push(request.system.map(block => block.text).join('\n'));
          return {
            grounded: true,
            cited: true,
            claimsUnconfirmedChange: false,
            answersQuestion: true,
            rationale: 'ok',
          };
        },
      },
    });
    const rows = await runAgentInProcess(cases.slice(0, 1), mock(), judge, fast);
    expect(rows[0]!.judge).toMatchObject({ grounded: true, claimsUnconfirmedChange: false });
    expect(seen[0]).toContain('<data name="evidence">');
    expect(seen[0]).toContain('The Hobbit');
  });
});
