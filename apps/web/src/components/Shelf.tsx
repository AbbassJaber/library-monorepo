import type { BookSummary, ReadingState } from '@library/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BookCard } from '@/features/catalog/BookCard';
import { IconButton, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { FLIP_ATTR } from '@/lib/motionPrefs';

const SHELF_SCROLL_FRACTION = 0.85;
const SCROLL_EPSILON = 2;
const CARD_CLASS = 'w-[132px] shrink-0 snap-start sm:w-[168px]';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const useScrollEdges = (ref: RefObject<HTMLElement | null>, deps: unknown) => {
  const [edges, setEdges] = useState({ back: false, forward: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      back: el.scrollLeft > SCROLL_EPSILON,
      forward: el.scrollLeft < max - SCROLL_EPSILON,
    });
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref, measure, deps]);
  return edges;
};

export interface ShelfProps {
  title: string;
  subtitle?: ReactNode;
  seeAll?: { to: string; label?: string };
  books: BookSummary[] | undefined;
  stateOf?: (bookId: number) => ReadingState | undefined;
  pending?: boolean;
  fallback?: ReactNode;
  notice?: string | undefined;
  skeletonCount?: number;
  renderBook?: (book: BookSummary) => ReactNode;
  flip?: { row: string; book: (book: BookSummary) => string };
  className?: string;
}

export const Shelf = ({
  title,
  subtitle,
  seeAll,
  books,
  stateOf,
  pending = false,
  fallback,
  skeletonCount = 6,
  renderBook,
  notice,
  flip,
  className,
}: ShelfProps) => {
  const { t } = useTranslation();
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(listRef, books);
  const scrollable = edges.back || edges.forward;

  const scroll = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SHELF_SCROLL_FRACTION,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn('min-w-0', className)}
      {...(flip ? { [FLIP_ATTR]: flip.row } : {})}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h2 text-fg">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-small text-fg-2">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          {seeAll ? (
            <Link
              to={seeAll.to}
              className="target inline-flex items-center rounded-control px-2 text-small font-semibold text-link hover:underline hover:underline-offset-4"
            >
              {seeAll.label ?? t('shelfRow.seeAll')}
              <span className="sr-only">: {title}</span>
            </Link>
          ) : null}
          {scrollable ? (
            <>
              <IconButton
                label={t('shelfRow.previous', { title })}
                icon={<ChevronLeft className="size-5" aria-hidden="true" />}
                disabled={!edges.back}
                onClick={() => scroll(-1)}
                className="rounded-full border-line"
              />
              <IconButton
                label={t('shelfRow.next', { title })}
                icon={<ChevronRight className="size-5" aria-hidden="true" />}
                disabled={!edges.forward}
                onClick={() => scroll(1)}
                className="rounded-full border-line"
              />
            </>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p role="status" className="mt-3 text-small text-fg-2">
          {notice}
        </p>
      ) : null}
      {fallback ? (
        <div className="mt-4">{fallback}</div>
      ) : pending || !books ? (
        <div className="mt-4 flex gap-4 overflow-hidden sm:gap-5" aria-hidden="true">
          {Array.from({ length: skeletonCount }, (_, i) => (
            <div key={i} className={CARD_CLASS}>
              <Skeleton className="aspect-[2/3] w-full rounded-cover" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <ul
          ref={listRef}
          aria-labelledby={headingId}
          className="-mx-1 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-1 px-1 pb-3 sm:gap-5"
        >
          {books.map(book => (
            <li
              key={book.id}
              className={CARD_CLASS}
              {...(flip ? { [FLIP_ATTR]: flip.book(book) } : {})}
            >
              {renderBook ? (
                renderBook(book)
              ) : (
                <BookCard book={book} shelfState={stateOf?.(book.id)} showMeta={false} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
