import { createMockProvider, recommendMockHandler, RECOMMEND_TOOL } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { loadRecommendCases, runRecommendInProcess } from './recommend.js';

describe('recommend suite', () => {
  it('has EN and FR reader profiles over the seed catalog', () => {
    const cases = loadRecommendCases();
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(cases.map(c => c.language))).toEqual(new Set(['en', 'fr']));
    expect(cases.some(c => c.favorites.length === 0)).toBe(true);
  });

  it('scores raw picks the allowlist drops, and finds no violation in what is returned', async () => {
    const [first] = loadRecommendCases();
    const leaky = createMockProvider({
      tools: {
        [RECOMMEND_TOOL]: request => {
          const fine = recommendMockHandler(request) as {
            recommendations: Array<{ bookId: number; citedEntryIds: number[] }>;
          };
          return {
            recommendations: [
              ...fine.recommendations.slice(0, 2),
              {
                bookId: 1,
                explanation: 'Again.',
                citedEntryIds: fine.recommendations[0]!.citedEntryIds,
              },
              { bookId: 3, explanation: 'Ghost.', citedEntryIds: [999_999] },
            ],
          };
        },
      },
    });
    const [row] = await runRecommendInProcess([first!], leaky);
    expect(row).toMatchObject({
      id: 'rc-01',
      rawCount: 4,
      rawDropped: 2,
      violations: 0,
      languageOk: true,
    });
    expect(row!.recommended).not.toContain(1);
  });
});
