import type { Logger } from './logger.js';

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  report?: (result: unknown) => boolean;
}

export const startScheduler = (jobs: ScheduledJob[], logger: Logger): { stop: () => void } => {
  const timers: NodeJS.Timeout[] = [];
  const running = new Set<string>();
  const execute = async (job: ScheduledJob) => {
    if (running.has(job.name)) return;
    running.add(job.name);
    try {
      const result = await job.run();
      if (job.report?.(result) ?? true) logger.info('job finished', { job: job.name, result });
    } catch (error) {
      logger.error('job failed', {
        job: job.name,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running.delete(job.name);
    }
  };
  for (const job of jobs) {
    void execute(job);
    if (job.intervalMs <= 0) continue;
    const timer = setInterval(() => void execute(job), job.intervalMs);
    timer.unref();
    timers.push(timer);
  }
  return { stop: () => timers.forEach(clearInterval) };
};
