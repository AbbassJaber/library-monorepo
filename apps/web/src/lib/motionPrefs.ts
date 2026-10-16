import type * as MotionModule from './motion';

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';
export const MOTION_REDUCE = '(prefers-reduced-motion: reduce)';

export const FLIP_ATTR = 'data-flip-id';
export const HEADLINE_SEEN_KEY = 'library-headline-risen';

export const ORB_PART_ATTR = 'data-orb-part';

export const prefersMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(MOTION_OK).matches;

type Motion = typeof MotionModule;
let loaded: Motion | null = null;

export const loadMotion = (): Promise<Motion> =>
  import('./motion').then(motion => (loaded = motion));

export const loadedMotion = (): Motion | null => loaded;

const sessionFlag = {
  get: (key: string): boolean => {
    try {
      return window.sessionStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  },
  set: (key: string): void => {
    try {
      window.sessionStorage.setItem(key, '1');
    } catch {}
  },
};

export const HEADLINE_WAIT_MS = 300;
const IDLE_FALLBACK_MS = 2000;

export const preloadMotionWhenIdle = (): (() => void) => {
  if (!prefersMotion()) return () => undefined;
  const load = () => void loadMotion().catch(() => undefined);
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(load);
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(load, IDLE_FALLBACK_MS);
  return () => clearTimeout(timer);
};

export const riseHeadlineOnce = (heading: HTMLElement): (() => void) => {
  if (!prefersMotion() || sessionFlag.get(HEADLINE_SEEN_KEY)) return () => undefined;
  heading.style.visibility = 'hidden';
  let settled = false;
  const show = () => {
    heading.style.visibility = '';
  };
  const giveUp = setTimeout(() => {
    if (settled) return;
    settled = true;
    sessionFlag.set(HEADLINE_SEEN_KEY);
    show();
  }, HEADLINE_WAIT_MS);
  loadMotion()
    .then(motion => {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      sessionFlag.set(HEADLINE_SEEN_KEY);
      motion.riseHeadline(heading, show);
    })
    .catch(show);
  return () => {
    settled = true;
    clearTimeout(giveUp);
    show();
  };
};
