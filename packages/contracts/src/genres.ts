import { z } from 'zod';
import { VALIDATION_CODES } from './constants.js';
import { Id, IsoDate, emptyToUndefined } from './common.js';

export const GenreSlug = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, VALIDATION_CODES.genreSlug);
export type GenreSlug = z.infer<typeof GenreSlug>;

export const GenreRef = z
  .object({
    id: Id,
    name: z.string(),
    slug: GenreSlug,
  })
  .meta({ id: 'GenreRef' });
export type GenreRef = z.infer<typeof GenreRef>;

export const Genre = z
  .object({
    id: Id,
    name: z.string(),
    slug: GenreSlug,
    archivedAt: IsoDate.nullable(),
    activeBookCount: z.number().int().min(0),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .meta({ id: 'Genre' });
export type Genre = z.infer<typeof Genre>;

export const GenreListQuery = z.object({
  includeArchived: z.preprocess(
    emptyToUndefined,
    z
      .enum(['true', 'false'])
      .transform(value => value === 'true')
      .default(false)
  ),
});
export type GenreListQuery = z.infer<typeof GenreListQuery>;

export const GenreListResponse = z.array(Genre);
export type GenreListResponse = z.infer<typeof GenreListResponse>;

const GenreName = z.string().trim().min(1).max(60);

export const CreateGenreBody = z.strictObject({ name: GenreName }).meta({ id: 'CreateGenreBody' });
export type CreateGenreBody = z.infer<typeof CreateGenreBody>;

export const UpdateGenreBody = z.strictObject({ name: GenreName }).meta({ id: 'UpdateGenreBody' });
export type UpdateGenreBody = z.infer<typeof UpdateGenreBody>;

export const GenreInUseDetails = z
  .object({
    genreId: Id,
    books: z.array(z.object({ id: Id, title: z.string() })),
  })
  .meta({ id: 'GenreInUseDetails' });
export type GenreInUseDetails = z.infer<typeof GenreInUseDetails>;
