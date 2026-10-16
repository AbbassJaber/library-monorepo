import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BooksQuery, CreateBookBody, Isbn, UpdateBookBody } from './books.js';

describe('BooksQuery', () => {
  it('coerces query strings and applies the defaults', () => {
    const parsed = BooksQuery.parse({ page: '2', pageSize: '12', yearFrom: '1950' });
    expect(parsed).toMatchObject({ page: 2, pageSize: 12, yearFrom: 1950, status: 'active' });
    expect(parsed.sort).toBeUndefined();
  });

  it('defaults page to 1 and pageSize to 24', () => {
    expect(BooksQuery.parse({})).toMatchObject({ page: 1, pageSize: 24 });
  });

  it('rejects a pageSize above 48', () => {
    expect(BooksQuery.safeParse({ pageSize: '49' }).success).toBe(false);
  });

  it('rejects pageSize=0 and page=-1 with field-level issues', () => {
    const result = BooksQuery.safeParse({ pageSize: '0', page: '-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(issue => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['pageSize', 'page']));
    }
  });

  it('treats an empty q as absent and trims whitespace', () => {
    expect(BooksQuery.parse({ q: '' }).q).toBeUndefined();
    expect(BooksQuery.parse({ q: '  dune ' }).q).toBe('dune');
  });

  it('rejects a one-character q and a 500-character q', () => {
    expect(BooksQuery.safeParse({ q: 'a' }).success).toBe(false);
    expect(BooksQuery.safeParse({ q: 'a'.repeat(500) }).success).toBe(false);
  });

  it('accepts genre as a single slug or a repeated key and always yields an array', () => {
    expect(BooksQuery.parse({ genre: 'fantasy' }).genre).toEqual(['fantasy']);
    expect(BooksQuery.parse({ genre: ['fantasy', 'history'] }).genre).toEqual([
      'fantasy',
      'history',
    ]);
  });

  it('rejects yearFrom greater than yearTo', () => {
    const result = BooksQuery.safeParse({ yearFrom: '2000', yearTo: '1990' });
    expect(result.success).toBe(false);
  });

  it('only accepts the three sort values', () => {
    expect(BooksQuery.parse({ sort: 'rating' }).sort).toBe('rating');
    expect(BooksQuery.safeParse({ sort: 'price' }).success).toBe(false);
  });

  it('converts to a JSON Schema for the OpenAPI document', () => {
    expect(z.toJSONSchema(BooksQuery, { io: 'input' })).toMatchSnapshot();
  });
});

describe('Isbn', () => {
  it('normalises hyphens, spaces and a lowercase check digit', () => {
    expect(Isbn.parse('978-0-618-26030-0')).toBe('9780618260300');
    expect(Isbn.parse('0 618 26030 x')).toBe('061826030X');
    expect(Isbn.parse('ISBN 978-0-441-17271-9')).toBe('9780441172719');
    expect(Isbn.parse('isbn-13: 9780441172719')).toBe('9780441172719');
    expect(Isbn.parse('9780441172719isbn')).toBe('9780441172719');
    expect(Isbn.safeParse('978044117271x9').success).toBe(false);
  });

  it('rejects anything that is not 10 or 13 characters after normalisation', () => {
    expect(Isbn.safeParse('12345').success).toBe(false);
    expect(Isbn.safeParse('978061826030').success).toBe(false);
  });
});

describe('CreateBookBody', () => {
  const valid = {
    title: 'Dune',
    author: 'Frank Herbert',
    publishedYear: 1965,
    synopsis: 'A desert planet and the family sent to rule it.',
    rating: 4.5,
    genreIds: [1, 2],
  };

  it('accepts a valid body and normalises the isbn', () => {
    const parsed = CreateBookBody.parse({ ...valid, isbn: '978-0-441-17271-9' });
    expect(parsed.isbn).toBe('9780441172719');
  });

  it('rejects a year before 1000 or after next year', () => {
    expect(CreateBookBody.safeParse({ ...valid, publishedYear: 999 }).success).toBe(false);
    const tooLate = new Date().getFullYear() + 2;
    expect(CreateBookBody.safeParse({ ...valid, publishedYear: tooLate }).success).toBe(false);
  });

  it('rejects a rating outside 0–5 or with more than one decimal', () => {
    expect(CreateBookBody.safeParse({ ...valid, rating: 5.1 }).success).toBe(false);
    expect(CreateBookBody.safeParse({ ...valid, rating: 4.25 }).success).toBe(false);
    expect(CreateBookBody.safeParse({ ...valid, rating: -1 }).success).toBe(false);
  });

  it('requires between one and five genres', () => {
    expect(CreateBookBody.safeParse({ ...valid, genreIds: [] }).success).toBe(false);
    expect(CreateBookBody.safeParse({ ...valid, genreIds: [1, 2, 3, 4, 5, 6] }).success).toBe(
      false
    );
  });

  it('rejects unknown keys', () => {
    expect(CreateBookBody.safeParse({ ...valid, archivedAt: null }).success).toBe(false);
  });
});

describe('UpdateBookBody', () => {
  it('requires the version and allows a partial patch', () => {
    expect(UpdateBookBody.safeParse({ title: 'New' }).success).toBe(false);
    expect(UpdateBookBody.parse({ version: 3, title: 'New' })).toEqual({
      version: 3,
      title: 'New',
    });
  });
});
