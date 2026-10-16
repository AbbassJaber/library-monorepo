import { describe, expect, it } from 'vitest';
import { checkBudget, estimateRun } from './estimate.js';
import { AiFeature } from '@library/contracts';

describe('cost pre-flight', () => {
  it('estimates the worst case from the feature budget and the dated price table', () => {
    const estimate = estimateRun(
      'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      AiFeature.enum.NL_SEARCH,
      68
    );
    expect(estimate.perCallUsd).toBeCloseTo((2 * (6000 * 1.1 + 300 * 5.5)) / 1e6, 8);
    expect(estimate.totalUsd).toBeCloseTo(68 * estimate.perCallUsd, 5);
    expect(checkBudget(estimate, 'bedrock', 3)).toEqual({ ok: true });
  });

  it('refuses above EVAL_MAX_COST_USD, and refuses unpriced models, before any call', () => {
    const kimi = estimateRun('kimi-k2.6', AiFeature.enum.NL_SEARCH, 34);
    expect(checkBudget(kimi, 'kimi', 0.001)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('EVAL_MAX_COST_USD') as string,
    });
    expect(
      checkBudget(estimateRun('mystery-model', AiFeature.enum.NL_SEARCH, 1), 'openai-compatible', 3)
    ).toMatchObject({ ok: false, reason: expect.stringContaining('no price') as string });
    expect(
      checkBudget(estimateRun('mock-small', AiFeature.enum.NL_SEARCH, 1000), 'mock', 0)
    ).toEqual({
      ok: true,
    });
  });
});
