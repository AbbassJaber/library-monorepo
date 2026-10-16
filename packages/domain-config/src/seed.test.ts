import { describe, expect, it } from 'vitest';
import { seedBooks, seedGenres } from './seed.js';

describe('seed catalog', () => {
  it('holds 120 books: 93 English, 13 Arabic, 14 French', () => {
    expect(seedBooks).toHaveLength(120);
    const byLanguage = seedBooks.reduce<Record<string, number>>((acc, book) => {
      acc[book.language] = (acc[book.language] ?? 0) + 1;
      return acc;
    }, {});
    expect(byLanguage).toEqual({ en: 93, ar: 13, fr: 14 });
  });

  it('only uses the twelve seed genre slugs and gives every book 1–5 genres', () => {
    const slugs = new Set(seedGenres.map(genre => genre.slug));
    for (const book of seedBooks) {
      expect(book.genres.length).toBeGreaterThanOrEqual(1);
      expect(book.genres.length).toBeLessThanOrEqual(5);
      for (const slug of book.genres) expect(slugs.has(slug), `${book.title}: ${slug}`).toBe(true);
    }
  });

  it('has unique titles and unique ISBNs', () => {
    expect(new Set(seedBooks.map(book => book.title)).size).toBe(seedBooks.length);
    const isbns = seedBooks
      .map(book => book.isbn)
      .filter((isbn): isbn is string => isbn !== undefined);
    expect(new Set(isbns).size).toBe(isbns.length);
  });

  it('keeps ratings within 0–5 with one decimal and years within the contract bounds', () => {
    for (const book of seedBooks) {
      expect(book.rating).toBeGreaterThanOrEqual(0);
      expect(book.rating).toBeLessThanOrEqual(5);
      expect(Math.round(book.rating * 10) / 10).toBe(book.rating);
      expect(book.year).toBeGreaterThanOrEqual(1000);
      expect(book.year).toBeLessThanOrEqual(new Date().getFullYear());
    }
  });
});

describe('seed genre balance', () => {
  it('lets no genre exceed 25% of the catalog', () => {
    const counts = new Map<string, number>();
    for (const book of seedBooks) {
      for (const slug of book.genres) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of counts) {
      expect(count / seedBooks.length, slug).toBeLessThanOrEqual(0.25);
    }
  });
});
