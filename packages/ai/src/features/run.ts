import type { AiFeature, AiMeta } from '@library/contracts';
import { BUDGETS } from '../cost/budgets.js';
import { costUsd } from '../cost/usage.js';
import type { Actor, TracePort } from '../ports/index.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { GenerateResult, LlmProvider, Tier } from '../providers/types.js';
import { ApiErrorCode } from '@library/contracts';

export interface RunContext {
  feature: AiFeature;
  llm: LlmProvider;
  trace: TracePort;
  actor: Actor | null;
  requestId: string | null;
  tier?: Tier;
}

export interface RunOutcome<T> {
  value: T;
  meta: AiMeta;
}

export const withTimeout = async <T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new ProviderUnavailableError(`timed out after ${timeoutMs} ms`))
        )
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const sumUsage = (attempts: GenerateResult[]) =>
  attempts.reduce(
    (acc, attempt) => ({
      tokensIn: acc.tokensIn + attempt.usage.tokensIn,
      tokensOut: acc.tokensOut + attempt.usage.tokensOut,
      tokensCachedRead: acc.tokensCachedRead + attempt.usage.tokensCachedRead,
      tokensCachedWrite: acc.tokensCachedWrite + attempt.usage.tokensCachedWrite,
      latencyMs: acc.latencyMs + attempt.latencyMs,
      costUsd: acc.costUsd + costUsd(attempt.model, attempt.usage),
    }),
    {
      tokensIn: 0,
      tokensOut: 0,
      tokensCachedRead: 0,
      tokensCachedWrite: 0,
      latencyMs: 0,
      costUsd: 0,
    }
  );

export const runFeature = async <T>(
  ctx: RunContext,
  fn: (
    signal: AbortSignal
  ) => Promise<{ value: T; attempts: GenerateResult[]; fallbackUsed: boolean }>
): Promise<RunOutcome<T>> => {
  const budget = BUDGETS[ctx.feature];
  const started = Date.now();
  const tier = ctx.llm.tiers[ctx.tier ?? budget.tier];
  const model = tier.model;
  const base = {
    userId: ctx.actor?.id ?? null,
    feature: ctx.feature,
    requestId: ctx.requestId,
  };
  try {
    const { value, attempts, fallbackUsed } = await withTimeout(budget.timeoutMs, fn);
    const usage = sumUsage(attempts);
    const usedModel = attempts[0]?.model ?? model;
    const provider = attempts[0]?.provider ?? tier.provider;
    const runId = await ctx.trace.record({
      ...base,
      provider,
      model: usedModel,
      ...usage,
      latencyMs: Date.now() - started,
      success: true,
      fallbackUsed,
      errorCode: null,
    });
    return {
      value,
      meta: {
        runId,
        feature: ctx.feature,
        provider,
        model: usedModel,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        tokensCachedRead: usage.tokensCachedRead,
        tokensCachedWrite: usage.tokensCachedWrite,
        costUsd: usage.costUsd,
        latencyMs: Date.now() - started,
        fallbackUsed,
      },
    };
  } catch (error) {
    const code =
      error instanceof ProviderUnavailableError
        ? ApiErrorCode.enum.AI_UNAVAILABLE
        : ApiErrorCode.enum.INTERNAL;
    await ctx.trace.record({
      ...base,
      provider: tier.provider,
      model,
      tokensIn: 0,
      tokensOut: 0,
      tokensCachedRead: 0,
      tokensCachedWrite: 0,
      costUsd: 0,
      latencyMs: Date.now() - started,
      success: false,
      fallbackUsed: false,
      errorCode: code,
    });
    throw error instanceof ProviderUnavailableError
      ? error
      : new ProviderUnavailableError(String((error as Error).message), error);
  }
};
