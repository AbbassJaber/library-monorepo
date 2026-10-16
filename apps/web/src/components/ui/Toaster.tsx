import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';

const ToastItem = ({
  id,
  tone,
  message,
}: {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
}) => {
  const { t } = useTranslation();
  const dismiss = useUiStore(s => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [id, tone, dismiss]);
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-control-lg border py-2 pl-4 pr-2 text-small shadow-pop',
        tone === 'error'
          ? 'border-danger/40 bg-danger-soft text-fg'
          : 'border-line bg-surface-2 text-fg'
      )}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => dismiss(id)}
        className="min-h-11 min-w-11 rounded-control text-fg-2 hover:bg-fg/5 hover:text-fg"
        aria-label={t('actions.dismiss')}
      >
        <X className="mx-auto size-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export const Toaster = () => {
  const toasts = useUiStore(s => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96">
      <div role="status" aria-live="polite" className="contents">
        {toasts
          .filter(t => t.tone !== 'error')
          .map(t => (
            <div key={t.id} className="pointer-events-auto w-full">
              <ToastItem {...t} />
            </div>
          ))}
      </div>
      <div role="alert" aria-live="assertive" className="contents">
        {toasts
          .filter(t => t.tone === 'error')
          .map(t => (
            <div key={t.id} className="pointer-events-auto w-full">
              <ToastItem {...t} />
            </div>
          ))}
      </div>
    </div>
  );
};
