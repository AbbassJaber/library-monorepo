import { Captions, Mic, MicOff, Minimize2, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { BookChip } from '@/features/ai/BookChip';
import { PendingActionCard } from '@/features/ai/PendingActionCard';
import { cn } from '@/lib/cn';
import { callActivity, useCallStore } from '@/stores/callStore';
import { useChatStore } from '@/stores/chatStore';
import { endCall, minimizeCall, setMuted } from './callSession';
import { Orb } from './Orb';
import { useCallClock } from './useCallClock';

export const CallControl = ({
  label,
  icon,
  onClick,
  pressed,
  tone = 'neutral',
  size = 'lg',
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  tone?: 'neutral' | 'danger';
  size?: 'lg' | 'sm';
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={pressed}
    aria-label={size === 'sm' ? label : undefined}
    title={size === 'sm' ? label : undefined}
    className={cn(
      'group inline-flex flex-col items-center gap-2 rounded-control-lg text-meta text-fg-2',
      size === 'sm' && 'gap-0'
    )}
  >
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors',
        size === 'lg' ? 'size-14' : 'size-11',
        tone === 'danger'
          ? 'bg-danger-solid text-danger-ink group-hover:opacity-90'
          : pressed
            ? 'bg-fg text-bg'
            : 'bg-surface-2 text-fg group-hover:bg-fg/15'
      )}
    >
      {icon}
    </span>
    {size === 'lg' ? <span>{label}</span> : null}
  </button>
);

const useCallAction = () => {
  const callId = useCallStore(s => s.callId);
  return useChatStore(s =>
    callId === null
      ? undefined
      : s.entries.findLast(
          entry =>
            entry.callId === callId &&
            entry.action !== undefined &&
            (entry.action.state === 'pending' ||
              entry.action.state === 'working' ||
              entry.action.state === 'failed')
        )
  );
};

export const CallScreen = () => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const phase = useCallStore(s => s.phase);
  const muted = useCallStore(s => s.muted);
  const captions = useCallStore(s => s.captions);
  const lastUser = useCallStore(s => s.lastUser);
  const lastAssistant = useCallStore(s => s.lastAssistant);
  const mentioned = useCallStore(s => s.mentioned);
  const set = useCallStore(s => s.set);
  const activity = useCallStore(callActivity);
  const clock = useCallClock();
  const action = useCallAction();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      minimizeCall();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  const mentionedList = (className: string) =>
    mentioned.length > 0 ? (
      <section aria-labelledby={`${titleId}-mentioned`} className={className}>
        <h3 id={`${titleId}-mentioned`} className="mb-3 text-label text-fg-2">
          {t('call.mentioned')}
        </h3>
        <ul className="flex flex-col gap-2">
          {mentioned.map(book => (
            <li key={book.bookId}>
              <BookChip bookId={book.bookId} title={book.title} onFollow={minimizeCall} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <dialog ref={ref} aria-labelledby={titleId} className="call-screen call-dark">
      <div className="flex min-h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
            <h2 id={titleId} className="text-body font-semibold">
              {t('call.onCall')}
            </h2>
            {clock.running ? (
              <p className="tabular text-small text-fg-2">
                <span className="sr-only">{t('call.elapsed')}: </span>
                <span className="text-fg">{clock.elapsed}</span>
                {clock.left ? (
                  <span className={cn(clock.warning && 'text-warning')}>
                    {' · '}
                    {t('call.left', { time: clock.left })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Minimize2 className="size-4" aria-hidden="true" />}
            onClick={minimizeCall}
          >
            {t('call.minimize')}
          </Button>
        </header>

        <div className="grid flex-1 gap-8 px-5 pb-6 sm:px-8 lg:grid-cols-[17rem_minmax(0,1fr)_17rem]">
          {mentionedList('hidden lg:block')}
          <div className="flex flex-col items-center text-center lg:col-start-2">
            <Orb size="lg" activity={activity} className="mt-2 sm:mt-6" />
            <p role="status" className="mt-8 text-h2">
              {t(`call.state.${activity}`)}
            </p>
            <p className="mt-1 text-small text-fg-2">{t('call.hint')}</p>
            {captions ? (
              <div aria-live="polite" className="mt-8 flex w-full max-w-2xl flex-col gap-3">
                {lastUser ? (
                  <p className="text-body text-fg-2" dir="auto">
                    <span className="font-semibold">{t('call.you')}:</span> {lastUser}
                  </p>
                ) : null}
                {lastAssistant ? (
                  <p className="text-[1.375rem] leading-snug font-medium text-fg" dir="auto">
                    {lastAssistant}
                  </p>
                ) : null}
              </div>
            ) : null}
            {action ? (
              <div className="mt-6 w-full max-w-xl text-left">
                <PendingActionCard entry={action} />
              </div>
            ) : null}
            {mentionedList('mt-8 w-full max-w-xl text-left lg:hidden')}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-center gap-6 bg-bg px-5 pb-8 pt-4 sm:gap-8">
          <CallControl
            label={t('call.mute')}
            icon={
              muted ? (
                <MicOff className="size-6" aria-hidden="true" />
              ) : (
                <Mic className="size-6" aria-hidden="true" />
              )
            }
            pressed={muted}
            onClick={() => setMuted(!muted)}
          />
          <CallControl
            label={t('call.captions')}
            icon={<Captions className="size-6" aria-hidden="true" />}
            pressed={captions}
            onClick={() => set({ captions: !captions })}
          />
          <CallControl
            label={t('call.end')}
            icon={<Phone className="size-6 rotate-[135deg]" aria-hidden="true" />}
            tone="danger"
            onClick={endCall}
          />
        </div>
        {phase === 'ending' ? <span className="sr-only">{t('call.ending')}</span> : null}
      </div>
    </dialog>
  );
};
