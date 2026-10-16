import { describe, expect, it } from 'vitest';
import { COMPOSER_MAX_VIEWPORT, composerSize } from './composerSize';

const box = { lineHeight: 24, verticalPadding: 20 };

describe('composerSize', () => {
  it('grows with the text and does not scroll below the cap', () => {
    expect(composerSize({ ...box, contentHeight: 44, viewportHeight: 900 })).toEqual({
      height: 44,
      scrolls: false,
    });
    expect(composerSize({ ...box, contentHeight: 284, viewportHeight: 900 })).toEqual({
      height: 284,
      scrolls: false,
    });
  });

  it('stops at a share of the window, then scrolls inside', () => {
    expect(composerSize({ ...box, contentHeight: 1200, viewportHeight: 900 })).toEqual({
      height: 900 * COMPOSER_MAX_VIEWPORT,
      scrolls: true,
    });
  });

  it('on a short window still shows a few lines before scrolling', () => {
    expect(composerSize({ ...box, contentHeight: 400, viewportHeight: 200 })).toEqual({
      height: 3 * 24 + 20,
      scrolls: true,
    });
  });
});
