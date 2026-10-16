import { ProviderUnavailableError, createMockProvider, mockToolHandlers } from '@library/ai';
import type { LlmProvider } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { loadNlCases, runNlSearchInProcess } from './nlSearch.js';

describe('nl-search suite', () => {
  it('loads at least 30 cases across EN, FR and AR', () => {
    const cases = loadNlCases();
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map(c => c.language))).toEqual(new Set(['en', 'fr', 'ar']));
    expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
  });

  it('waits and retries a throttled call, counts the retries, and times only the call that answered', async () => {
    const mock = createMockProvider({ tools: mockToolHandlers });
    let calls = 0;
    const throttled: LlmProvider = {
      ...mock,
      tiers: mock.tiers,
      generate: async request => {
        calls += 1;
        if (calls <= 2)
          throw new ProviderUnavailableError(
            'bedrock: 429 Too many requests, please wait before trying again.'
          );
        return mock.generate(request);
      },
    };
    const [first] = loadNlCases();
    const rows = await runNlSearchInProcess([first!], throttled, false, {
      throttleRetries: 3,
      backoffMs: 1,
    });
    expect(rows[0]).toMatchObject({ error: null, throttleRetries: 2 });
    expect(rows[0]!.fields.exact).toBe(true);
  });

  it('gives up after the retry budget and reports the throttling as an error, not a miss of the model', async () => {
    const mock = createMockProvider();
    const alwaysThrottled: LlmProvider = {
      ...mock,
      tiers: mock.tiers,
      generate: async () => {
        throw new ProviderUnavailableError('bedrock: 429 Too many requests');
      },
    };
    const [first] = loadNlCases();
    const rows = await runNlSearchInProcess([first!], alwaysThrottled, false, {
      throttleRetries: 2,
      backoffMs: 1,
    });
    expect(rows[0]).toMatchObject({
      throttleRetries: 2,
      error: expect.stringContaining('429') as string,
    });
  });
});
