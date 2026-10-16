import { useMutation } from '@tanstack/react-query';
import { ArrowDown, Phone, SquarePen, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui';
import { Orb } from '@/features/call/Orb';
import { useStartCall } from '@/features/call/useStartCall';
import { describeError } from '@/i18n/errors';
import { cn } from '@/lib/cn';
import { useChatStore } from '@/stores/chatStore';
import { useUiStore } from '@/stores/uiStore';
import { isAiUnavailable } from './api';
import { CallRecordEntry } from './CallRecordEntry';
import { MESSAGE_MAX, historyOf, sendChat } from './chat';
import { Composer } from './Composer';
import { Message } from './Message';
import { ShelfThinking } from './ShelfAnswer';
import { useChatStarters } from './useChatStarters';
import { useCanTalk } from './useVoice';

const NEAR_BOTTOM_PX = 120;

export const ChatPanel = () => {
  const { t } = useTranslation();
  const open = useChatStore(s => s.open);
  const setOpen = useChatStore(s => s.setOpen);
  const entries = useChatStore(s => s.entries);
  const add = useChatStore(s => s.add);
  const reset = useChatStore(s => s.reset);
  const draft = useChatStore(s => s.draft);
  const takeDraft = useChatStore(s => s.takeDraft);
  const context = useChatStore(s => s.context);
  const setContext = useChatStore(s => s.setContext);
  const locale = useUiStore(s => s.locale);
  const canTalk = useCanTalk();
  const startCall = useStartCall();
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const starters = useChatStarters();

  useEffect(() => {
    if (open && draft !== null) takeDraft();
  }, [open, draft, takeDraft]);

  const chat = useMutation({
    mutationFn: (turn: { message: string; history: ReturnType<typeof historyOf> }) =>
      sendChat(turn.history, locale, context ? { bookId: context.bookId } : undefined),
    onMutate: turn => add({ role: 'user', content: turn.message }),
    onSuccess: ({ data }) =>
      add({
        role: 'assistant',
        content: data.message.content,
        ...(data.message.citations ? { citations: data.message.citations } : {}),
        ...(data.pendingAction
          ? { action: { pending: data.pendingAction, state: 'pending' as const } }
          : {}),
      }),
    onError: error =>
      add({
        role: 'assistant',
        notice: true,
        content: isAiUnavailable(error) ? t('chat.unavailable') : describeError(error),
      }),
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) {
      dialog.showModal();
      const input = inputRef.current;
      if (input && input.value.length > 0) input.focus();
    }
    const handleClose = () => setOpen(false);
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleClick);
      if (dialog.open) dialog.close();
    };
  }, [open, setOpen]);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function')
      el.scrollTo({
        top: el.scrollHeight,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  }, []);
  useEffect(() => {
    if (!awayFromBottom) scrollToEnd();
  }, [entries.length, chat.isPending, awayFromBottom, scrollToEnd]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX);
  };

  const send = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed || chat.isPending) return false;
    const message = trimmed.slice(0, MESSAGE_MAX);
    chat.mutate({ message, history: historyOf(entries, message) });
    return true;
  };

  if (!open) return null;
  const visible = entries.filter(entry => entry.callId === undefined);
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} aria-labelledby={titleId} className="drawer">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Orb size="sm" activity={chat.isPending ? 'thinking' : undefined} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-body font-bold">
            {t('chat.title')}
          </h2>
          <p
            className={cn(
              'truncate text-meta leading-snug',
              chat.isPending ? 'text-link' : 'text-fg-2'
            )}
          >
            {chat.isPending ? t('chat.state.thinking') : t('chat.state.idle')}
          </p>
        </div>
        {canTalk ? (
          <Button
            size="sm"
            icon={<Phone className="size-4" aria-hidden="true" />}
            onClick={startCall}
            aria-label={t('call.start')}
          >
            {t('call.short')}
          </Button>
        ) : null}
        {entries.length > 0 ? (
          <IconButton
            label={t('chat.newChat')}
            icon={<SquarePen className="size-5" aria-hidden="true" />}
            onClick={reset}
            disabled={chat.isPending}
          />
        ) : null}
        <IconButton
          label={t('actions.close')}
          icon={<X className="size-5" aria-hidden="true" />}
          onClick={close}
        />
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-4 py-5"
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-start">
            <Orb size="sm" />
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-2">{t('chat.intro')}</p>
            {canTalk ? (
              <Button
                variant="quiet"
                className="mt-3 px-2 text-link"
                icon={<Phone className="size-4" aria-hidden="true" />}
                onClick={startCall}
              >
                {t('call.orCall')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div role="log" aria-live="polite" aria-busy={chat.isPending} aria-label={t('chat.title')}>
          <ol className="flex flex-col gap-5">
            {visible.map(entry =>
              entry.call ? (
                <CallRecordEntry
                  key={entry.id}
                  entry={{ ...entry, call: entry.call }}
                  transcript={entries.filter(e => e.callId === entry.call?.id)}
                  onFollow={close}
                />
              ) : (
                <Message key={entry.id} entry={entry} onFollow={close} />
              )
            )}
          </ol>
        </div>
        {chat.isPending ? (
          <div className="mt-5">
            <ShelfThinking />
          </div>
        ) : null}
      </div>
      {awayFromBottom ? (
        <div className="pointer-events-none relative">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto absolute -top-14 left-1/2 -translate-x-1/2 bg-surface-2 shadow-pop"
            icon={<ArrowDown className="size-4" aria-hidden="true" />}
            onClick={() => {
              setAwayFromBottom(false);
              scrollToEnd();
            }}
          >
            {t('chat.jumpLatest')}
          </Button>
        </div>
      ) : null}

      {context ? (
        <div className="px-4 pt-2">
          <span className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 pl-4 pr-1 text-small text-fg-2">
            <span className="truncate">
              {t('chat.askingAbout')}{' '}
              <span className="font-semibold text-fg" dir="auto">
                {context.title}
              </span>
            </span>
            <IconButton
              label={t('chat.removeContext', { title: context.title })}
              icon={<X className="size-4" aria-hidden="true" />}
              onClick={() => setContext(null)}
              className="size-9 rounded-full"
            />
          </span>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <ul aria-label={t('chat.startersLabel')} className="flex flex-wrap gap-2 px-4 pt-2">
          {starters.map(starter => (
            <li key={starter} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => send(starter)}
                className="min-h-11 max-w-full truncate rounded-full border border-line px-4 text-left text-small text-fg hover:border-line-strong hover:bg-fg/5"
              >
                <span dir="auto">{starter}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Composer
        inputRef={inputRef}
        initialText={draft ?? ''}
        pending={chat.isPending}
        onSend={send}
      />
    </dialog>
  );
};
