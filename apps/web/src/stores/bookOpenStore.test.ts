import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOOK_OPEN_ORIGIN_TTL_MS,
  peekBookOpenOrigin,
  recordBookOpen,
  useBookOpenStore,
} from './bookOpenStore';

const coverLink = () => {
  const link = document.createElement('a');
  const cover = document.createElement('div');
  cover.className = 'cover';
  cover.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 150 }) as DOMRect;
  link.append(cover);
  document.body.append(link);
  return link;
};

const click = (link: HTMLElement, modifiers: Partial<MouseEvent<HTMLElement>> = {}) =>
  ({
    currentTarget: link,
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  }) as MouseEvent<HTMLElement>;

describe('the open-book origin', () => {
  afterEach(() => {
    useBookOpenStore.getState().clear();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it("records the clicked cover's box for that book", () => {
    recordBookOpen(click(coverLink()), 7);
    expect(peekBookOpenOrigin(7)?.rect).toEqual({ left: 10, top: 20, width: 100, height: 150 });
    expect(peekBookOpenOrigin(8)).toBeNull();
  });

  it('ignores clicks that open a new tab or window', () => {
    recordBookOpen(click(coverLink(), { metaKey: true }), 7);
    recordBookOpen(click(coverLink(), { ctrlKey: true }), 7);
    expect(peekBookOpenOrigin(7)).toBeNull();
  });

  it('expires, so a slow navigation opens without the flight', () => {
    vi.useFakeTimers();
    recordBookOpen(click(coverLink()), 7);
    vi.advanceTimersByTime(BOOK_OPEN_ORIGIN_TTL_MS + 1);
    expect(peekBookOpenOrigin(7)).toBeNull();
  });
});
