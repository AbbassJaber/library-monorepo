import { apiPaths } from '@library/contracts';
import type { Book, CreateBookBody, Genre, UpdateBookBody } from '@library/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';

const afterBookWrite = (queryClient: QueryClient, book: Book) => {
  queryClient.setQueryData(qk.books.detail(book.id), book);
  void queryClient.invalidateQueries({ queryKey: qk.books.lists });
  void queryClient.invalidateQueries({ queryKey: qk.books.infinites });
  void queryClient.invalidateQueries({ queryKey: qk.books.newest });
  void queryClient.invalidateQueries({ queryKey: qk.genres.all });
  void queryClient.invalidateQueries({ queryKey: qk.shelf.list });
  void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });
};

const afterGenreWrite = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: qk.genres.all });
  void queryClient.invalidateQueries({ queryKey: qk.books.all });
  void queryClient.invalidateQueries({ queryKey: qk.favorites.list });
  void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });
};

export const useCreateBook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBookBody) =>
      api.post<Book>(apiPaths.books.list, body).then(r => r.data),
    onSuccess: book => afterBookWrite(queryClient, book),
  });
};

export const useUpdateBook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateBookBody }) =>
      api.patch<Book>(apiPaths.books.detail(id), body).then(r => r.data),
    onSuccess: book => afterBookWrite(queryClient, book),
  });
};

export const useArchiveBook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, restore }: { id: number; version: number; restore?: boolean }) =>
      api
        .post<Book>(`/books/${id}/${restore ? 'restore' : 'archive'}`, { version })
        .then(r => r.data),
    onSuccess: book => afterBookWrite(queryClient, book),
  });
};

export const useCreateGenre = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Genre>(apiPaths.genres.list, { name }).then(r => r.data),
    onSuccess: () => afterGenreWrite(queryClient),
  });
};

export const useRenameGenre = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch<Genre>(apiPaths.genres.detail(id), { name }).then(r => r.data),
    onSuccess: () => afterGenreWrite(queryClient),
  });
};

export const useArchiveGenre = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restore }: { id: number; restore?: boolean }) =>
      api
        .post<Genre>(restore ? apiPaths.genres.restore(id) : apiPaths.genres.archive(id))
        .then(r => r.data),
    onSuccess: () => afterGenreWrite(queryClient),
  });
};
