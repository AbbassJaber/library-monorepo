import { useTranslation } from 'react-i18next';
import type { BookSummary, ReadingState } from '@library/contracts';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { cn } from '@/lib/cn';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { isRtl } from '@/lib/format';
import { FLIP_ATTR } from '@/lib/motionPrefs';
import { recordBookOpen } from '@/stores/bookOpenStore';
import { usePrefetchBookDetail } from './queries';

export interface BookCardProps {
  book: BookSummary;
  onShelf?: boolean;
  shelfState?: ReadingState | undefined;
  className?: string;
  headingLevel?: 2 | 3;
  showMeta?: boolean;
  flipId?: string;
}

const CoverPill = ({ children }: { children: string }) => (
  <span
    aria-hidden="true"
    className="absolute bottom-2 left-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center truncate rounded-full bg-pill px-2 py-0.5 text-meta font-semibold text-pill-fg"
  >
    {children}
  </span>
);

export const BookCard = ({
  book,
  onShelf = false,
  shelfState,
  className,
  headingLevel = 3,
  showMeta = true,
  flipId,
}: BookCardProps) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const format = useFormat();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const prefetch = usePrefetchBookDetail(book.id);
  const rtl = isRtl(book.title);
  const archived = book.archivedAt !== null;
  const pill = archived
    ? labels.archivedNotice
    : shelfState
      ? labels.states[shelfState]
      : onShelf
        ? t('card.onShelf', { shelf: labels.shelf.toLowerCase() })
        : null;
  const name = t('card.titleBy', { title: book.title, author: book.author });
  return (
    <article
      className={cn('group relative', className)}
      {...(flipId ? { [FLIP_ATTR]: flipId } : {})}
    >
      <Link
        to={routes.book(book.id)}
        onClick={event => recordBookOpen(event, book.id)}
        className="block rounded-cover outline-offset-4"
        onPointerEnter={prefetch.start}
        onPointerLeave={prefetch.cancel}
        onFocus={prefetch.start}
        onBlur={prefetch.cancel}
        aria-label={pill ? `${name}, ${pill}` : name}
      >
        <div className="relative">
          <BookCover
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            archived={archived}
          />
          {pill ? <CoverPill>{pill}</CoverPill> : null}
        </div>
        <div className="mt-3" dir={rtl ? 'rtl' : 'ltr'}>
          <Heading className="line-clamp-2 text-small font-semibold leading-snug text-fg decoration-1 underline-offset-4 group-hover:underline">
            {book.title}
          </Heading>
          <p className="mt-0.5 truncate text-small text-fg-2" dir="auto">
            {book.author}
          </p>
          {showMeta ? (
            <p className="mt-0.5 text-meta text-fg-3">
              {format.year(book.publishedYear)}
              {book.rating > 0 ? ` · ★ ${format.rating(book.rating)}` : ''}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
};
