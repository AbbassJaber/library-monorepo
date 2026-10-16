import { describe, expect, it } from 'vitest';
import { categoryOf, chooseCutoff, simulateCutoff, sweepCutoff } from './cutoff.js';
import type { CalibrationRow } from './cutoff.js';

const item = (id: number, lexical: number | null, semantic: number | null) => ({
  id,
  lexical,
  semantic,
});

const rows: CalibrationRow[] = [
  {
    id: 'd',
    kind: 'description',
    expected: [12],
    items: [item(12, null, 0.42), item(7, null, 0.3)],
  },
  { id: 't', kind: 'title', expected: [1], items: [item(1, 1, 0.2), item(9, null, 0.25)] },
  { id: 'n', kind: 'nonsense', expected: [], items: [item(5, null, 0.18), item(6, null, 0.15)] },
];

describe('categories', () => {
  it('groups the case kinds the report splits by', () => {
    expect(['author', 'title-fragment', 'translated-title', 'author-ar'].map(categoryOf)).toEqual(
      Array(4).fill('title/author')
    );
    expect(categoryOf('description')).toBe('description');
    expect(categoryOf('cross-lingual-fr')).toBe('cross-lingual');
    expect(categoryOf('paraphrase')).toBe('paraphrase');
    expect(categoryOf('near-duplicate')).toBe('near-duplicate');
    expect(categoryOf('nonsense')).toBe('nonsense');
  });
});

describe('similarity cutoff', () => {
  it('drops semantic hits below the cutoff and re-fuses what is left', () => {
    expect(simulateCutoff(rows[0]!, 0.4)).toEqual([12]);
    expect(simulateCutoff(rows[0]!, 0.5)).toEqual([]);
    expect(simulateCutoff(rows[1]!, 0.9)).toEqual([1]);
    expect(simulateCutoff(rows[2]!, 0.2)).toEqual([]);
  });

  it('sweeps thresholds: recall on real queries, empty answers on nonsense, precision of non-empty answers', () => {
    const sweep = sweepCutoff(rows, [0, 0.2, 0.3, 0.45]);
    expect(sweep.map(s => [s.threshold, s.realRecall, s.nonsenseEmpty])).toEqual([
      [0, 1, 0],
      [0.2, 1, 1],
      [0.3, 1, 1],
      [0.45, 0.5, 1],
    ]);
    expect(sweep[0]!.precision).toBeCloseTo(2 / 3);
    expect(sweep[1]!.precision).toBe(1);
  });

  it('chooses the middle of the range that keeps full real recall and empties nonsense', () => {
    const sweep = sweepCutoff(rows, [0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45]);
    expect(chooseCutoff(sweep)).toMatchObject({ threshold: 0.3, range: [0.2, 0.4] });
  });
});

describe('cutoff with required cases', () => {
  it('only picks thresholds that empty nonsense and keep every must-pass case, least real-recall loss first', () => {
    const rows: CalibrationRow[] = [
      { id: 'dune', kind: 'description', expected: [12], items: [item(12, null, 0.2)] },
      { id: 'weak', kind: 'cross-lingual-fr', expected: [55], items: [item(55, null, 0.12)] },
      { id: 'strong', kind: 'paraphrase', expected: [18], items: [item(18, null, 0.5)] },
      { id: 'n', kind: 'nonsense', expected: [], items: [item(5, null, 0.15)] },
    ];
    const sweep = sweepCutoff(rows, [0, 0.1, 0.13, 0.16, 0.18, 0.21]);
    expect(sweep[2]!.passing).toEqual(['dune', 'strong']);
    expect(chooseCutoff(sweep, { mustPass: ['dune'] })).toMatchObject({
      threshold: 0.16,
      range: [0.16, 0.18],
    });
    const impossible = sweepCutoff(
      [
        ...rows.slice(0, 3),
        { id: 'n2', kind: 'nonsense', expected: [], items: [item(6, null, 0.3)] },
      ],
      [0, 0.1, 0.2, 0.31]
    );
    expect(chooseCutoff(impossible, { mustPass: ['dune'] })).toBeNull();
  });
});
