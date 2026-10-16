import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEADLINE_SEEN_KEY, HEADLINE_WAIT_MS, riseHeadlineOnce } from './motionPrefs';

const stubMotion = (allowed: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('no-preference') ? allowed : !allowed,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));

describe('the signed-out headline (motion moment 3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('never hides the headline under reduced motion', () => {
    stubMotion(false);
    const heading = document.createElement('h1');
    riseHeadlineOnce(heading)();
    expect(heading.style.visibility).toBe('');
    expect(sessionStorage.getItem(HEADLINE_SEEN_KEY)).toBeNull();
  });

  it('rises once per session: after that it is simply there', () => {
    stubMotion(true);
    sessionStorage.setItem(HEADLINE_SEEN_KEY, '1');
    const heading = document.createElement('h1');
    riseHeadlineOnce(heading);
    expect(heading.style.visibility).toBe('');
  });

  it('is hidden only while GSAP loads, and shown again if the effect is cleaned up', () => {
    stubMotion(true);
    const heading = document.createElement('h1');
    const cleanup = riseHeadlineOnce(heading);
    expect(heading.style.visibility).toBe('hidden');
    cleanup();
    expect(heading.style.visibility).toBe('');
  });

  it('never holds the headline back for long: after the wait it is shown plainly', async () => {
    vi.useFakeTimers();
    stubMotion(true);
    const heading = document.createElement('h1');
    riseHeadlineOnce(heading);
    expect(heading.style.visibility).toBe('hidden');
    vi.advanceTimersByTime(HEADLINE_WAIT_MS);
    expect(heading.style.visibility).toBe('');
    expect(sessionStorage.getItem(HEADLINE_SEEN_KEY)).toBe('1');
    vi.useRealTimers();
  });
});
