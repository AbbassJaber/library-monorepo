import { ReadingState } from '@library/contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShelf } from '@/features/shelf/queries';

const SUGGESTIONS = ['s1', 's2', 's3'] as const;

export const useChatStarters = (): string[] => {
  const { t } = useTranslation();
  const shelf = useShelf();
  return useMemo(() => {
    const latest = (state: ReadingState) =>
      (shelf.data ?? [])
        .filter(entry => entry.state === state)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.book.title;
    const finished = latest(ReadingState.enum.FINISHED);
    const reading = latest(ReadingState.enum.READING);
    if (!finished && !reading) return SUGGESTIONS.map(key => t(`chat.suggestions.${key}`));
    return [
      ...(finished ? [t('chat.starters.after', { title: finished })] : []),
      ...(reading ? [t('chat.starters.like', { title: reading })] : []),
      t('chat.starters.french'),
    ];
  }, [shelf.data, t]);
};
