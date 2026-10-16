import { z } from 'zod';
import { VALIDATION_CODES } from './constants.js';
import { Id } from './common.js';
import { GenreRef } from './genres.js';

export const FAVORITE_GENRES_MAX = 5;

export const FavoriteGenre = z
  .object({
    genre: GenreRef,
    position: z
      .number()
      .int()
      .min(0)
      .max(FAVORITE_GENRES_MAX - 1),
  })
  .meta({ id: 'FavoriteGenre' });
export type FavoriteGenre = z.infer<typeof FavoriteGenre>;

export const FavoritesResponse = z.array(FavoriteGenre);
export type FavoritesResponse = z.infer<typeof FavoritesResponse>;

export const SetFavoriteGenresBody = z
  .strictObject({
    genreIds: z
      .array(Id)
      .max(FAVORITE_GENRES_MAX)
      .refine(ids => new Set(ids).size === ids.length, {
        message: VALIDATION_CODES.favoritesDuplicate,
      }),
  })
  .meta({ id: 'SetFavoriteGenresBody' });
export type SetFavoriteGenresBody = z.infer<typeof SetFavoriteGenresBody>;
