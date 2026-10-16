import { queryOptions, useQuery } from '@tanstack/react-query';
import { qk, staleTimes } from '@/lib/queryKeys';
import { fetchAiStatus } from './api';

export const aiStatusOptions = queryOptions({
  queryKey: qk.ai.status,
  queryFn: ({ signal }) => fetchAiStatus(signal),
  staleTime: staleTimes.aiStatus,
  refetchOnWindowFocus: false,
});

export const useAiStatus = () => useQuery(aiStatusOptions);
