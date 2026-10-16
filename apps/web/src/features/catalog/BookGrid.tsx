import { useLabels } from '@/i18n/useLabels';
import type { BookSummary, ReadingState } from '@library/contracts';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { BookCard } from './BookCard';

interface BookGridProps {
  books: BookSummary[];
  stateOf?: ((bookId: number) => ReadingState | undefined) | undefined;
  busy?: boolean;
  label?: string;
  className?: string;
  headingLevel?: 2 | 3;
}

export const gridClass =
  'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

export const BookGrid = ({
  books,
  stateOf,
  busy = false,
  label,
  className,
  headingLevel = 3,
}: BookGridProps) => {
  const labels = useLabels();
  return (
    <div
      role="feed"
      aria-label={label ?? labels.items}
      aria-busy={busy}
      className={cn(gridClass, busy && 'opacity-60 transition-opacity', className)}
    >
      {books.map(book => (
        <BookCard
          key={book.id}
          book={book}
          shelfState={stateOf?.(book.id)}
          headingLevel={headingLevel}
          flipId={`book-${book.id}`}
        />
      ))}
    </div>
  );
};

export const BookGridSkeleton = ({ count = 12 }: { count?: number }) => (
  <div className={gridClass} aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <div key={i}>
        <Skeleton className="aspect-[2/3] w-full rounded-cover" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </div>
    ))}
  </div>
);
