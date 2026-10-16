import type { Book } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '@/components/ui';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';

interface Props {
  current: Book | null;
  onClose: () => void;
  onRetryWithMine: (current: Book) => void;
  onTakeTheirs: (current: Book) => void;
}

export const VersionConflictDialog = ({
  current,
  onClose,
  onRetryWithMine,
  onTakeTheirs,
}: Props) => {
  const { t } = useTranslation('librarian');
  const labels = useLabels();
  const format = useFormat();
  return (
    <Dialog
      open={current !== null}
      title={t('conflict.title', { item: labels.item.toLowerCase() })}
      onClose={onClose}
      footer={
        current ? (
          <>
            <Button variant="secondary" onClick={() => onTakeTheirs(current)}>
              {t('conflict.takeTheirs')}
            </Button>
            <Button onClick={() => onRetryWithMine(current)}>{t('conflict.keepMine')}</Button>
          </>
        ) : null
      }
    >
      {current ? (
        <div className="text-body">
          <p>{t('conflict.body', { version: current.version })}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
            <dt className="text-fg-2">{t('form.fields.title')}</dt>
            <dd dir="auto">{current.title}</dd>
            <dt className="text-fg-2">{labels.creator}</dt>
            <dd dir="auto">{current.author}</dd>
            <dt className="text-fg-2">{labels.year}</dt>
            <dd>{format.year(current.publishedYear)}</dd>
            <dt className="text-fg-2">{labels.genres}</dt>
            <dd>{current.genres.map(g => g.name).join(', ')}</dd>
          </dl>
          <p className="mt-3 text-fg-2">{t('conflict.explain', { version: current.version })}</p>
        </div>
      ) : null}
    </Dialog>
  );
};
