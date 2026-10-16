import { z } from 'zod';
import { BookSummary } from './books.js';
import { Id, IsoDate, ReadingState } from './common.js';
import { VALIDATION_CODES } from './constants.js';

export const ReadingListEntry = z
  .object({
    id: Id,
    state: ReadingState,
    book: BookSummary,
    available: z.boolean(),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .meta({ id: 'ReadingListEntry' });
export type ReadingListEntry = z.infer<typeof ReadingListEntry>;

export const ShelfResponse = z.array(ReadingListEntry);
export type ShelfResponse = z.infer<typeof ShelfResponse>;

export const AddToShelfBody = z
  .strictObject({
    bookId: Id,
    state: ReadingState.default(ReadingState.enum.WANT_TO_READ),
  })
  .meta({ id: 'AddToShelfBody' });
export type AddToShelfBody = z.infer<typeof AddToShelfBody>;

export const UpdateReadingStateBody = z
  .strictObject({ state: ReadingState })
  .meta({ id: 'UpdateReadingStateBody' });
export type UpdateReadingStateBody = z.infer<typeof UpdateReadingStateBody>;

export const READING_LIST_BATCH_MAX = 10;

export const ReadingListChange = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('remove'), bookId: Id }),
  z.strictObject({ action: z.literal('setState'), bookId: Id, state: ReadingState }),
]);
export type ReadingListChange = z.infer<typeof ReadingListChange>;

export const ReadingListBatchBody = z
  .strictObject({
    changes: z
      .array(ReadingListChange)
      .min(1)
      .max(READING_LIST_BATCH_MAX)
      .refine(changes => new Set(changes.map(c => c.bookId)).size === changes.length, {
        message: VALIDATION_CODES.batchDuplicate,
      }),
  })
  .meta({ id: 'ReadingListBatchBody' });
export type ReadingListBatchBody = z.infer<typeof ReadingListBatchBody>;

export const ReadingListBatchResponse = z
  .object({
    removed: z.array(Id),
    updated: z.array(ReadingListEntry),
  })
  .meta({ id: 'ReadingListBatchResponse' });
export type ReadingListBatchResponse = z.infer<typeof ReadingListBatchResponse>;
