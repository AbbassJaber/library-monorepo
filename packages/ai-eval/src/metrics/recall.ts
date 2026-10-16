export const recallAtK = (expected: number[], ranked: number[], k: number): number => {
  if (expected.length === 0) return 1;
  const top = new Set(ranked.slice(0, k));
  return expected.filter(id => top.has(id)).length / expected.length;
};

export const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
