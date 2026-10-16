import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import type { ChatEntry } from '@/stores/chatStore';
import { formatAnswer } from './formatAnswer';
import { PendingActionCard } from './PendingActionCard';
import { ShelfAnswer } from './ShelfAnswer';

const actionBookId = (input: unknown): number | null =>
  typeof input === 'object' &&
  input !== null &&
  typeof (input as { bookId?: unknown }).bookId === 'number'
    ? (input as { bookId: number }).bookId
    : null;

export const Message = ({ entry, onFollow }: { entry: ChatEntry; onFollow: () => void }) => {
  const { t } = useTranslation();
  if (entry.role === 'user')
    return (
      <li className="flex justify-end">
        <span className="sr-only">{t('chat.you')}:</span>
        <p
          dir="auto"
          className="max-w-[85%] rounded-[18px] bg-surface-2 px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-line text-fg"
        >
          {entry.content}
        </p>
      </li>
    );
  if (entry.notice && !entry.action)
    return (
      <li className="text-small text-fg-2" dir="auto">
        {entry.content}
      </li>
    );
  const slipBook = actionBookId(entry.action?.pending.input);
  const shelf = (entry.citations ?? []).filter(citation => citation.bookId !== slipBook);
  return (
    <li>
      <div className="min-w-0" aria-busy={entry.speculative ? true : undefined}>
        <span className="sr-only">{t('chat.assistant')}:</span>
        {entry.content && !(entry.notice && entry.action) ? (
          <p
            dir="auto"
            className={cn(
              'text-[0.9375rem] leading-[1.6] whitespace-pre-line text-fg',
              entry.speculative && 'text-fg-2'
            )}
          >
            {formatAnswer(entry.content)}
          </p>
        ) : null}
        {shelf.length > 0 ? <ShelfAnswer citations={shelf} onFollow={onFollow} /> : null}
        {entry.action ? <PendingActionCard entry={entry} /> : null}
      </div>
    </li>
  );
};
