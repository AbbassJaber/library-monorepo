import { ReadingState, type BookSummary, type ReadingListEntry } from '@library/contracts';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useLabels } from '@/i18n/useLabels';
import { cn } from '@/lib/cn';
import { useAddToShelf, useRemoveFromShelf, useUpdateReadingState } from './mutations';

export const READING_STATES: ReadingState[] = [
  ReadingState.enum.WANT_TO_READ,
  ReadingState.enum.READING,
  ReadingState.enum.FINISHED,
];

export const StateSelect = ({
  book,
  entry,
  label,
  compact = false,
  solid = false,
  className,
}: {
  book: BookSummary;
  entry: ReadingListEntry;
  label: string;
  compact?: boolean;
  solid?: boolean;
  className?: string;
}) => {
  const labels = useLabels();
  const update = useUpdateReadingState();
  const id = useId();
  const locked = !entry.available || entry.id < 0;
  return (
    <span className={cn('relative inline-flex', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={entry.state}
        disabled={locked}
        onChange={event =>
          update.mutate({ bookId: book.id, state: event.target.value as ReadingState })
        }
        className={cn(
          'min-h-11 w-full cursor-pointer appearance-none rounded-full border text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60',
          solid
            ? 'border-transparent bg-accent text-accent-ink hover:bg-accent-hover'
            : 'border-line-strong bg-transparent text-fg hover:bg-fg/5',
          compact ? 'pl-3 pr-7' : 'pl-5 pr-10'
        )}
      >
        {READING_STATES.map(state => (
          <option key={state} value={state}>
            {labels.states[state]}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 size-4 -translate-y-1/2',
          solid ? 'text-accent-ink' : 'text-fg',
          compact ? 'right-2.5' : 'right-4'
        )}
        aria-hidden="true"
      />
    </span>
  );
};

export const ShelfControls = ({
  book,
  entry,
  compact = false,
  solid = false,
}: {
  book: BookSummary;
  entry: ReadingListEntry | undefined;
  compact?: boolean;
  solid?: boolean;
}) => {
  const { t } = useTranslation('shelf');
  const labels = useLabels();
  const add = useAddToShelf();
  const remove = useRemoveFromShelf();

  if (!entry) {
    return (
      <Button onClick={() => add.mutate({ book })} loading={add.isPending}>
        {labels.addToShelf}
      </Button>
    );
  }
  const pending = entry.id < 0;
  return (
    <div
      className={cn('flex gap-2', compact ? 'flex-col items-stretch' : 'flex-wrap items-center')}
    >
      <StateSelect
        book={book}
        entry={entry}
        label={t('readingState')}
        compact={compact}
        solid={solid}
      />
      <Button
        variant={compact ? 'quiet' : 'secondary'}
        size={compact ? 'sm' : 'md'}
        onClick={() => remove.mutate({ bookId: book.id })}
        loading={remove.isPending}
        disabled={pending}
        aria-label={t('removeTitled', { title: book.title, shelf: labels.shelf.toLowerCase() })}
        className={compact ? 'text-fg-2' : undefined}
      >
        {t('remove')}
      </Button>
    </div>
  );
};
