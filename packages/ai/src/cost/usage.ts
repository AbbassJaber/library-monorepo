import type { Usage } from '../providers/types.js';
import { priceFor } from './pricing.js';

export const costUsd = (model: string, usage: Usage): number => {
  const { price } = priceFor(model);
  const uncached = Math.max(0, usage.tokensIn - usage.tokensCachedRead - usage.tokensCachedWrite);
  const dollars =
    (uncached * price.inputPerMTok +
      usage.tokensCachedRead * price.cacheReadPerMTok +
      usage.tokensCachedWrite * price.cacheWritePerMTok +
      usage.tokensOut * price.outputPerMTok) /
    1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
};

export const estimateCostUsd = (
  model: string,
  budget: { maxInputTokens: number; maxOutputTokens: number }
): number =>
  costUsd(model, {
    tokensIn: budget.maxInputTokens,
    tokensOut: budget.maxOutputTokens,
    tokensCachedRead: 0,
    tokensCachedWrite: 0,
  });

export const embeddingCostUsd = (model: string, tokens: number): number =>
  costUsd(model, { tokensIn: tokens, tokensOut: 0, tokensCachedRead: 0, tokensCachedWrite: 0 });
