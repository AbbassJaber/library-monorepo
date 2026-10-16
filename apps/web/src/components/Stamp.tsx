import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { loadMotion, prefersMotion } from '@/lib/motionPrefs';

export const Stamp = ({
  label,
  date,
  thunk = false,
  className,
}: {
  label: string;
  date: string;
  thunk?: boolean;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!thunk || !el || !prefersMotion()) return;
    el.style.visibility = 'hidden';
    let undo: (() => void) | undefined;
    let cancelled = false;
    loadMotion()
      .then(motion => {
        if (!cancelled) undo = motion.stampThunk(el);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled && !undo) el.style.visibility = '';
      });
    return () => {
      cancelled = true;
      undo?.();
      el.style.visibility = '';
    };
  }, [thunk]);

  return (
    <span ref={ref} className={cn('stamp', className)}>
      <span className="stamp-label">{label}</span>
      <span className="stamp-date tabular">{date}</span>
    </span>
  );
};
