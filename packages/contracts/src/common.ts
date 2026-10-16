import { z } from 'zod';

export const Id = z.number().int().positive();
export type Id = z.infer<typeof Id>;

export const IsoDate = z.iso.datetime();
export type IsoDate = z.infer<typeof IsoDate>;

export const Role = z.enum(['READER', 'LIBRARIAN']);
export type Role = z.infer<typeof Role>;

export const ReadingState = z.enum(['WANT_TO_READ', 'READING', 'FINISHED']);
export type ReadingState = z.infer<typeof ReadingState>;

export const PAGE_SIZE_DEFAULT = 24;
export const PAGE_SIZE_MAX = 48;

export const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const listFromQuery = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }
  return value;
};

export const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());

export const PageQuery = z.object({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT)
  ),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const PaginationMeta = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .meta({ id: 'PaginationMeta' });
export type PaginationMeta = z.infer<typeof PaginationMeta>;

export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'GENRE_IN_USE',
  'BOOK_ARCHIVED',
  'EMAIL_TAKEN',
  'ISBN_TAKEN',
  'RATE_LIMITED',
  'AI_UNAVAILABLE',
  'CONFIRM_TOKEN_INVALID',
  'ACTION_ALREADY_DECIDED',
  'NOT_READY',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z
  .object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  })
  .meta({ id: 'ApiError' });
export type ApiError = z.infer<typeof ApiError>;

export const ErrorEnvelope = z.object({ error: ApiError }).meta({ id: 'ErrorEnvelope' });
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
export type Envelope<T> = { data: T; meta?: Record<string, unknown> };

export const PagedEnvelope = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: PaginationMeta,
  });
export type Paged<T> = { data: T[]; meta: PaginationMeta };
