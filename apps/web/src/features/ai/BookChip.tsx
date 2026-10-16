import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { bookDetailOptions } from '@/features/catalog/queries';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/cn';

export const BookChip = ({
  bookId,
  title,
  onFollow,
  className,
}: {
  bookId: number;
  title: string;
  onFollow?: (() => void) | undefined;
  className?: string;
}) => {
  const format = useFormat();
  const book = useQuery({ ...bookDetailOptions(bookId), refetchOnWindowFocus: false });
  const meta = book.data ? `${book.data.author} · ${format.year(book.data.publishedYear)}` : null;
  return (
    <Link
      to={routes.book(bookId)}
      onClick={onFollow}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-3 rounded-control-lg border border-line bg-surface-2 p-2 pr-3 hover:border-line-strong',
        className
      )}
    >
      <BookCover
        title={title}
        author={book.data?.author ?? ''}
        coverUrl={book.data?.coverUrl ?? null}
        className="w-9 shrink-0"
      />
      <span className="min-w-0">
        <span className="block truncate text-small font-semibold text-fg" dir="auto">
          {title}
        </span>
        {meta ? (
          <span className="block truncate text-meta text-fg-2" dir="auto">
            {meta}
          </span>
        ) : null}
      </span>
    </Link>
  );
};
