import { apiPaths, BookStatus } from '@library/contracts';
import type { Book, BookListResponse, BooksQuery, BookSummary, Genre } from '@library/contracts';
import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { qk, staleTimes } from '@/lib/queryKeys';

export type CatalogQuery = Partial<BooksQuery>;

const toSearchParams = (query: CatalogQuery & { page?: number }): string => {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  for (const slug of query.genre ?? []) params.append('genre', slug);
  if (query.yearFrom !== undefined) params.set('yearFrom', String(query.yearFrom));
  if (query.yearTo !== undefined) params.set('yearTo', String(query.yearTo));
  for (const code of query.language ?? []) params.append('language', code);
  if (query.sort) params.set('sort', query.sort);
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.status !== undefined && query.status !== BookStatus.enum.active)
    params.set('status', query.status);
  const text = params.toString();
  return text ? `?${text}` : '';
};

const fetchBooks = (query: CatalogQuery & { page?: number }, signal: AbortSignal) =>
  api
    .get<BookListResponse>(`${apiPaths.books.list}${toSearchParams(query)}`, signal)
    .then(r => r.data);

export const booksListOptions = (query: CatalogQuery) =>
  queryOptions({
    queryKey: qk.books.list(query),
    queryFn: ({ signal }) => fetchBooks(query, signal),
    staleTime: staleTimes.booksList,
    placeholderData: keepPreviousData,
  });

export const booksInfiniteOptions = (query: Omit<CatalogQuery, 'page'>) =>
  infiniteQueryOptions({
    queryKey: qk.books.infinite(query),
    queryFn: ({ pageParam, signal }) => fetchBooks({ ...query, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: last =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    maxPages: 8,
    staleTime: staleTimes.booksList,
  });

export const newestOptions = queryOptions({
  queryKey: qk.books.newest,
  queryFn: ({ signal }) => api.get<BookSummary[]>(apiPaths.books.newest, signal).then(r => r.data),
  staleTime: staleTimes.newest,
});

export const genresOptions = (includeArchived = false) =>
  queryOptions({
    queryKey: qk.genres.list(includeArchived),
    queryFn: ({ signal }) =>
      api
        .get<Genre[]>(
          `${apiPaths.genres.list}${includeArchived ? '?includeArchived=true' : ''}`,
          signal
        )
        .then(r => r.data),
    staleTime: staleTimes.genres,
  });

export const bookDetailOptions = (id: number) =>
  queryOptions({
    queryKey: qk.books.detail(id),
    queryFn: ({ signal }) => api.get<Book>(apiPaths.books.detail(id), signal).then(r => r.data),
    staleTime: staleTimes.bookDetail,
  });

export const useGenres = (includeArchived = false) => useQuery(genresOptions(includeArchived));

export const usePrefetchBookDetail = (id: number) => {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void queryClient.prefetchQuery(bookDetailOptions(id));
    }, 120);
  }, [queryClient, id]);
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  return { start, cancel };
};
