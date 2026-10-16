import { apiPaths } from '@library/contracts';
import type { AuthResponse, LoginBody, RegisterBody, UserPublic } from '@library/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/lib/api';
import { qk, staleTimes } from '@/lib/queryKeys';

export const meOptions = queryOptions({
  queryKey: qk.auth.me,
  queryFn: async (): Promise<UserPublic | null> => {
    try {
      return (await api.get<UserPublic>(apiPaths.auth.me)).data;
    } catch (error) {
      if (isApiError(error) && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: staleTimes.me,
});

export const useMe = () => useQuery(meOptions);

export const useLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) => api.post<AuthResponse>(apiPaths.auth.login, body),
    onSuccess: res => queryClient.setQueryData(qk.auth.me, res.data.user),
  });
};

export const useRegister = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterBody) => api.post<AuthResponse>(apiPaths.auth.register, body),
    onSuccess: res => queryClient.setQueryData(qk.auth.me, res.data.user),
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(apiPaths.auth.logout),
    onSettled: () => {
      queryClient.setQueryData(qk.auth.me, null);
      queryClient.clear();
      queryClient.setQueryData(qk.auth.me, null);
    },
  });
};
