import { useTranslation } from 'react-i18next';
import { ReadingState, type ReadingListEntry } from '@library/contracts';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { describeError } from '@/i18n/errors';
import { BookCover } from '@/components/BookCover';
import { FlipGroup } from '@/components/FlipGroup';
import { Shelf } from '@/components/Shelf';
import { Badge, EmptyState, ErrorState, LinkButton, PageHeading } from '@/components/ui';
import { ExplainedRecommendations } from '@/features/recommendations/ExplainedRecommendations';
import { useLabels } from '@/i18n/useLabels';
import { recordBookOpen } from '@/stores/bookOpenStore';
import { useShelf } from './queries';
import { ShelfControls } from './ShelfControls';

const ORDER: ReadingState[] = [
  ReadingState.enum.READING,
  ReadingState.enum.WANT_TO_READ,
  ReadingState.enum.FINISHED,
];

const ShelfEntry = ({ entry }: { entry: ReadingListEntry }) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const { book } = entry;
  return (
    <article aria-label={t('card.titleBy', { title: book.title, author: book.author })}>
      <Link
        to={routes.book(book.id)}
        onClick={event => recordBookOpen(event, book.id)}
        className="group block rounded-cover outline-offset-4"
      >
        <div className="relative">
          <BookCover
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            archived={!entry.available}
          />
        </div>
        <h3
          className="mt-3 line-clamp-2 text-small font-semibold leading-snug text-fg decoration-1 underline-offset-4 group-hover:underline"
          dir="auto"
        >
          {book.title}
        </h3>
        <p className="mt-0.5 truncate text-small text-fg-2" dir="auto">
          {book.author}
        </p>
      </Link>
      {!entry.available ? (
        <p className="mt-2">
          <Badge tone="danger">{labels.archivedNotice}</Badge>
        </p>
      ) : null}
      <div className="mt-3">
        <ShelfControls book={book} entry={entry} compact />
      </div>
    </article>
  );
};

export const ShelfPage = () => {
  const { t } = useTranslation(['shelf', 'common']);
  const labels = useLabels();
  const shelf = useShelf();
  const entries = shelf.data ?? [];

  return (
    <>
      <PageHeading title={labels.shelf} lede={t('lede', { items: labels.items })} />
      {shelf.isPending ? (
        <Shelf title={labels.states.READING} books={undefined} pending skeletonCount={4} />
      ) : null}
      {shelf.isError ? (
        <ErrorState message={describeError(shelf.error)} onRetry={() => void shelf.refetch()} />
      ) : null}
      {shelf.data && entries.length === 0 ? (
        <EmptyState
          title={t('empty.title', { shelf: labels.shelf })}
          action={
            <LinkButton to={routes.catalog}>
              {t('common:actions.browse', { what: labels.catalog.toLowerCase() })}
            </LinkButton>
          }
        >
          {t('empty.hint', {
            item: labels.item.toLowerCase(),
            catalog: labels.catalog.toLowerCase(),
          })}
        </EmptyState>
      ) : null}
      {entries.length > 0 ? (
        <FlipGroup
          layout={entries.map(entry => `${entry.book.id}:${entry.state}`).join(',')}
          request={entries.map(entry => `${entry.book.id}:${entry.state}`).join(',')}
          className="flex flex-col gap-12"
        >
          {ORDER.map(state => {
            const group = entries.filter(entry => entry.state === state);
            if (group.length === 0) return null;
            const byBook = new Map(group.map(entry => [entry.book.id, entry]));
            return (
              <Shelf
                key={state}
                title={labels.states[state]}
                subtitle={t('count', {
                  count: group.length,
                  items: labels.items.toLowerCase(),
                  item: labels.item.toLowerCase(),
                })}
                books={group.map(entry => entry.book)}
                renderBook={book => {
                  const entry = byBook.get(book.id);
                  return entry ? <ShelfEntry entry={entry} /> : null;
                }}
                flip={{ row: `row-${state}`, book: book => `book-${book.id}-${state}` }}
              />
            );
          })}
        </FlipGroup>
      ) : null}
      <ExplainedRecommendations />
    </>
  );
};
