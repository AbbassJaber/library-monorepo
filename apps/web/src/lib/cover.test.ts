import { domain } from '@library/domain-config';
import { describe, expect, it } from 'vitest';
import { COVER_SHAPES, coverDesign, coverTitleSize, coverVars } from './cover';

const titles = Array.from({ length: 400 }, (_, i) => `Book title ${i}`);

describe('coverDesign', () => {
  it('is deterministic per title and uses the domain palette', () => {
    const dune = coverDesign('Dune');
    expect(coverDesign('Dune')).toEqual(dune);
    expect(domain.cover.palette).toContainEqual([dune.bg, dune.text, dune.accent, dune.stage]);
    expect(COVER_SHAPES).toContain(dune.shape);
  });

  it('keeps the colors a title had before the redesign (same palette hash)', () => {
    let h = 2166136261;
    for (const char of 'Dune') h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    const expected = domain.cover.palette[Math.abs(h) % domain.cover.palette.length];
    expect([coverDesign('Dune').bg, coverDesign('Dune').text]).toEqual(expected?.slice(0, 2));
  });

  it('uses every shape and every palette entry, and picks them independently', () => {
    const designs = titles.map(coverDesign);
    expect(new Set(designs.map(d => d.shape)).size).toBe(COVER_SHAPES.length);
    expect(new Set(designs.map(d => d.bg)).size).toBe(domain.cover.palette.length);
    const firstBg = designs[0]?.bg;
    const shapesForBg = new Set(designs.filter(d => d.bg === firstBg).map(d => d.shape));
    expect(shapesForBg.size).toBeGreaterThan(1);
  });

  it('exposes the colors as CSS variables, stage included', () => {
    const { bg, text, accent, stage } = coverDesign('Piranesi');
    expect(coverVars('Piranesi')).toEqual({
      '--cover-bg': bg,
      '--cover-text': text,
      '--cover-accent': accent,
      '--cover-stage': stage,
    });
  });
});

describe('coverTitleSize', () => {
  it('keeps the standard size for ordinary titles and shrinks for a long word', () => {
    expect(coverTitleSize('The Hobbit')).toBe(12.5);
    expect(coverTitleSize('Slaughterhouse-Five')).toBeLessThan(12.5);
    expect(coverTitleSize('Slaughterhouse-Five')).toBeCloseTo(80 / (15 * 0.62));
  });
});
