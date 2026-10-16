import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: true,
        throwOnError: false,
      },
      mutations: { retry: 0 },
    },
  });
