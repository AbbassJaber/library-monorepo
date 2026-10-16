import { apiPaths } from '@library/contracts';
import type { FavoritesResponse } from '@library/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, staleTimes } from '@/lib/queryKeys';

export const favoritesOptions = queryOptions({
  queryKey: qk.favorites.list,
  queryFn: ({ signal }) =>
    api.get<FavoritesResponse>(apiPaths.favoriteGenres, signal).then(r => r.data),
  staleTime: staleTimes.favorites,
});

export const useFavorites = () => useQuery(favoritesOptions);

export const useSetFavorites = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (genreIds: number[]) =>
      api.put<FavoritesResponse>(apiPaths.favoriteGenres, { genreIds }).then(r => r.data),
    onSuccess: data => {
      queryClient.setQueryData(qk.favorites.list, data);
      void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });
    },
  });
};
