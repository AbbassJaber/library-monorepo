import { AudioLines } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { OrbMode } from '@/lib/motion';
import { ORB_PART_ATTR, loadMotion, prefersMotion } from '@/lib/motionPrefs';
import type { CallActivity } from '@/stores/callStore';
import { callLevels } from './callSession';

const SIZES = {
  xs: { outer: 'size-8', inner: 'size-4' },
  sm: { outer: 'size-11', inner: 'size-6' },
  lg: {
    outer: 'size-56 sm:size-72',
    middle: 'size-44 sm:size-56',
    inner: 'size-32 sm:size-40',
    icon: 'size-12 sm:size-16',
  },
} as const;

const modeOf = (activity: CallActivity | undefined): OrbMode =>
  activity === 'listening'
    ? 'listening'
    : activity === 'speaking'
      ? 'speaking'
      : activity === 'thinking' || activity === 'connecting'
        ? 'pulse'
        : 'rest';

const useOrbMotion = (activity: CallActivity | undefined) => {
  const ref = useRef<HTMLElement | null>(null);
  const activityRef = useRef(activity);
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);
  const [live, setLive] = useState(activity !== undefined);
  if (activity !== undefined && !live) setLive(true);

  useEffect(() => {
    const root = ref.current;
    if (!live || !root || !prefersMotion()) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadMotion()
      .then(motion => {
        if (cancelled) return;
        stop = motion.driveOrb(root, () => {
          const mode = modeOf(activityRef.current);
          return {
            mode,
            level: mode === 'listening' ? callLevels.mic : mode === 'speaking' ? callLevels.out : 0,
          };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [live]);
  return useCallback((element: HTMLElement | null) => {
    ref.current = element;
  }, []);
};

const part = (name: 'outer' | 'middle' | 'inner') => ({ [ORB_PART_ATTR]: name });

export const Orb = ({
  size = 'sm',
  activity,
  className,
}: {
  size?: keyof typeof SIZES;
  activity?: CallActivity | undefined;
  className?: string;
}) => {
  const ref = useOrbMotion(activity);
  if (size !== 'lg') {
    const s = SIZES[size];
    return (
      <span
        ref={ref}
        aria-hidden="true"
        data-activity={activity}
        {...part('outer')}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-accent/55 bg-accent-soft',
          s.outer,
          className
        )}
      >
        <span {...part('inner')} className={cn('rounded-full bg-accent', s.inner)} />
      </span>
    );
  }
  const s = SIZES.lg;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-activity={activity}
      className={cn('orb flex items-center justify-center', s.outer, className)}
    >
      <div
        {...part('outer')}
        className="flex size-full items-center justify-center rounded-full bg-accent/10"
      >
        <div
          {...part('middle')}
          className={cn('flex items-center justify-center rounded-full bg-accent/20', s.middle)}
        >
          <div
            {...part('inner')}
            className={cn(
              'flex items-center justify-center rounded-full bg-accent/45 text-fg',
              s.inner
            )}
          >
            <AudioLines className={s.icon} strokeWidth={2.25} />
          </div>
        </div>
      </div>
    </div>
  );
};
