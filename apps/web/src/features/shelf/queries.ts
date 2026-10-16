import { apiPaths } from '@library/contracts';
import type { ReadingListEntry, ReadingState } from '@library/contracts';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useMe } from '@/features/auth/queries';
import { api } from '@/lib/api';
import { qk, staleTimes } from '@/lib/queryKeys';

export const shelfOptions = queryOptions({
  queryKey: qk.shelf.list,
  queryFn: ({ signal }) =>
    api.get<ReadingListEntry[]>(apiPaths.readingList.list, signal).then(r => r.data),
  staleTime: staleTimes.shelf,
});

export const useShelf = () => {
  const me = useMe();
  return useQuery({ ...shelfOptions, enabled: Boolean(me.data) });
};

export const useShelfIds = (): ReadonlySet<number> => {
  const shelf = useShelf();
  return useMemo(() => new Set((shelf.data ?? []).map(entry => entry.book.id)), [shelf.data]);
};

export const useShelfStateOf = (): ((bookId: number) => ReadingState | undefined) => {
  const shelf = useShelf();
  const states = useMemo(
    () => new Map((shelf.data ?? []).map(entry => [entry.book.id, entry.state] as const)),
    [shelf.data]
  );
  return useCallback(bookId => states.get(bookId), [states]);
};
