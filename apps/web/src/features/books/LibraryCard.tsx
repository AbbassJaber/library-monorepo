import type { Book, ReadingListEntry } from '@library/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stamp } from '@/components/Stamp';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { cn } from '@/lib/cn';
import { shelfMark } from '@/lib/shelfMark';

export const LibraryCard = ({
  book,
  entry,
  ready,
  className,
}: {
  book: Book;
  entry: ReadingListEntry | undefined;
  ready: boolean;
  className?: string;
}) => {
  const { t } = useTranslation('books');
  const labels = useLabels();
  const format = useFormat();
  const mark = shelfMark(book.author);
  const headingId = useId();
  const stampKey = entry?.state ?? null;
  const [baseline, setBaseline] = useState<string | null | undefined>(ready ? stampKey : undefined);
  if (ready && baseline === undefined) setBaseline(stampKey);
  const changed = baseline !== undefined && stampKey !== null && stampKey !== baseline;

  const rows: { label: string; value: string; mono?: boolean; auto?: boolean }[] = [
    { label: t('card.author'), value: book.author, auto: true },
    { label: t('card.published'), value: format.year(book.publishedYear), mono: true },
    ...(book.genres.length > 0
      ? [{ label: t('card.genre'), value: book.genres.map(genre => genre.name).join(', ') }]
      : []),
    ...(book.language
      ? [{ label: t('card.language'), value: format.language(book.language) }]
      : []),
    ...(book.rating > 0
      ? [
          {
            label: t('card.rating'),
            value: t('card.ratingValue', { rating: format.rating(book.rating) }),
            mono: true,
          },
        ]
      : []),
    ...(book.isbn ? [{ label: labels.externalId, value: book.isbn, mono: true }] : []),
    {
      label: t('card.onList'),
      value: entry ? t('card.since', { date: format.day(entry.createdAt) }) : t('card.notYet'),
    },
  ];

  return (
    <section aria-labelledby={headingId} className={cn('library-card', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[0.9375rem] font-bold text-fg">
          {t('card.title')}
        </h2>
        <p className="tabular text-meta text-fg-2">
          <span className="sr-only">{t('card.shelfMark')}: </span>
          <span dir="auto">{mark}</span>
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr]">
        {rows.map(row => (
          <div key={row.label} className="contents">
            <dt className="border-b border-line py-[7px] pr-4 text-meta text-fg-2">{row.label}</dt>
            <dd
              className={cn(
                'border-b border-line py-[7px] text-end text-meta font-medium text-fg',
                row.mono && 'tabular'
              )}
              dir={row.auto ? 'auto' : undefined}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {entry ? (
        <div className="mt-3 flex min-h-[4.5rem] items-end justify-between gap-3">
          <p className="text-[0.75rem] font-semibold text-fg-2">{t('card.yours')}</p>
          <Stamp
            key={stampKey}
            label={labels.states[entry.state]}
            date={format.day(entry.updatedAt)}
            thunk={changed}
          />
        </div>
      ) : null}
    </section>
  );
};
