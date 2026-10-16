import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { recordBookOpen } from '@/stores/bookOpenStore';
import { fetchSimilarBooks } from '@/features/ai/api';
import { useAiStatus } from '@/features/ai/queries';
import { qk, staleTimes } from '@/lib/queryKeys';

export const useSimilarBooks = (bookId: number | undefined) => {
  const status = useAiStatus();
  const enabled = status.data?.features.SIMILAR === true && bookId !== undefined;
  const similar = useQuery({
    queryKey: qk.books.similar(bookId ?? 0),
    queryFn: ({ signal }) => fetchSimilarBooks(bookId ?? 0, signal),
    staleTime: staleTimes.similar,
    refetchOnWindowFocus: false,
    enabled,
  });
  return enabled ? similar.data : undefined;
};

const SIMILAR_ON_PAGE = 5;

export const SimilarBooks = ({ bookId }: { bookId: number }) => {
  const { t } = useTranslation(['books', 'catalog']);
  const headingId = useId();
  const similar = useSimilarBooks(bookId);
  if (!similar || similar.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-meta font-semibold text-fg-2">
        {t('similar.heading')}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2.5">
        {similar.slice(0, SIMILAR_ON_PAGE).map(({ book }) => (
          <li key={book.id} className="w-[52px]">
            <Link
              to={routes.book(book.id)}
              onClick={event => recordBookOpen(event, book.id)}
              aria-label={t('catalog:card.titleBy', { title: book.title, author: book.author })}
              className="block rounded-cover outline-offset-4"
            >
              <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
