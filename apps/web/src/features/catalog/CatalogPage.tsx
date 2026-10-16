import type { ReadingState } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { describeError } from '@/i18n/errors';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Button, EmptyState, ErrorState, PageHeading } from '@/components/ui';
import { useShelfStateOf } from '@/features/shelf/queries';
import { announce } from '@/lib/announce';
import { useLabels } from '@/i18n/useLabels';
import { useUiStore } from '@/stores/uiStore';
import { BookGridSkeleton } from './BookGrid';
import { BookResults, LayoutSwitch } from './BookTable';
import { NaturalSearchBar } from '@/features/ai/NaturalSearchBar';
import { useAiStatus } from '@/features/ai/queries';
import { SemanticResults } from './SemanticResults';
import { FilterBar } from './FilterBar';
import { InfiniteBooks } from './InfiniteBooks';
import { Paginator } from './Paginator';
import { booksListOptions } from './queries';
import { useCatalogParams } from './useCatalogParams';

const PagedBooks = ({
  params,
  onPage,
  onClear,
  stateOf,
}: {
  params: ReturnType<typeof useCatalogParams>['params'];
  onPage: (page: number) => void;
  onClear: () => void;
  stateOf: (bookId: number) => ReadingState | undefined;
}) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const queryClient = useQueryClient();
  const result = useQuery(booksListOptions(params));
  const meta = result.data?.meta;

  useEffect(() => {
    if (!meta || result.isPlaceholderData || meta.page >= meta.totalPages) return;
    void queryClient.prefetchQuery(booksListOptions({ ...params, page: meta.page + 1 }));
  }, [meta, params, queryClient, result.isPlaceholderData]);

  useEffect(() => {
    if (meta && !result.isPlaceholderData)
      announce(t('announce.page', { count: meta.total, page: meta.page, pages: meta.totalPages }));
  }, [meta, result.isPlaceholderData, t]);

  if (result.isPending) return <BookGridSkeleton />;
  if (result.isError)
    return (
      <ErrorState message={describeError(result.error)} onRetry={() => void result.refetch()} />
    );
  if (result.data.items.length === 0) {
    return (
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
    );
  }
  return (
    <>
      <BookResults
        books={result.data.items}
        stateOf={stateOf}
        busy={result.isPlaceholderData || result.isFetching}
        request={JSON.stringify({ ...params, page: undefined })}
      />
      <Paginator meta={result.data.meta} onPage={onPage} />
    </>
  );
};

export const CatalogPage = () => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const { params, setParams, clear, hasFilters, semantic, setSemantic } = useCatalogParams();
  const viewMode = useUiStore(s => s.catalogViewMode);
  const stateOf = useShelfStateOf();
  const status = useAiStatus();
  const canSearchByMeaning = status.data?.features.HYBRID_SEARCH === true && Boolean(params.q);
  const byMeaning = canSearchByMeaning && semantic;

  return (
    <>
      <PageHeading title={labels.catalog} lede={t('lede')} />
      <NaturalSearchBar onApply={setParams} />
      <FilterBar params={params} onChange={setParams} onClear={clear} hasFilters={hasFilters} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {canSearchByMeaning ? (
          <Button
            variant={byMeaning ? 'primary' : 'secondary'}
            aria-pressed={byMeaning}
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            onClick={() => setSemantic(!byMeaning)}
          >
            {t('semantic.toggle')}
          </Button>
        ) : (
          <span />
        )}
        <LayoutSwitch />
      </div>
      {byMeaning && params.q ? (
        <SemanticResults
          q={params.q}
          genre={params.genre?.length === 1 ? params.genre[0] : undefined}
          stateOf={stateOf}
          onClear={clear}
        />
      ) : viewMode === 'pages' ? (
        <PagedBooks
          params={params}
          onPage={page => setParams({ page })}
          onClear={clear}
          stateOf={stateOf}
        />
      ) : (
        <InfiniteBooks
          query={(({ page: _page, ...rest }) => rest)(params)}
          stateOf={stateOf}
          onClear={clear}
        />
      )}
    </>
  );
};
