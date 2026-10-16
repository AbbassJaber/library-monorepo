import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUDGETS } from '../cost/budgets.js';
import { createMockProvider } from '../providers/mock/index.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { LlmProvider } from '../providers/types.js';
import {
  createFakePorts,
  createFakeState,
  externalRecord,
  genre,
  librarian,
  reader,
} from '../testing/index.js';
import { autofill } from './autofill.js';
import { nlSearch } from './nlSearch.js';

const hung = (): LlmProvider => ({
  ...createMockProvider(),
  generate: () => new Promise(() => {}),
});

const ports = () =>
  createFakePorts(
    createFakeState({ genres: [genre(1, 'Fantasy', 'fantasy')], lookup: [externalRecord()] })
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('provider timeout', () => {
  it('nlSearch: a provider that never answers is AI_UNAVAILABLE at the budget timeout, traced as failed', async () => {
    vi.useFakeTimers();
    const p = ports();
    const pending = nlSearch(
      { llm: hung(), ports: p },
      { actor: reader, requestId: 't' },
      { text: 'dune' }
    );
    const settled = expect(pending).rejects.toBeInstanceOf(ProviderUnavailableError);
    await vi.advanceTimersByTimeAsync(BUDGETS.NL_SEARCH.timeoutMs - 1);
    expect(p.state.runs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(p.state.runs[0]).toMatchObject({ success: false, errorCode: 'AI_UNAVAILABLE' });
  });

  it('autofill: the same timeout serves the lookup-only draft, flagged unavailable', async () => {
    vi.useFakeTimers();
    const p = ports();
    const pending = autofill(
      { llm: hung(), ports: p },
      { actor: librarian, requestId: 't' },
      { isbn: externalRecord().isbn! }
    );
    await vi.advanceTimersByTimeAsync(BUDGETS.AUTOFILL.timeoutMs);
    const outcome = await pending;
    expect(outcome).toMatchObject({ aiUnavailable: true, meta: null, lookupHit: true });
    expect(outcome.unavailableReason).toMatch(/timed out/);
    expect(outcome.value.title).toMatchObject({ value: 'Dune', source: 'lookup' });
    expect(p.state.runs[0]).toMatchObject({ success: false, errorCode: 'AI_UNAVAILABLE' });
  });
});
