import { describe, expect, it } from 'vitest';
import { shelfMark } from './shelfMark';

describe('shelfMark', () => {
  it('takes three letters of the family name', () => {
    expect(shelfMark('J. R. R. Tolkien')).toBe('FIC TOL');
    expect(shelfMark('Frank Herbert')).toBe('FIC HER');
  });

  it('files a capitalized particle with the name and skips a lowercase one', () => {
    expect(shelfMark('Ursula K. Le Guin')).toBe('FIC LEG');
    expect(shelfMark('Antoine de Saint-Exupéry')).toBe('FIC SAI');
  });

  it('drops accents and punctuation, and copes with short or missing names', () => {
    expect(shelfMark('Émile Zola')).toBe('FIC ZOL');
    expect(shelfMark("Flannery O'Connor")).toBe('FIC OCO');
    expect(shelfMark('Wu')).toBe('FIC WU');
    expect(shelfMark('  ')).toBe('FIC');
  });

  it('keeps non-Latin letters as they are', () => {
    expect(shelfMark('أحمد سعداوي')).toBe('FIC سعد');
  });
});
