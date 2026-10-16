import { BUDGETS, estimateCostUsd, priceFor } from '@library/ai';
import type { AiFeature } from '@library/contracts';
import { AiProviderName } from '@library/contracts';

export const DEFAULT_MAX_COST_USD = 3;

export interface Estimate {
  model: string;
  calls: number;
  perCallUsd: number;
  totalUsd: number;
  priced: boolean;
}

export const estimateRun = (model: string, feature: AiFeature, calls: number): Estimate => {
  const budget = BUDGETS[feature];
  const perCallUsd = estimateCostUsd(model, budget) * 2;
  return {
    model,
    calls,
    perCallUsd,
    totalUsd: Math.round(perCallUsd * calls * 1e6) / 1e6,
    priced: priceFor(model).known,
  };
};

export type BudgetVerdict = { ok: true } | { ok: false; reason: string };

export const checkBudget = (
  estimate: Estimate,
  provider: string,
  maxUsd: number
): BudgetVerdict => {
  if (provider === AiProviderName.enum.mock) return { ok: true };
  if (!estimate.priced)
    return {
      ok: false,
      reason: `no price for model "${estimate.model}" in packages/ai/src/cost/pricing.ts — refusing to run blind`,
    };
  if (estimate.totalUsd > maxUsd)
    return {
      ok: false,
      reason: `estimated $${estimate.totalUsd.toFixed(4)} exceeds EVAL_MAX_COST_USD=$${maxUsd}`,
    };
  return { ok: true };
};
