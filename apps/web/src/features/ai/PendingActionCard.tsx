import {
  ReadingState as ReadingStateSchema,
  ToolName,
  PendingActionStatus,
  ApiErrorCode,
  ReadingState,
} from '@library/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookCover } from '@/components/BookCover';
import { Stamp } from '@/components/Stamp';
import { Button } from '@/components/ui';
import { bookDetailOptions } from '@/features/catalog/queries';
import { describeError } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryKeys';
import { useChatStore } from '@/stores/chatStore';
import type { ChatEntry } from '@/stores/chatStore';
import { decideAction } from './chat';

const READING_LIST_TOOLS = new Set<string>([
  ToolName.enum.addToReadingList,
  ToolName.enum.updateReadingState,
  ToolName.enum.removeFromReadingList,
  ToolName.enum.changeReadingList,
]);

const proposalOf = (input: unknown): { bookId: number | null; state: ReadingState | null } => {
  if (typeof input !== 'object' || input === null) return { bookId: null, state: null };
  const { bookId, state } = input as { bookId?: unknown; state?: unknown };
  const parsed = ReadingStateSchema.safeParse(state);
  return {
    bookId: typeof bookId === 'number' ? bookId : null,
    state: parsed.success ? parsed.data : null,
  };
};

const decidedDay = (result: unknown): string => {
  const updatedAt =
    typeof result === 'object' && result !== null
      ? (result as { updatedAt?: unknown }).updatedAt
      : undefined;
  return typeof updatedAt === 'string' ? updatedAt : new Date().toISOString();
};

export const PendingActionCard = ({ entry }: { entry: ChatEntry }) => {
  const { t } = useTranslation();
  const labels = useLabels();
  const format = useFormat();
  const queryClient = useQueryClient();
  const setActionState = useChatStore(s => s.setActionState);
  const add = useChatStore(s => s.add);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const action = entry.action;
  const { bookId, state } = proposalOf(action?.pending.input);
  const book = useQuery({
    ...bookDetailOptions(bookId ?? 0),
    enabled: bookId !== null,
    refetchOnWindowFocus: false,
  });
  if (!action) return null;

  const decide = async (decision: 'confirm' | 'cancel') => {
    setActionState(entry.id, 'working');
    try {
      const outcome = await decideAction(action.pending.token, decision);
      if (outcome.status === PendingActionStatus.enum.confirmed) setJustConfirmed(true);
      setActionState(entry.id, outcome.status, {
        ...(outcome.status === PendingActionStatus.enum.confirmed
          ? { decidedAt: decidedDay(outcome.result) }
          : {}),
      });
      add({
        role: 'assistant',
        content: outcome.message.content,
        notice: true,
        ...(entry.callId === undefined ? {} : { callId: entry.callId }),
      });
      if (outcome.status === PendingActionStatus.enum.confirmed) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.shelf.list }),
          queryClient.invalidateQueries({ queryKey: qk.recommendations.all }),
        ]);
      }
    } catch (error) {
      setActionState(entry.id, 'failed', {
        error: isApiError(error, ApiErrorCode.enum.ACTION_ALREADY_DECIDED)
          ? t('chat.alreadyDecided')
          : isApiError(error, ApiErrorCode.enum.CONFIRM_TOKEN_INVALID)
            ? t('chat.expired')
            : describeError(error),
      });
    }
  };

  const { tool } = action.pending;
  const readingList = READING_LIST_TOOLS.has(tool);
  const title = book.data?.title;
  const target =
    tool === ToolName.enum.addToReadingList
      ? labels.states[state ?? ReadingState.enum.WANT_TO_READ]
      : tool === ToolName.enum.updateReadingState && state
        ? labels.states[state]
        : tool === ToolName.enum.removeFromReadingList
          ? t('chat.slip.offList')
          : null;
  const stampLabel =
    tool === ToolName.enum.addToReadingList
      ? t('chat.slip.added')
      : tool === ToolName.enum.updateReadingState && state
        ? labels.states[state]
        : tool === ToolName.enum.removeFromReadingList
          ? t('chat.slip.removed')
          : t('chat.slip.done');
  const done = action.state === 'confirmed' || action.state === 'cancelled';
  const eyebrow = readingList ? t('chat.slip.title') : t('chat.pendingTitle');

  return (
    <section
      aria-label={eyebrow}
      data-state={action.state}
      className="paper slip mt-3 flex items-center gap-4 p-4"
    >
      {book.data ? (
        <BookCover
          title={book.data.title}
          author={book.data.author}
          coverUrl={book.data.coverUrl}
          archived={action.state === 'cancelled'}
          className="w-12 shrink-0"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-meta font-semibold text-fg-2">{eyebrow}</p>
        <p
          dir="auto"
          className={cn(
            'mt-0.5 text-small font-bold',
            action.state === 'cancelled' ? 'text-fg-2' : 'text-fg'
          )}
        >
          {title && target ? (
            <>
              <span dir="auto">{title}</span> <span aria-hidden="true">→</span>
              <span className="sr-only">:</span> {target}
            </>
          ) : (
            action.pending.summary
          )}
        </p>
        {title && target ? <p className="sr-only">{action.pending.summary}</p> : null}
        {done ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-small text-fg-2">
            {action.state === 'confirmed' ? (
              <Check className="size-4 text-success" aria-hidden="true" />
            ) : (
              <X className="size-4" aria-hidden="true" />
            )}
            {action.state === 'confirmed' ? t('chat.slip.confirmedBy') : t('chat.cancelled')}
          </p>
        ) : null}
        {action.state === 'failed' && action.error ? (
          <p role="alert" className="mt-2 text-small text-danger">
            {action.error}
          </p>
        ) : null}
        {done || action.state === 'failed' ? null : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={action.state === 'working'}
              disabled={action.state === 'working'}
              onClick={() => void decide('confirm')}
            >
              {t('chat.confirm')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={action.state === 'working'}
              onClick={() => void decide('cancel')}
            >
              {t('chat.cancel')}
            </Button>
          </div>
        )}
      </div>
      {action.state === 'confirmed' ? (
        <Stamp
          label={stampLabel}
          date={format.day(action.decidedAt ?? new Date().toISOString())}
          thunk={justConfirmed}
          className="mr-1"
        />
      ) : null}
    </section>
  );
};
