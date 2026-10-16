import type { MouseEvent } from 'react';
import { create } from 'zustand';

export interface CoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BookOpenOrigin {
  bookId: number;
  rect: CoverRect;
  at: number;
}

export const BOOK_OPEN_ORIGIN_TTL_MS = 4000;

interface BookOpenState {
  origin: BookOpenOrigin | null;
  setOrigin: (origin: BookOpenOrigin) => void;
  clear: () => void;
}

export const useBookOpenStore = create<BookOpenState>()(set => ({
  origin: null,
  setOrigin: origin => set({ origin }),
  clear: () => set({ origin: null }),
}));

export const peekBookOpenOrigin = (bookId: number): BookOpenOrigin | null => {
  const { origin } = useBookOpenStore.getState();
  return origin && origin.bookId === bookId && Date.now() - origin.at <= BOOK_OPEN_ORIGIN_TTL_MS
    ? origin
    : null;
};

export const COVER_SCOPE_ATTR = 'data-cover-scope';

export const recordBookOpen = (event: MouseEvent<HTMLElement>, bookId: number): void => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.currentTarget;
  const cover =
    link.querySelector('.cover') ??
    link.closest(`[${COVER_SCOPE_ATTR}]`)?.querySelector('.cover') ??
    null;
  if (!cover) return;
  const box = cover.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  useBookOpenStore.getState().setOrigin({
    bookId,
    rect: { left: box.left, top: box.top, width: box.width, height: box.height },
    at: Date.now(),
  });
};
