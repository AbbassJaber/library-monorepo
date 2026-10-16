export const onlyAllowed = <T>(
  values: readonly T[],
  allowed: Iterable<T>
): { kept: T[]; dropped: T[] } => {
  const set = new Set(allowed);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const value of values) (set.has(value) ? kept : dropped).push(value);
  return { kept, dropped };
};

export const isPermutationSubset = <T>(order: readonly T[], candidates: Iterable<T>): boolean => {
  const set = new Set(candidates);
  const seen = new Set<T>();
  for (const value of order) {
    if (!set.has(value) || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
};
