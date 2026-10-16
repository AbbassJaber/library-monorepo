const round = (value: number) => Math.round(value * 1e8) / 1e8;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const costSummary = (calls: Array<{ costUsd: number; tokensCachedWrite: number }>) => {
  const total = calls.reduce((sum, call) => sum + call.costUsd, 0);
  const writes = calls.filter(call => call.tokensCachedWrite > 0).map(call => call.costUsd);
  const others = calls.filter(call => call.tokensCachedWrite === 0).map(call => call.costUsd);
  return {
    total: round(total),
    perQuery: round(calls.length === 0 ? 0 : total / calls.length),
    cacheWrite: writes.length === 0 ? null : round(median(writes)),
    cacheWrites: writes.length,
    steady: round(median(others)),
  };
};

export const breakEvenCalls = (
  padded: { cacheWrite: number | null; steady: number },
  compact: number
): number | null | undefined => {
  if (padded.steady >= compact) return null;
  if (padded.cacheWrite === null) return undefined;
  return Math.max(1, Math.ceil((padded.cacheWrite - padded.steady) / (compact - padded.steady)));
};
