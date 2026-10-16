import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { routes } from '@/app/routes';
import {
  BOOK_CLOSE,
  BOOK_OPEN,
  BOOK_OPEN_NARROW,
  EASE,
  MOTION_OK,
  MOTION_REDUCE,
  STAMP_THUNK,
  gsap,
  useGSAP,
} from '@/lib/motion';
import { prefersMotion } from '@/lib/motionPrefs';
import type { BookOpenOrigin, CoverRect } from '@/stores/bookOpenStore';
import { useBookOpenStore } from '@/stores/bookOpenStore';

export type BookPhase = 'opening' | 'open' | 'closing';

export const RISE_ATTR = 'data-rise';

const CLEAR_PROPS = 'transform,transformOrigin,zIndex,opacity,visibility';
const FLYING_Z = 40;

export interface BookParts {
  view: RefObject<HTMLDivElement | null>;
  book: RefObject<HTMLElement | null>;
  board: RefObject<HTMLDivElement | null>;
  page: RefObject<HTMLDivElement | null>;
  crease: RefObject<HTMLDivElement | null>;
  toolbar: RefObject<HTMLDivElement | null>;
  heading: RefObject<HTMLHeadingElement | null>;
}

const flightFrom = (rect: CoverRect, box: DOMRect) => ({
  x: rect.left + rect.width / 2 - (box.left + box.width / 2),
  y: rect.top + rect.height / 2 - (box.top + box.height / 2),
  scale: rect.width / box.width,
});

const isSpread = (board: HTMLElement, page: HTMLElement) => {
  const b = board.getBoundingClientRect();
  return b.width > 0 && b.right <= page.getBoundingClientRect().left + 1;
};

const visibleStamp = (scope: HTMLElement) =>
  [...scope.querySelectorAll<HTMLElement>('.stamp')].find(el => el.offsetParent !== null) ?? null;

const all = (...nodes: (Element | null)[]) => nodes.filter((n): n is Element => n !== null);

export const useBookOpen = (origin: BookOpenOrigin | null, parts: BookParts) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<BookPhase>(() =>
    origin && prefersMotion() ? 'opening' : 'open'
  );

  useEffect(() => useBookOpenStore.getState().clear(), []);

  const focusHeading = () => parts.heading.current?.focus({ preventScroll: true });
  const canGoBack = location.key !== 'default';
  const back = () => {
    if (canGoBack) void navigate(-1);
    else void navigate(routes.catalog);
  };

  useGSAP(
    () => {
      if (!origin) return;
      const mm = gsap.matchMedia();
      mm.add({ motion: MOTION_OK, reduce: MOTION_REDUCE }, context => {
        const book = parts.book.current;
        const board = parts.board.current;
        const page = parts.page.current;
        if (!book || !board || !page) return;
        if (!context.conditions?.['motion']) {
          gsap.fromTo(
            book,
            { autoAlpha: 0 },
            {
              autoAlpha: 1,
              duration: BOOK_OPEN.fade,
              ease: EASE.fade,
              clearProps: CLEAR_PROPS,
              onComplete: focusHeading,
            }
          );
          return;
        }
        window.scrollTo(0, 0);
        const items = [...page.querySelectorAll(`[${RISE_ATTR}]`)];
        const stamp = visibleStamp(book);
        const crease = parts.crease.current;
        const toolbar = parts.toolbar.current;
        const touched = all(book, board, page, crease, toolbar, stamp, ...items);

        const tl = gsap.timeline();
        const fastForward = () => tl.progress(1);
        const stopListening = () => {
          document.removeEventListener('pointerdown', fastForward, true);
          document.removeEventListener('keydown', fastForward, true);
        };
        document.addEventListener('pointerdown', fastForward, true);
        document.addEventListener('keydown', fastForward, true);
        tl.eventCallback('onComplete', () => {
          stopListening();
          gsap.set(touched, { clearProps: CLEAR_PROPS });
          setPhase('open');
          focusHeading();
        });

        gsap.set(book, { zIndex: FLYING_Z });
        gsap.set(items, { autoAlpha: 0, y: BOOK_OPEN.contentRise });
        if (stamp) gsap.set(stamp, { autoAlpha: 0 });
        if (toolbar)
          tl.fromTo(
            toolbar,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: BOOK_OPEN.toolbar },
            BOOK_OPEN.toolbarAt
          );

        if (isSpread(board, page)) {
          const pageBox = page.getBoundingClientRect();
          const bookBox = book.getBoundingClientRect();
          const halfPage = pageBox.width / 2;
          gsap.set(book, {
            transformOrigin: `${pageBox.left - bookBox.left + halfPage}px ${pageBox.height / 2}px`,
          });
          gsap.set(board, { rotationY: 180, z: 1 });
          tl.fromTo(
            book,
            flightFrom(origin.rect, pageBox),
            { x: -halfPage, y: 0, scale: 1, duration: BOOK_OPEN.flight, ease: EASE.flight },
            0
          )
            .to(
              book,
              {
                keyframes: [
                  { rotationY: BOOK_OPEN.tiltDeg, duration: BOOK_OPEN.tiltOut, ease: EASE.tiltOut },
                  { rotationY: 0, duration: BOOK_OPEN.tiltBack, ease: EASE.swing },
                ],
              },
              0
            )
            .to(book, { x: 0, duration: BOOK_OPEN.open, ease: EASE.swing }, BOOK_OPEN.openAt)
            .to(
              board,
              { rotationY: 0, duration: BOOK_OPEN.open, ease: EASE.swing },
              BOOK_OPEN.openAt
            );
          if (crease)
            tl.to(
              crease,
              {
                keyframes: [
                  { opacity: 1, duration: BOOK_OPEN.open * BOOK_OPEN.creaseIn },
                  { opacity: 0, duration: BOOK_OPEN.open * (1 - BOOK_OPEN.creaseIn) },
                ],
              },
              BOOK_OPEN.openAt
            );
        } else {
          gsap.set(page, { autoAlpha: 0 });
          gsap.set(board, { transformOrigin: '50% 50%', z: 1 });
          tl.fromTo(
            board,
            flightFrom(origin.rect, board.getBoundingClientRect()),
            { x: 0, y: 0, scale: 1, duration: BOOK_OPEN.flight, ease: EASE.flight },
            0
          )
            .set(board, { transformOrigin: '0% 50%' }, BOOK_OPEN.openAt)
            .to(page, { autoAlpha: 1, duration: BOOK_OPEN_NARROW.fade }, BOOK_OPEN.openAt)
            .to(
              board,
              { rotationY: -180, duration: BOOK_OPEN.open, ease: EASE.swing },
              BOOK_OPEN.openAt
            )
            .to(board, { autoAlpha: 0, duration: BOOK_OPEN_NARROW.fade }, BOOK_OPEN_NARROW.fadeAt);
        }

        tl.to(
          items,
          {
            autoAlpha: 1,
            y: 0,
            duration: BOOK_OPEN.content,
            stagger: BOOK_OPEN.contentStagger,
            ease: EASE.rise,
          },
          BOOK_OPEN.contentAt
        );
        if (stamp)
          tl.fromTo(
            stamp,
            { autoAlpha: 0, scale: STAMP_THUNK.fromScale, rotation: STAMP_THUNK.fromRotation },
            {
              autoAlpha: 1,
              scale: 1,
              rotation: STAMP_THUNK.rotation,
              duration: STAMP_THUNK.duration,
              ease: EASE.stamp,
            },
            BOOK_OPEN.stampAt
          );
        return stopListening;
      });
    },
    { scope: parts.view, dependencies: [] }
  );

  useGSAP(
    () => {
      if (phase !== 'closing' || !origin) return;
      const book = parts.book.current;
      const board = parts.board.current;
      const page = parts.page.current;
      if (!book || !board || !page) return;
      const items = [...page.querySelectorAll(`[${RISE_ATTR}]`)];
      const fading = all(parts.toolbar.current, ...items);
      const tl = gsap.timeline({ onComplete: back });
      gsap.set(book, { zIndex: FLYING_Z });
      tl.to(fading, { autoAlpha: 0, duration: BOOK_CLOSE.contentOut }, 0);

      if (isSpread(board, page)) {
        const pageBox = page.getBoundingClientRect();
        const bookBox = book.getBoundingClientRect();
        const halfPage = pageBox.width / 2;
        gsap.set(book, {
          transformOrigin: `${pageBox.left - bookBox.left + halfPage}px ${pageBox.height / 2}px`,
        });
        tl.fromTo(
          board,
          { rotationY: 0, z: 1 },
          { rotationY: 180, duration: BOOK_CLOSE.shut, ease: EASE.swing },
          BOOK_CLOSE.shutAt
        )
          .to(
            book,
            { x: -halfPage, duration: BOOK_CLOSE.shut, ease: EASE.swing },
            BOOK_CLOSE.shutAt
          )
          .to(
            book,
            { ...flightFrom(origin.rect, pageBox), duration: BOOK_CLOSE.flight, ease: EASE.flight },
            BOOK_CLOSE.flightAt
          );
      } else {
        const boardBox = board.getBoundingClientRect();
        gsap.set(board, { transformOrigin: '0% 50%', rotationY: -180, autoAlpha: 0, z: 1 });
        tl.to(board, { autoAlpha: 1, duration: BOOK_OPEN_NARROW.fade }, BOOK_CLOSE.shutAt)
          .to(
            board,
            { rotationY: 0, duration: BOOK_CLOSE.shut, ease: EASE.swing },
            BOOK_CLOSE.shutAt
          )
          .to(page, { autoAlpha: 0, duration: BOOK_OPEN_NARROW.fade }, BOOK_CLOSE.flightAt)
          .set(board, { transformOrigin: '50% 50%' }, BOOK_CLOSE.flightAt)
          .to(
            board,
            {
              ...flightFrom(origin.rect, boardBox),
              duration: BOOK_CLOSE.flight,
              ease: EASE.flight,
            },
            BOOK_CLOSE.flightAt
          );
      }
      tl.timeScale(BOOK_OPEN.closeSpeed);
    },
    { scope: parts.view, dependencies: [phase] }
  );

  const close = () => {
    if (phase === 'closing') return;
    const book = parts.book.current;
    if (!origin || !canGoBack || !book) {
      back();
      return;
    }
    if (!prefersMotion()) {
      gsap.to(book, { autoAlpha: 0, duration: BOOK_OPEN.fade, ease: EASE.fade, onComplete: back });
      return;
    }
    setPhase('closing');
  };

  return { phase, close };
};
