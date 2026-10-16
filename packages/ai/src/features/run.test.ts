import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../providers/mock/index.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { LlmProvider } from '../providers/types.js';
import { createFakePorts, reader } from '../testing/index.js';
import { runFeature, withTimeout } from './run.js';
import { BUDGETS } from '../cost/budgets.js';
import { AiFeature, AiTier } from '@library/contracts';

describe('runFeature', () => {
  it('traces one successful run with summed usage and returns meta.ai', async () => {
    const ports = createFakePorts();
    const llm = createMockProvider({ reply: () => 'ok' });
    const outcome = await runFeature(
      {
        feature: AiFeature.enum.NL_SEARCH,
        llm,
        trace: ports.trace,
        actor: reader,
        requestId: 'r1',
      },
      async () => {
        const a = await llm.generate({
          tier: AiTier.enum.small,
          system: [],
          messages: [{ role: 'user', content: 'x' }],
          maxOutputTokens: 5,
        });
        const b = await llm.generate({
          tier: AiTier.enum.small,
          system: [],
          messages: [{ role: 'user', content: 'y' }],
          maxOutputTokens: 5,
        });
        return { value: 42, attempts: [a, b], fallbackUsed: true };
      }
    );
    expect(outcome.value).toBe(42);
    expect(outcome.meta).toMatchObject({
      runId: 1,
      feature: 'NL_SEARCH',
      provider: 'mock',
      model: 'mock-small',
      fallbackUsed: true,
      costUsd: 0,
    });
    expect(ports.state.runs).toHaveLength(1);
    expect(ports.state.runs[0]).toMatchObject({ success: true, requestId: 'r1', userId: 1 });
  });

  it('an unreachable provider yields AI_UNAVAILABLE within the budgeted timeout with success=false', async () => {
    const ports = createFakePorts();
    const hanging: LlmProvider = {
      ...createMockProvider(),
      generate: () => new Promise(() => undefined),
    };
    const original = BUDGETS.SIMILAR.timeoutMs;
    BUDGETS.SIMILAR.timeoutMs = 50;
    const started = Date.now();
    try {
      await expect(
        runFeature(
          {
            feature: AiFeature.enum.SIMILAR,
            llm: hanging,
            trace: ports.trace,
            actor: null,
            requestId: null,
          },
          async signal => {
            const result = await hanging.generate({
              tier: AiTier.enum.small,
              system: [],
              messages: [],
              maxOutputTokens: 1,
              signal,
            });
            return { value: result, attempts: [result], fallbackUsed: false };
          }
        )
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
    } finally {
      BUDGETS.SIMILAR.timeoutMs = original;
    }
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ports.state.runs[0]).toMatchObject({
      success: false,
      errorCode: 'AI_UNAVAILABLE',
      userId: null,
    });
  });

  it('withTimeout resolves fast calls untouched', async () => {
    expect(await withTimeout(100, async () => 'fast')).toBe('fast');
  });
});
