import { apiPaths, ReadingState } from '@library/contracts';
import type { BookSummary, ReadingListEntry } from '@library/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/i18n/errors';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/stores/uiStore';

type Shelf = ReadingListEntry[];

const useOptimisticShelf = <TVars>(
  mutationFn: (vars: TVars) => Promise<unknown>,
  apply: (shelf: Shelf, vars: TVars) => Shelf
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: qk.shelf.list });
      const previous = queryClient.getQueryData<Shelf>(qk.shelf.list);
      queryClient.setQueryData<Shelf>(qk.shelf.list, shelf => apply(shelf ?? [], vars));
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(qk.shelf.list, context.previous);
      toast(describeError(error), 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.shelf.list });
      void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });
    },
  });
};

export const useAddToShelf = () =>
  useOptimisticShelf<{ book: BookSummary; state?: ReadingState }>(
    ({ book, state }) =>
      api.post<ReadingListEntry>(apiPaths.readingList.list, {
        bookId: book.id,
        ...(state ? { state } : {}),
      }),
    (shelf, { book, state }) =>
      shelf.some(entry => entry.book.id === book.id)
        ? shelf
        : [
            {
              id: -book.id,
              state: state ?? ReadingState.enum.WANT_TO_READ,
              book,
              available: book.archivedAt === null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...shelf,
          ]
  );

export const useUpdateReadingState = () =>
  useOptimisticShelf<{ bookId: number; state: ReadingState }>(
    ({ bookId, state }) =>
      api.patch<ReadingListEntry>(apiPaths.readingList.entry(bookId), { state }),
    (shelf, { bookId, state }) =>
      shelf.map(entry => (entry.book.id === bookId ? { ...entry, state } : entry))
  );

export const useRemoveFromShelf = () =>
  useOptimisticShelf<{ bookId: number }>(
    ({ bookId }) => api.delete(apiPaths.readingList.entry(bookId)),
    (shelf, { bookId }) => shelf.filter(entry => entry.book.id !== bookId)
  );
