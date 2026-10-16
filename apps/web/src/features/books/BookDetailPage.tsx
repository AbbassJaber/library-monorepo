import { useTranslation } from 'react-i18next';
import type { Book, BookListResponse, BookSummary, ReadingListEntry } from '@library/contracts';
import { Role, ApiErrorCode } from '@library/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link, useNavigationType, useParams } from 'react-router';
import { routes } from '@/app/routes';
import { describeError } from '@/i18n/errors';
import { BookCover } from '@/components/BookCover';
import { Badge, Button, ErrorState, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/queries';
import { bookDetailOptions } from '@/features/catalog/queries';
import { useShelf } from '@/features/shelf/queries';
import { ShelfControls } from '@/features/shelf/ShelfControls';
import { isApiError } from '@/lib/api';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { coverVars } from '@/lib/cover';
import { isRtl } from '@/lib/format';
import { BOOK_OPEN } from '@/lib/motion';
import { qk } from '@/lib/queryKeys';
import { peekBookOpenOrigin } from '@/stores/bookOpenStore';
import { useChatStore } from '@/stores/chatStore';
import { LibraryCard } from './LibraryCard';
import { SimilarBooks } from './SimilarBooks';
import { RISE_ATTR, useBookOpen } from './useBookOpen';

const rise = { [RISE_ATTR]: '' };
const summaryFromCache = (queryClient: QueryClient, id: number): BookSummary | undefined => {
  for (const [, data] of queryClient.getQueriesData<BookListResponse>({
    queryKey: qk.books.lists,
  })) {
    const hit = data?.items.find(book => book.id === id);
    if (hit) return hit;
  }
  for (const [, data] of queryClient.getQueriesData<InfiniteData<BookListResponse>>({
    queryKey: qk.books.infinites,
  })) {
    const hit = data?.pages.flatMap(page => page.items).find(book => book.id === id);
    if (hit) return hit;
  }
  return queryClient.getQueryData<BookSummary[]>(qk.books.newest)?.find(book => book.id === id);
};

const OpenBookSkeleton = () => (
  <div aria-hidden="true" className="book-view">
    <div className="book">
      <div className="book-page paper">
        <Skeleton className="h-3 w-1/3 bg-fg/10" />
        <Skeleton className="mt-4 h-12 w-3/4 bg-fg/10" />
        <Skeleton className="h-5 w-1/3 bg-fg/10" />
        <Skeleton className="mt-4 h-24 w-full bg-fg/10" />
        <Skeleton className="mt-2 h-11 w-48 rounded-full bg-fg/10" />
      </div>
      <div className="book-board">
        <div className="book-board-inside cover-stage">
          <Skeleton className="h-72 w-full max-w-[22rem] rounded-[6px] bg-fg/10" />
        </div>
      </div>
    </div>
  </div>
);

export const BookDetailPage = () => {
  const { t } = useTranslation('books');
  const labels = useLabels();
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const queryClient = useQueryClient();
  const shelf = useShelf();
  const detail = useQuery({
    ...bookDetailOptions(id),
    placeholderData: () => {
      const summary = summaryFromCache(queryClient, id);
      return summary
        ? ({
            ...summary,
            synopsis: '',
            isbn: null,
            version: 0,
            updatedAt: summary.createdAt,
          } satisfies Book)
        : undefined;
    },
  });

  if (!Number.isInteger(id) || id <= 0) return <ErrorState title={t('invalidId')} />;
  if (detail.isError) {
    return isApiError(detail.error, ApiErrorCode.enum.NOT_FOUND) ? (
      <ErrorState title={t('notFound.title', { item: labels.item })} message={t('notFound.body')} />
    ) : (
      <ErrorState message={describeError(detail.error)} onRetry={() => void detail.refetch()} />
    );
  }
  if (detail.isPending) return <OpenBookSkeleton />;

  const book = detail.data;
  return (
    <OpenBook
      key={book.id}
      book={book}
      placeholder={detail.isPlaceholderData}
      entry={shelf.data?.find(e => e.book.id === book.id)}
      shelfReady={shelf.isSuccess}
    />
  );
};

const OpenBook = ({
  book,
  placeholder,
  entry,
  shelfReady,
}: {
  book: Book;
  placeholder: boolean;
  entry: ReadingListEntry | undefined;
  shelfReady: boolean;
}) => {
  const { t } = useTranslation('books');
  const labels = useLabels();
  const format = useFormat();
  const me = useMe();
  const openWithDraft = useChatStore(s => s.openWithDraft);
  const navigationType = useNavigationType();
  const headingId = useId();
  const [origin] = useState(() => (navigationType === 'PUSH' ? peekBookOpenOrigin(book.id) : null));
  const viewRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const creaseRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { phase, close } = useBookOpen(origin, {
    view: viewRef,
    book: bookRef,
    board: boardRef,
    page: pageRef,
    crease: creaseRef,
    toolbar: toolbarRef,
    heading: headingRef,
  });
  const archived = book.archivedAt !== null;
  const rtl = isRtl(book.title);
  const firstGenre = book.genres[0]?.name;

  return (
    <div ref={viewRef} className="book-view" style={{ perspective: `${BOOK_OPEN.perspective}px` }}>
      <div ref={toolbarRef} className="mb-4 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          icon={<X className="size-4" aria-hidden="true" />}
          onClick={close}
          aria-label={t('close')}
        >
          {t('closeShort')}
        </Button>
      </div>

      <article
        ref={bookRef}
        aria-labelledby={headingId}
        className="book"
        data-animating={phase === 'open' ? undefined : ''}
        style={coverVars(book.title)}
      >
        <div ref={pageRef} className="book-page paper">
          <div ref={creaseRef} className="book-crease" aria-hidden="true" />
          <p
            {...rise}
            aria-hidden="true"
            className="flex justify-between gap-3 text-[0.75rem] text-fg-2"
          >
            <span className="truncate">{firstGenre}</span>
            <span className="tabular">{format.year(book.publishedYear)}</span>
          </p>
          <div {...rise}>
            <h1
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              dir={rtl ? 'rtl' : 'auto'}
              className="text-[2.25rem] leading-[1.02] font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere] [text-wrap:balance] @min-[680px]/book-view:text-[2.625rem]"
            >
              {book.title}
            </h1>
            <p className="mt-2 text-[1.0625rem] font-medium text-fg-2" dir="auto">
              {book.author}
            </p>
            {archived ? (
              <p className="mt-3">
                <Badge tone="danger">{labels.archivedNotice}</Badge>
              </p>
            ) : null}
          </div>
          <div {...rise}>
            {placeholder ? (
              <Skeleton className="h-24 w-full bg-fg/10" />
            ) : (
              <p className="max-w-[46ch] text-[0.96875rem] leading-[1.62]" dir="auto">
                {book.synopsis}
              </p>
            )}
          </div>
          {me.data ? (
            <div {...rise} className="flex flex-wrap items-center gap-2">
              <ShelfControls book={book} entry={entry} solid />
              <Button
                variant="secondary"
                onClick={() =>
                  openWithDraft(t('askPrompt', { title: book.title, author: book.author }), {
                    bookId: book.id,
                    title: book.title,
                  })
                }
              >
                {t('askLibrarian')}
              </Button>
            </div>
          ) : null}
          <div {...rise} className="library-card-narrow">
            <LibraryCard book={book} entry={entry} ready={shelfReady} />
          </div>
          <div {...rise} className="mt-auto flex flex-col gap-4 pt-2">
            {placeholder ? null : <SimilarBooks bookId={book.id} />}
            {me.data?.role === Role.enum.LIBRARIAN && !placeholder ? (
              <p className="text-small">
                <Link
                  to={routes.librarian.editBook(book.id)}
                  className="font-semibold text-link hover:underline hover:underline-offset-4"
                >
                  {t('edit', { item: labels.item.toLowerCase() })}
                </Link>{' '}
                <span className="tabular text-fg-3">
                  ({t('version', { version: book.version })})
                </span>
              </p>
            ) : null}
            <p aria-hidden="true" className="tabular self-center text-[0.75rem] text-fg-2">
              1
            </p>
          </div>
        </div>

        <div ref={boardRef} className="book-board">
          <div className="book-board-inside cover-stage">
            <LibraryCard book={book} entry={entry} ready={shelfReady} className="paper" />
          </div>
          <div className="book-board-face" aria-hidden="true">
            {phase === 'open' ? null : (
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                archived={archived}
              />
            )}
          </div>
        </div>
      </article>
    </div>
  );
};
