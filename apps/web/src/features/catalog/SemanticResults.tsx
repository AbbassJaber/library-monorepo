import type { ReadingState } from '@library/contracts';
import { useQuery } from '@tanstack/react-query';
import type { HybridSearchQuery } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { Button, ErrorState, EmptyState } from '@/components/ui';
import { AiFallbackNotice } from '@/features/ai/AiFallbackNotice';
import { aiMetaOf, hybridSearch } from '@/features/ai/api';
import { useAiMeta } from '@/features/ai/useAiMeta';
import { describeError } from '@/i18n/errors';
import { useLabels } from '@/i18n/useLabels';
import { qk, staleTimes } from '@/lib/queryKeys';
import { useEffect } from 'react';
import { BookGridSkeleton } from './BookGrid';
import { BookResults } from './BookTable';

const SEMANTIC_LIMIT = 20;

export const SemanticResults = ({
  q,
  genre,
  stateOf,
  onClear,
}: {
  q: string;
  genre: string | undefined;
  stateOf: (bookId: number) => ReadingState | undefined;
  onClear: () => void;
}) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const ai = useAiMeta();
  const query: HybridSearchQuery = { q, limit: SEMANTIC_LIMIT, ...(genre ? { genre } : {}) };
  const result = useQuery({
    queryKey: qk.ai.search(query),
    queryFn: ({ signal }) => hybridSearch(query, signal),
    staleTime: staleTimes.similar,
    refetchOnWindowFocus: false,
  });
  const { setMeta } = ai;
  useEffect(() => {
    if (result.data) setMeta(aiMetaOf(result.data));
  }, [result.data, setMeta]);

  if (result.isPending) return <BookGridSkeleton />;
  if (result.isError)
    return (
      <ErrorState message={describeError(result.error)} onRetry={() => void result.refetch()} />
    );
  const items = result.data.data.items;
  return (
    <>
      <p className="mb-3 text-small text-fg-2">{t('semantic.note')}</p>
      {ai.meta?.fallbackUsed ? <AiFallbackNotice className="mb-3" /> : null}
      {items.length === 0 ? (
        <EmptyState
          title={t('empty.title', { items: labels.items.toLowerCase() })}
          action={
            <Button variant="secondary" onClick={onClear}>
              {t('empty.reset')}
            </Button>
          }
        >
          {t('empty.hint')}
        </EmptyState>
      ) : (
        <BookResults
          books={items.map(item => item.book)}
          stateOf={stateOf}
          scored={items}
          reranked={result.data.data.reranked}
          request={JSON.stringify(query)}
        />
      )}
      {ai.line ? <p className="mt-3 text-meta text-fg-3">{ai.line}</p> : null}
    </>
  );
};
