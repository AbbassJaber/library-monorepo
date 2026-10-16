import { VoiceEndReason } from '@library/contracts';
import { Phone } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { formatClock } from '@/features/call/useCallClock';
import type { ChatEntry } from '@/stores/chatStore';
import { Message } from './Message';

export const CallRecordEntry = ({
  entry,
  transcript,
  onFollow,
}: {
  entry: ChatEntry & { call: NonNullable<ChatEntry['call']> };
  transcript: ChatEntry[];
  onFollow: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { call } = entry;
  const confirmed = transcript.filter(e => e.action?.state === 'confirmed').length;
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(call.startedAt));
  const details = [
    when,
    confirmed > 0 ? t('call.record.confirmed', { count: confirmed }) : null,
    call.reason === VoiceEndReason.enum.user ? null : t(`call.record.ended.${call.reason}`),
  ].filter(Boolean);
  return (
    <li>
      <div className="rounded-control-lg border border-line bg-surface-2">
        <div className="flex items-center gap-3 p-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent"
          >
            <Phone className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-fg">
              {t('call.record.title', { duration: '' })}
              <span className="tabular">{formatClock(call.durationSeconds)}</span>
            </p>
            <p className="truncate text-meta text-fg-2">{details.join(' · ')}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
          >
            {t('call.record.transcript')}
          </Button>
        </div>
        {open ? (
          <div id={panelId} className="border-t border-line p-3">
            {transcript.length === 0 ? (
              <p className="text-small text-fg-2">{t('call.record.empty')}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {transcript.map(item => (
                  <Message key={item.id} entry={item} onFollow={onFollow} />
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
};
