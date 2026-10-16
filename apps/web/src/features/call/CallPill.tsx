import { Maximize2, Mic, MicOff, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { callActivity, useCallStore } from '@/stores/callStore';
import { endCall, restoreCall, setMuted } from './callSession';
import { CallControl } from './CallScreen';
import { Orb } from './Orb';
import { useCallClock } from './useCallClock';

export const CallPill = () => {
  const { t } = useTranslation();
  const muted = useCallStore(s => s.muted);
  const activity = useCallStore(callActivity);
  const clock = useCallClock();
  return (
    <section
      aria-label={t('call.pillLabel')}
      className="call-dark fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-full border border-line-strong py-2 pl-2 pr-2 shadow-pop sm:inset-x-auto sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2"
    >
      <Orb size="sm" activity={activity} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-fg">{t('call.librarian')}</p>
        <p role="status" className="truncate text-meta text-fg-2">
          {clock.running ? <span className="tabular text-fg">{clock.elapsed} · </span> : null}
          {t(`call.state.${activity}`)}
        </p>
      </div>
      <CallControl
        size="sm"
        label={t('call.mute')}
        pressed={muted}
        icon={
          muted ? (
            <MicOff className="size-5" aria-hidden="true" />
          ) : (
            <Mic className="size-5" aria-hidden="true" />
          )
        }
        onClick={() => setMuted(!muted)}
      />
      <CallControl
        size="sm"
        label={t('call.backToCall')}
        icon={<Maximize2 className="size-5" aria-hidden="true" />}
        onClick={restoreCall}
      />
      <CallControl
        size="sm"
        tone="danger"
        label={t('call.end')}
        icon={<Phone className="size-5 rotate-[135deg]" aria-hidden="true" />}
        onClick={endCall}
      />
    </section>
  );
};
