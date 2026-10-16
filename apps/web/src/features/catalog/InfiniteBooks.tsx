import type { ReadingState } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { useLabels } from '@/i18n/useLabels';
import { describeError } from '@/i18n/errors';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { announce } from '@/lib/announce';
import { BookGridSkeleton } from './BookGrid';
import { BookResults } from './BookTable';
import { booksInfiniteOptions } from './queries';
import type { CatalogQuery } from './queries';

const AUTO_PAGES = 3;

interface Props {
  query: Omit<CatalogQuery, 'page'>;
  stateOf?: (bookId: number) => ReadingState | undefined;
  onClear: () => void;
}

export const InfiniteBooks = ({ query, stateOf, onClear }: Props) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const result = useInfiniteQuery(booksInfiniteOptions(query));
  const sentinel = useRef<HTMLDivElement>(null);
  const pagesLoaded = result.data?.pages.length ?? 0;
  const items = result.data?.pages.flatMap(page => page.items) ?? [];
  const total = result.data?.pages[0]?.meta.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = result;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || pagesLoaded >= AUTO_PAGES) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, pagesLoaded, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (pagesLoaded > 0) announce(t('announce.shown', { shown: items.length, count: total }));
  }, [pagesLoaded, items.length, total, t]);

  if (result.isPending) return <BookGridSkeleton />;
  if (result.isError)
    return (
      <ErrorState message={describeError(result.error)} onRetry={() => void result.refetch()} />
    );
  if (items.length === 0) {
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
      <BookResults books={items} stateOf={stateOf} request={JSON.stringify(query)} />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="text-small text-fg-2">
          {t('shownOf', { shown: items.length, count: total })}
        </p>
        {hasNextPage ? (
          <Button
            variant="secondary"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
          >
            {t('loadMore')}
          </Button>
        ) : null}
      </div>
    </>
  );
};
