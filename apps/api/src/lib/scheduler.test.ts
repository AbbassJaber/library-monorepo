import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../test/logger.js';
import { startScheduler } from './scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduler', () => {
  it('runs a job at start and on its interval, never twice at once', async () => {
    vi.useFakeTimers();
    let running = 0;
    let maxConcurrent = 0;
    let runs = 0;
    let release: (() => void) | undefined;
    const scheduler = startScheduler(
      [
        {
          name: 'slow',
          intervalMs: 1000,
          run: async () => {
            runs += 1;
            running += 1;
            maxConcurrent = Math.max(maxConcurrent, running);
            await new Promise<void>(resolve => (release = resolve));
            running -= 1;
          },
        },
      ],
      silentLogger
    );
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(1);
    release?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(2);
    expect(maxConcurrent).toBe(1);
    scheduler.stop();
  });

  it('an interval of 0 runs the job once', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const scheduler = startScheduler(
      [{ name: 'once', intervalMs: 0, run: async () => void (runs += 1) }],
      silentLogger
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toBe(1);
    scheduler.stop();
  });
});
