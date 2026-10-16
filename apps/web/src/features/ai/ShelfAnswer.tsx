import type { Citation } from '@library/contracts';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { Skeleton } from '@/components/ui';
import { bookDetailOptions } from '@/features/catalog/queries';
import { useFormat } from '@/i18n/format';

const HINT_MAX_BOOKS = 3;
const THINKING_COVERS = 3;

const useCitedBook = (bookId: number) =>
  useQuery({ ...bookDetailOptions(bookId), refetchOnWindowFocus: false }).data;

export const ShelfAnswer = ({
  citations,
  onFollow,
}: {
  citations: Citation[];
  onFollow?: (() => void) | undefined;
}) => {
  const { t } = useTranslation();
  const labelId = useId();
  if (citations.length === 0) return null;
  const [only] = citations;
  return (
    <div className="ledge mt-3 px-3 pb-5 pt-3">
      <p id={labelId} className="sr-only">
        {t('chat.sources')}
      </p>
      {citations.length === 1 && only ? (
        <ul aria-labelledby={labelId}>
          <li>
            <SingleBook citation={only} onFollow={onFollow} />
          </li>
        </ul>
      ) : (
        <div className="flex items-center gap-4 overflow-x-auto">
          <ul aria-labelledby={labelId} className="flex shrink-0 items-end gap-3">
            {citations.map(citation => (
              <li key={citation.bookId} className="w-[104px] shrink-0">
                <ShelfBook citation={citation} onFollow={onFollow} />
              </li>
            ))}
          </ul>
          {citations.length <= HINT_MAX_BOOKS ? (
            <p className="min-w-[8rem] text-meta text-fg-2">{t('chat.openHint')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

const ShelfBook = ({
  citation,
  onFollow,
}: {
  citation: Citation;
  onFollow?: (() => void) | undefined;
}) => {
  const format = useFormat();
  const book = useCitedBook(citation.bookId);
  return (
    <Link
      to={routes.book(citation.bookId)}
      onClick={onFollow}
      className="group block rounded-cover outline-offset-4"
    >
      <BookCover
        title={citation.title}
        author={book?.author ?? ''}
        coverUrl={book?.coverUrl ?? null}
        archived={book ? book.archivedAt !== null : false}
      />
      <span
        className="mt-2 line-clamp-2 block text-small font-semibold leading-snug text-fg group-hover:underline"
        dir="auto"
      >
        {citation.title}
      </span>
      {book ? (
        <span className="tabular block text-meta text-fg-2">{format.year(book.publishedYear)}</span>
      ) : null}
    </Link>
  );
};

const SingleBook = ({
  citation,
  onFollow,
}: {
  citation: Citation;
  onFollow?: (() => void) | undefined;
}) => {
  const format = useFormat();
  const book = useCitedBook(citation.bookId);
  return (
    <Link
      to={routes.book(citation.bookId)}
      onClick={onFollow}
      className="group flex items-end gap-4 rounded-control-lg outline-offset-4"
    >
      <BookCover
        title={citation.title}
        author={book?.author ?? ''}
        coverUrl={book?.coverUrl ?? null}
        archived={book ? book.archivedAt !== null : false}
        className="w-[120px] shrink-0"
      />
      <span className="min-w-0 pb-1">
        <span
          className="block text-body font-bold leading-snug text-fg group-hover:underline"
          dir="auto"
        >
          {citation.title}
        </span>
        {book ? (
          <>
            <span className="mt-0.5 block text-small text-fg-2" dir="auto">
              {book.author}
            </span>
            <span className="tabular block text-meta text-fg-2">
              {format.year(book.publishedYear)}
            </span>
          </>
        ) : null}
      </span>
    </Link>
  );
};

export const ShelfThinking = () => {
  const { t } = useTranslation();
  return (
    <div className="mt-1">
      <p role="status" className="text-small text-fg-2">
        {t('chat.pulling')}
      </p>
      <div aria-hidden="true" className="ledge mt-3 flex items-end gap-3 px-3 pb-5 pt-3">
        {Array.from({ length: THINKING_COVERS }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-[72px] rounded-cover bg-fg/10" />
        ))}
      </div>
    </div>
  );
};
