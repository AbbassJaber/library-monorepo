import { reciprocalRankFusion } from '@library/ai';
import { mean, recallAtK } from './recall.js';

export const RETRIEVAL_CATEGORIES = [
  'title/author',
  'description',
  'cross-lingual',
  'paraphrase',
  'near-duplicate',
  'nonsense',
] as const;
export type RetrievalCategory = (typeof RETRIEVAL_CATEGORIES)[number];

export const categoryOf = (kind: string): RetrievalCategory =>
  kind === 'nonsense'
    ? 'nonsense'
    : kind.startsWith('cross-lingual')
      ? 'cross-lingual'
      : kind === 'paraphrase'
        ? 'paraphrase'
        : kind === 'near-duplicate'
          ? 'near-duplicate'
          : kind.startsWith('description')
            ? 'description'
            : 'title/author';

export const caseScore = (expected: number[], top: number[], k: number): number =>
  expected.length === 0 ? (top.length === 0 ? 1 : 0) : recallAtK(expected, top, k);

export interface CalibrationRow {
  id: string;
  kind: string;
  expected: number[];
  items: Array<{ id: number; lexical: number | null; semantic: number | null }>;
}

const TOP = 5;

export const simulateCutoff = (row: CalibrationRow, threshold: number): number[] => {
  const lexical = row.items
    .filter(item => item.lexical !== null)
    .sort((a, b) => a.lexical! - b.lexical!)
    .map(item => item.id);
  const semantic = row.items
    .filter(item => item.semantic !== null && item.semantic >= threshold)
    .sort((a, b) => b.semantic! - a.semantic!)
    .map(item => item.id);
  return reciprocalRankFusion([lexical, semantic])
    .slice(0, TOP)
    .map(entry => entry.id);
};

export interface SweepPoint {
  threshold: number;
  realRecall: number;
  nonsenseEmpty: number;
  precision: number;
  byCategory: Partial<Record<RetrievalCategory, number>>;
  passing: string[];
}

export const sweepCutoff = (rows: CalibrationRow[], thresholds: number[]): SweepPoint[] =>
  thresholds.map(threshold => {
    const results = rows.map(row => ({ row, top: simulateCutoff(row, threshold) }));
    const real = results.filter(r => r.row.expected.length > 0);
    const nonsense = results.filter(r => r.row.expected.length === 0);
    const answered = results.filter(r => r.top.length > 0);
    const byCategory: Partial<Record<RetrievalCategory, number>> = {};
    for (const category of RETRIEVAL_CATEGORIES) {
      const of = results.filter(r => categoryOf(r.row.kind) === category);
      if (of.length > 0)
        byCategory[category] = mean(of.map(r => caseScore(r.row.expected, r.top, TOP)));
    }
    return {
      threshold,
      realRecall: mean(real.map(r => recallAtK(r.row.expected, r.top, TOP))),
      nonsenseEmpty: mean(nonsense.map(r => (r.top.length === 0 ? 1 : 0))),
      precision:
        answered.length === 0
          ? 1
          : answered.filter(r => r.row.expected.length > 0).length / answered.length,
      byCategory,
      passing: real.filter(r => recallAtK(r.row.expected, r.top, TOP) >= 1).map(r => r.row.id),
    };
  });

export const chooseCutoff = (
  sweep: SweepPoint[],
  options: { mustPass?: string[] } = {}
): { threshold: number; range: [number, number]; point: SweepPoint } | null => {
  const sorted = [...sweep].sort((a, b) => a.threshold - b.threshold);
  const pick = (feasible: SweepPoint[]) => {
    const middle = feasible[Math.floor((feasible.length - 1) / 2)]!;
    return {
      threshold: middle.threshold,
      range: [feasible[0]!.threshold, feasible[feasible.length - 1]!.threshold] as [number, number],
      point: middle,
    };
  };
  if (options.mustPass) {
    const required = options.mustPass;
    const candidates = sorted.filter(
      point => point.nonsenseEmpty >= 1 && required.every(id => point.passing.includes(id))
    );
    if (candidates.length === 0) return null;
    const best = Math.max(...candidates.map(point => point.realRecall));
    return pick(candidates.filter(point => point.realRecall >= best - 1e-9));
  }
  const baseline = sorted[0]?.realRecall ?? 0;
  const keeping = sorted.filter(point => point.realRecall >= baseline - 1e-9);
  if (keeping.length === 0) return null;
  const most = Math.max(...keeping.map(point => point.nonsenseEmpty));
  return pick(keeping.filter(point => point.nonsenseEmpty === most));
};
