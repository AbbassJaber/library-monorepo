import type { ScoredBook } from '@library/contracts';
import { X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BookCover } from '@/components/BookCover';
import { IconButton } from '@/components/ui';

const COSINE_DIGITS = 3;
const RRF_DIGITS = 4;

export const WhyItMatched = ({
  id,
  hit,
  reranked,
  onClose,
}: {
  id: string;
  hit: ScoredBook;
  reranked: boolean;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation('catalog');
  const headingId = useId();
  const { book, scores, match } = hit;
  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  const rank = (value: number | null | undefined) =>
    value === null || value === undefined ? t('why.none') : t('why.rank', { rank: value });

  const signals: { label: string; value: string }[] = [
    { label: t('why.keywordRank'), value: rank(scores.lexical) },
    {
      label: t('why.semanticScore'),
      value: scores.semantic === null ? t('why.none') : number(scores.semantic, COSINE_DIGITS),
    },
    { label: t('why.semanticRank'), value: rank(match?.semanticRank) },
    {
      label: t('why.fusedRank'),
      value: `${rank(match?.fusedRank)} · ${t('why.rrf', { score: number(scores.fused, RRF_DIGITS) })}`,
    },
    ...(reranked ? [{ label: t('why.rerankedRank'), value: rank(match?.rerankedRank) }] : []),
  ];

  return (
    <aside
      id={id}
      aria-labelledby={headingId}
      className="sticky top-4 rounded-panel border border-line bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-body font-bold text-fg">
          {t('why.heading')}
        </h2>
        <IconButton
          label={t('why.close')}
          icon={<X className="size-5" aria-hidden="true" />}
          onClick={onClose}
          className="-mr-2 -mt-2"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <BookCover
          title={book.title}
          author={book.author}
          coverUrl={book.coverUrl}
          className="w-10 shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate text-small font-semibold text-fg" dir="auto">
            {book.title}
          </p>
          <p className="truncate text-meta text-fg-2" dir="auto">
            {book.author}
          </p>
        </div>
      </div>
      {match && match.matchedOn.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5 text-small text-fg">
          {match.matchedOn.map(reason => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              {t(`why.reasons.${reason}`)}
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 border-t border-line pt-3 text-meta">
        {signals.map(signal => (
          <div key={signal.label} className="contents">
            <dt className="py-1 text-fg-2">{signal.label}</dt>
            <dd className="tabular py-1 text-right text-fg">{signal.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-meta text-fg-3">{t('why.note')}</p>
    </aside>
  );
};
