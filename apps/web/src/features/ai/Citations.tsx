import type { Citation } from '@library/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BookChip } from './BookChip';

export const Citations = ({
  citations,
  onFollow,
}: {
  citations: Citation[];
  onFollow?: () => void;
}) => {
  const { t } = useTranslation();
  const labelId = useId();
  if (citations.length === 0) return null;
  return (
    <div className="mt-3">
      <p id={labelId} className="sr-only">
        {t('chat.sources')}
      </p>
      <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {citations.map(citation => (
          <li key={citation.bookId} className="min-w-0 max-w-full sm:max-w-[15rem]">
            <BookChip bookId={citation.bookId} title={citation.title} onFollow={onFollow} />
          </li>
        ))}
      </ul>
    </div>
  );
};
