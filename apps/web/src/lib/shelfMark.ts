export const SHELF_MARK_CLASS = 'FIC';
const SHELF_MARK_LETTERS = 3;
const FILING_PARTICLES = new Set(['Le', 'La', 'De', 'Du', 'Di', 'Da', 'Del', 'Van', 'Von', 'Mac']);

export const shelfMark = (author: string): string => {
  const words = author.trim().split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? '';
  const before = words.at(-2);
  const family = before && FILING_PARTICLES.has(before) ? `${before}${last}` : last;
  const letters = family
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}]/gu, '')
    .slice(0, SHELF_MARK_LETTERS)
    .toLocaleUpperCase('en');
  return letters ? `${SHELF_MARK_CLASS} ${letters}` : SHELF_MARK_CLASS;
};
