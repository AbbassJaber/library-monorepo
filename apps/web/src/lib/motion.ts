import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { SplitText } from 'gsap/SplitText';
import { FLIP_ATTR, MOTION_OK, ORB_PART_ATTR } from './motionPrefs';

gsap.registerPlugin(useGSAP, Flip, SplitText);

export { gsap, useGSAP };
export { FLIP_ATTR, MOTION_OK, MOTION_REDUCE, ORB_PART_ATTR } from './motionPrefs';

export const BOOK_OPEN = {
  flight: 0.55,
  tiltDeg: -14,
  tiltOut: 0.28,
  tiltBack: 0.27,
  openAt: 0.45,
  open: 0.7,
  creaseIn: 0.45,
  contentAt: 0.88,
  content: 0.35,
  contentStagger: 0.05,
  contentRise: 10,
  stampAt: 1.18,
  toolbarAt: 0.3,
  toolbar: 0.3,
  closeSpeed: 1.25,
  fade: 0.2,
  perspective: 2200,
} as const;

export const BOOK_CLOSE = {
  contentOut: 0.15,
  shutAt: 0.08,
  shut: 0.55,
  flightAt: 0.6,
  flight: 0.5,
} as const;

export const BOOK_OPEN_NARROW = {
  fadeAt: BOOK_OPEN.openAt + BOOK_OPEN.open * 0.55,
  fade: 0.25,
} as const;

export const STAMP_THUNK = {
  duration: 0.32,
  fromScale: 1.8,
  fromRotation: -18,
  rotation: -8,
} as const;

export const EASE = {
  flight: 'power3.inOut',
  swing: 'power2.inOut',
  tiltOut: 'power2.out',
  rise: 'power2.out',
  stamp: 'back.out(2.2)',
  fade: 'power1.out',
} as const;

export const stampThunk = (stamp: Element): (() => void) => {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(
      stamp,
      {
        autoAlpha: 0,
        scale: STAMP_THUNK.fromScale,
        rotation: STAMP_THUNK.fromRotation,
      },
      {
        autoAlpha: 1,
        scale: 1,
        rotation: STAMP_THUNK.rotation,
        duration: STAMP_THUNK.duration,
        ease: EASE.stamp,
        clearProps: 'opacity,visibility,transform',
      }
    );
  });
  return () => mm.revert();
};

const withMotion = (play: (done: () => void) => void): void => {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => play(() => mm.kill(false)));
};

export const FLIP = {
  duration: 0.45,
  enter: 0.3,
  enterScale: 0.94,
  leave: 0.38,
} as const;

export interface FlipSnapshot {
  state: ReturnType<typeof Flip.getState>;
  before: { id: string; element: HTMLElement; rect: DOMRect }[];
}

const flipTargets = (scope: Element) => [...scope.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`)];

export const captureFlip = (scope: Element): FlipSnapshot => {
  const targets = flipTargets(scope);
  return {
    state: Flip.getState(targets),
    before: targets.map(element => ({
      id: element.getAttribute(FLIP_ATTR) ?? '',
      element,
      rect: element.getBoundingClientRect(),
    })),
  };
};

const fadeOutLeavers = (snapshot: FlipSnapshot, present: Set<string>) => {
  const gone = snapshot.before.filter(item => !present.has(item.id));
  const outermost = gone.filter(
    item => !gone.some(other => other !== item && other.element.contains(item.element))
  );
  for (const { element, rect } of outermost) {
    Object.assign(element.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
    });
    element.setAttribute('aria-hidden', 'true');
    element.inert = true;
    document.body.append(element);
    gsap.to(element, {
      autoAlpha: 0,
      duration: FLIP.leave,
      ease: EASE.fade,
      onComplete: () => element.remove(),
    });
  }
};

export const playFlip = (snapshot: FlipSnapshot, scope: Element): void =>
  withMotion(done => {
    const targets = flipTargets(scope);
    fadeOutLeavers(snapshot, new Set(targets.map(target => target.getAttribute(FLIP_ATTR) ?? '')));
    Flip.from(snapshot.state, {
      targets,
      duration: FLIP.duration,
      ease: EASE.swing,
      nested: true,
      prune: true,
      onEnter: elements =>
        gsap.fromTo(
          elements,
          { autoAlpha: 0, scale: FLIP.enterScale },
          {
            autoAlpha: 1,
            scale: 1,
            duration: FLIP.enter,
            ease: EASE.rise,
            clearProps: 'opacity,visibility,transform',
          }
        ),
      onComplete: done,
    });
  });

export const HEADLINE = { duration: 0.6, stagger: 0.05 } as const;

export const riseHeadline = (heading: HTMLElement, ready: () => void): void => {
  let ran = false;
  withMotion(done => {
    ran = true;
    const split = SplitText.create(heading, { type: 'words', mask: 'words', aria: 'auto' });
    ready();
    gsap.from(split.words, {
      yPercent: 100,
      duration: HEADLINE.duration,
      stagger: HEADLINE.stagger,
      ease: EASE.rise,
      onComplete: () => {
        split.revert();
        done();
      },
    });
  });
  if (!ran) ready();
};

export type OrbPart = 'outer' | 'middle' | 'inner';
export type OrbMode = 'listening' | 'speaking' | 'pulse' | 'rest';

export const ORB = {
  follow: 0.18,
  gain: 4,
  reach: {
    listening: { outer: 0.18, middle: 0.1, inner: 0.04 },
    speaking: { outer: 0.06, middle: 0.12, inner: 0.2 },
  },
  pulseScale: 1.06,
  pulse: 1.2,
  pulseStagger: 0.15,
  settle: 0.4,
} as const;

export const driveOrb = (
  root: HTMLElement,
  read: () => { mode: OrbMode; level: number }
): (() => void) => {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    const parts = [root, ...root.querySelectorAll<HTMLElement>(`[${ORB_PART_ATTR}]`)].filter(
      element => element.hasAttribute(ORB_PART_ATTR)
    );
    const follow = parts.map(part => {
      const toX = gsap.quickTo(part, 'scaleX', { duration: ORB.follow, ease: 'power3.out' });
      const toY = gsap.quickTo(part, 'scaleY', { duration: ORB.follow, ease: 'power3.out' });
      return {
        part: part.getAttribute(ORB_PART_ATTR) as OrbPart,
        to: (value: number) => {
          toX(value);
          toY(value);
        },
      };
    });
    let mode: OrbMode = 'rest';
    let pulse: gsap.core.Tween | null = null;
    const tick = () => {
      const { mode: next, level } = read();
      if (next !== mode) {
        mode = next;
        pulse?.kill();
        pulse = null;
        if (mode === 'pulse')
          pulse = gsap.to(parts, {
            scale: ORB.pulseScale,
            duration: ORB.pulse,
            stagger: ORB.pulseStagger,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          });
        else if (mode === 'rest') for (const { to } of follow) to(1);
      }
      if (mode === 'listening' || mode === 'speaking') {
        const amount = Math.min(1, level * ORB.gain);
        for (const { part, to } of follow) to(1 + amount * ORB.reach[mode][part]);
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      pulse?.kill();
    };
  });
  return () => mm.revert();
};

export const COMMAND_MENU = { duration: 0.15, fromScale: 0.96 } as const;

export const openMenu = (dialog: HTMLElement): void => {
  let ran = false;
  withMotion(done => {
    ran = true;
    gsap.fromTo(
      dialog,
      { opacity: 0, scale: COMMAND_MENU.fromScale },
      {
        opacity: 1,
        scale: 1,
        duration: COMMAND_MENU.duration,
        ease: EASE.rise,
        clearProps: 'opacity,transform',
        onComplete: done,
      }
    );
  });
  if (!ran) dialog.style.opacity = '';
};

export const closeMenu = (dialog: HTMLElement, closed: () => void): void => {
  let ran = false;
  withMotion(done => {
    ran = true;
    gsap.to(dialog, {
      opacity: 0,
      scale: COMMAND_MENU.fromScale,
      duration: COMMAND_MENU.duration,
      ease: EASE.fade,
      onComplete: () => {
        closed();
        done();
      },
    });
  });
  if (!ran) closed();
};
