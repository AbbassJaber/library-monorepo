import { useEffect, useState } from 'react';
import { useCallStore } from '@/stores/callStore';

export const CALL_WARNING_SECONDS = 60;
const TICK_MS = 1000;

export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const useCallClock = () => {
  const startedAt = useCallStore(s => s.startedAt);
  const maxSeconds = useCallStore(s => s.maxSeconds);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt]);
  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  const left = maxSeconds === null ? null : Math.max(0, maxSeconds - elapsed);
  return {
    elapsed: formatClock(elapsed),
    left: left === null ? null : formatClock(left),
    warning: left !== null && left < CALL_WARNING_SECONDS,
    running: startedAt !== null,
  };
};
