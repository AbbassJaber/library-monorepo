import { describe, expect, it } from 'vitest';
import { SetFavoriteGenresBody } from './favorites.js';

describe('SetFavoriteGenresBody', () => {
  it('accepts an empty list and up to five unique genre ids in order', () => {
    expect(SetFavoriteGenresBody.parse({ genreIds: [] }).genreIds).toEqual([]);
    expect(SetFavoriteGenresBody.parse({ genreIds: [5, 1, 3] }).genreIds).toEqual([5, 1, 3]);
  });

  it('rejects six genres', () => {
    expect(SetFavoriteGenresBody.safeParse({ genreIds: [1, 2, 3, 4, 5, 6] }).success).toBe(false);
  });

  it('rejects duplicate ids', () => {
    expect(SetFavoriteGenresBody.safeParse({ genreIds: [1, 1] }).success).toBe(false);
  });
});
