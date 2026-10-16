import { apiPaths } from '@library/contracts';
import type { ExplainedRecommendationsResponse, ForYourShelvesResponse } from '@library/contracts';
import type { UiLocale } from '@library/domain-config';
import { isAiUnavailable } from '@/features/ai/api';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, staleTimes } from '@/lib/queryKeys';

export const forYourShelvesOptions = queryOptions({
  queryKey: qk.recommendations.shelves,
  queryFn: ({ signal }) =>
    api.get<ForYourShelvesResponse>(apiPaths.recommendations, signal).then(r => r.data),
  staleTime: staleTimes.recommendations,
});

export const useForYourShelves = () => useQuery(forYourShelvesOptions);

export type ExplainedReason = 'ok' | 'no-history' | 'no-candidates' | 'fallback';

export const explainedOptions = (locale: UiLocale) =>
  queryOptions({
    queryKey: [...qk.recommendations.explained, locale] as const,
    queryFn: async ({ signal }) => {
      const envelope = await api.get<ExplainedRecommendationsResponse>(
        `${apiPaths.ai.recommendations}?locale=${locale}`,
        signal
      );
      const reason = (envelope.meta as { reason?: ExplainedReason } | undefined)?.reason ?? 'ok';
      return { items: envelope.data, reason };
    },
    staleTime: staleTimes.explained,
    refetchOnWindowFocus: false,
    retry: (count, error) => !isAiUnavailable(error) && count < 1,
  });

export const useExplainedRecommendations = (locale: UiLocale) => useQuery(explainedOptions(locale));
