export interface ThrottlePolicy {
  throttleRetries: number;
  backoffMs: number;
}

export const DEFAULT_THROTTLE: ThrottlePolicy = { throttleRetries: 6, backoffMs: 5000 };
export const isThrottle = (message: string) => /\b429\b|too many requests|throttl/i.test(message);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const retryThrottled = async <T>(
  attempt: () => Promise<T>,
  policy: ThrottlePolicy = DEFAULT_THROTTLE
): Promise<{ value: T; retries: number }> => {
  for (let retries = 0; ; retries += 1) {
    try {
      return { value: await attempt(), retries };
    } catch (error) {
      const message = String((error as Error).message);
      if (!isThrottle(message) || retries >= policy.throttleRetries)
        throw Object.assign(error instanceof Error ? error : new Error(message), { retries });
      await sleep(Math.min(60_000, policy.backoffMs * 2 ** retries));
    }
  }
};
