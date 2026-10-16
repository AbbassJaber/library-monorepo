import { ArrowUp, Mic } from 'lucide-react';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import { MESSAGE_MAX } from './chat';
import { composerSize } from './composerSize';
import { dictationSupported, useDictation } from './useDictation';

export const Composer = ({
  inputRef,
  initialText,
  pending,
  onSend,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  initialText: string;
  pending: boolean;
  onSend: (text: string) => boolean;
}) => {
  const { t } = useTranslation();
  const locale = useUiStore(s => s.locale);
  const [text, setText] = useState(initialText);
  const inputId = useId();
  const hintId = useId();
  const canDictate = dictationSupported();

  const insert = useCallback(
    (phrase: string) => {
      if (!phrase) return;
      const input = inputRef.current;
      setText(current => {
        const start = input?.selectionStart ?? current.length;
        const end = input?.selectionEnd ?? current.length;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const joined = `${before}${before && !/\s$/.test(before) ? ' ' : ''}${phrase}`;
        requestAnimationFrame(() => input?.setSelectionRange(joined.length, joined.length));
        return `${joined}${after && !/^\s/.test(after) ? ' ' : ''}${after}`.slice(0, MESSAGE_MAX);
      });
    },
    [inputRef]
  );
  const dictation = useDictation(locale, insert);

  const fit = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const style = getComputedStyle(input);
    const { height, scrolls } = composerSize({
      contentHeight: input.scrollHeight,
      lineHeight: parseFloat(style.lineHeight) || 24,
      verticalPadding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 0,
      viewportHeight: window.innerHeight,
    });
    input.style.height = `${height}px`;
    input.style.overflowY = scrolls ? 'auto' : 'hidden';
  }, [inputRef]);
  useEffect(fit, [fit, text, dictation.interim]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const submit = () => {
    dictation.stop();
    if (onSend(text)) setText('');
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && dictation.listening) {
      event.preventDefault();
      event.stopPropagation();
      dictation.stop();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={onSubmit} className="px-4 pb-4 pt-2">
      <div
        className={cn(
          'rounded-[26px] border bg-input py-1.5 pl-5 pr-1.5',
          dictation.listening ? 'border-accent' : 'border-line focus-within:border-line-strong'
        )}
      >
        {dictation.listening ? (
          <p
            role="status"
            className="flex items-center gap-2 pt-1.5 text-meta font-semibold text-danger"
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
            {t('dictation.listening')}
            <span aria-hidden="true" className="flex items-end gap-0.5">
              {[3, 6, 9, 5, 8].map((h, i) => (
                <span key={i} className="w-0.5 rounded-full bg-danger" style={{ height: h + 2 }} />
              ))}
            </span>
          </p>
        ) : null}
        <label htmlFor={inputId} className="sr-only">
          {t('chat.inputLabel')}
        </label>
        <div className="flex items-end gap-1">
          <div className="min-w-0 flex-1">
            <textarea
              ref={inputRef}
              id={inputId}
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              dir="auto"
              maxLength={MESSAGE_MAX}
              placeholder={t('chat.placeholder')}
              aria-describedby={hintId}
              className="block min-h-11 w-full resize-none overflow-y-hidden bg-transparent py-2.5 text-[0.9375rem] leading-6 text-fg [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin] placeholder:text-fg-3 focus:outline-none focus-visible:outline-none"
            />
            {dictation.interim ? (
              <p
                aria-hidden="true"
                className="pb-1 text-[0.9375rem] leading-6 text-fg-2"
                dir="auto"
              >
                {dictation.interim}
              </p>
            ) : null}
          </div>
          {canDictate ? (
            <IconButton
              label={dictation.listening ? t('dictation.stop') : t('dictation.start')}
              aria-pressed={dictation.listening}
              icon={<Mic className="size-5" aria-hidden="true" />}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              className={cn(
                'rounded-full border-transparent text-fg-2',
                dictation.listening &&
                  'bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger'
              )}
            />
          ) : null}
          <button
            type="submit"
            aria-label={t('chat.sendLabel')}
            title={t('chat.sendLabel')}
            disabled={pending || text.trim().length === 0}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? (
              <Spinner className="size-4" />
            ) : (
              <ArrowUp className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <p id={hintId} className="sr-only">
        {t('chat.composerHint')}
      </p>
    </form>
  );
};
