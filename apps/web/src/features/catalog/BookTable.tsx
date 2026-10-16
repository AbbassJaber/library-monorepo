import type { BookSummary, ReadingState, ScoredBook } from '@library/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { cn } from '@/lib/cn';
import { isRtl } from '@/lib/format';
import { MEDIA_MD, useMediaQuery } from '@/lib/useMediaQuery';
import { COVER_SCOPE_ATTR, recordBookOpen } from '@/stores/bookOpenStore';
import { CATALOG_LAYOUTS, useUiStore } from '@/stores/uiStore';
import type { CatalogLayout } from '@/stores/uiStore';
import { FlipGroup } from '@/components/FlipGroup';
import { BookGrid } from './BookGrid';
import { WhyItMatched } from './WhyItMatched';

export const useCatalogLayout = (): CatalogLayout => {
  const layout = useUiStore(s => s.catalogLayout);
  const wide = useMediaQuery(MEDIA_MD);
  return wide ? layout : CATALOG_LAYOUTS.covers;
};

export const LayoutSwitch = ({ className }: { className?: string }) => {
  const { t } = useTranslation('catalog');
  const layout = useUiStore(s => s.catalogLayout);
  const setLayout = useUiStore(s => s.setCatalogLayout);
  const wide = useMediaQuery(MEDIA_MD);
  if (!wide) return null;
  return (
    <div
      role="group"
      aria-label={t('layout.label')}
      className={cn('inline-flex rounded-full border border-line p-0.5', className)}
    >
      {Object.values(CATALOG_LAYOUTS).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          onClick={() => setLayout(value)}
          className={cn(
            'min-h-11 rounded-full px-4 text-small font-semibold',
            layout === value ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:text-fg'
          )}
        >
          {t(`layout.${value}`)}
        </button>
      ))}
    </div>
  );
};

export const BookResults = ({
  books,
  stateOf,
  busy = false,
  scored,
  reranked = false,
  request = '',
}: {
  books: BookSummary[];
  stateOf?: ((bookId: number) => ReadingState | undefined) | undefined;
  busy?: boolean;
  scored?: ScoredBook[] | undefined;
  reranked?: boolean;
  request?: string;
}) => {
  const layout = useCatalogLayout();
  const [selected, setSelected] = useState<number | null>(null);
  const panelId = useId();
  if (layout === CATALOG_LAYOUTS.covers)
    return (
      <FlipGroup layout={books.map(book => book.id).join(',')} request={request}>
        <BookGrid books={books} stateOf={stateOf} busy={busy} headingLevel={2} />
      </FlipGroup>
    );
  const hit = scored?.find(item => item.book.id === selected);
  return (
    <div className={cn(hit && 'grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-6')}>
      <BookTable
        books={books}
        stateOf={stateOf}
        busy={busy}
        why={
          scored
            ? {
                selected,
                panelId,
                onSelect: id => setSelected(current => (current === id ? null : id)),
              }
            : undefined
        }
      />
      {hit ? (
        <WhyItMatched
          id={panelId}
          hit={hit}
          reranked={reranked}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
};

const headClass = 'whitespace-nowrap px-3 py-2.5 text-left text-meta font-semibold text-fg-2';
const cellClass = 'px-3 py-2 align-middle';

export const BookTable = ({
  books,
  stateOf,
  busy,
  why,
}: {
  books: BookSummary[];
  stateOf?: ((bookId: number) => ReadingState | undefined) | undefined;
  busy: boolean;
  why?:
    { selected: number | null; panelId: string; onSelect: (bookId: number) => void } | undefined;
}) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const format = useFormat();
  return (
    <div className="overflow-x-auto rounded-control-lg border border-line">
      <table
        aria-busy={busy}
        className={cn('w-full border-collapse text-small', busy && 'opacity-60')}
      >
        <caption className="sr-only">{labels.items}</caption>
        <thead className="border-b border-line bg-surface">
          <tr>
            <th scope="col" className={cn(headClass, 'w-14')}>
              <span className="sr-only">{t('table.cover')}</span>
            </th>
            <th scope="col" className={headClass}>
              {t('table.title')}
            </th>
            <th scope="col" className={headClass}>
              {labels.year}
            </th>
            <th scope="col" className={headClass}>
              {t('table.genre')}
            </th>
            <th scope="col" className={headClass}>
              {t('table.language')}
            </th>
            <th scope="col" className={headClass}>
              {t('table.rating')}
            </th>
            <th scope="col" className={headClass}>
              {labels.shelf}
            </th>
            {why ? (
              <th scope="col" className={headClass}>
                <span className="sr-only">{t('why.heading')}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {books.map(book => {
            const state = stateOf?.(book.id);
            const archived = book.archivedAt !== null;
            const isSelected = why?.selected === book.id;
            return (
              <tr
                key={book.id}
                {...{ [COVER_SCOPE_ATTR]: '' }}
                className={cn(
                  'border-b border-line last:border-b-0 hover:bg-fg/[0.03]',
                  isSelected && '*:bg-accent-soft'
                )}
              >
                <td className={cellClass}>
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    archived={archived}
                    className="w-8"
                  />
                </td>
                <th scope="row" className={cn(cellClass, 'text-left font-normal')}>
                  <Link
                    to={routes.book(book.id)}
                    onClick={event => recordBookOpen(event, book.id)}
                    className="font-semibold text-fg hover:underline hover:underline-offset-4"
                    dir={isRtl(book.title) ? 'rtl' : 'auto'}
                  >
                    {book.title}
                  </Link>
                  <span className="block truncate text-meta text-fg-2" dir="auto">
                    {book.author}
                  </span>
                </th>
                <td className={cn(cellClass, 'tabular text-fg-2')}>
                  {format.year(book.publishedYear)}
                </td>
                <td className={cn(cellClass, 'text-fg-2')}>
                  {book.genres.map(genre => genre.name).join(', ')}
                </td>
                <td className={cn(cellClass, 'text-fg-2')}>
                  {book.language ? format.language(book.language) : '—'}
                </td>
                <td className={cn(cellClass, 'tabular text-fg-2')}>
                  {book.rating > 0 ? format.rating(book.rating) : '—'}
                </td>
                <td className={cellClass}>
                  {archived ? (
                    <StatePill>{labels.archivedNotice}</StatePill>
                  ) : state ? (
                    <StatePill>{labels.states[state]}</StatePill>
                  ) : (
                    <span className="text-fg-2">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t('table.notOnShelf')}</span>
                    </span>
                  )}
                </td>
                {why ? (
                  <td className={cn(cellClass, 'text-right')}>
                    <button
                      type="button"
                      aria-expanded={isSelected}
                      aria-controls={isSelected ? why.panelId : undefined}
                      aria-label={t('why.open', { title: book.title })}
                      onClick={() => why.onSelect(book.id)}
                      className={cn(
                        'min-h-11 rounded-full border px-3.5 text-meta font-semibold',
                        isSelected
                          ? 'border-accent text-link'
                          : 'border-line-strong text-fg hover:bg-fg/5'
                      )}
                    >
                      {t('why.button')}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const StatePill = ({ children }: { children: string }) => (
  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-0.5 text-meta font-semibold text-fg">
    {children}
  </span>
);
