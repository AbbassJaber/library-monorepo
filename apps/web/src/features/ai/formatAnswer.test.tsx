import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatAnswer } from './formatAnswer';

const html = (text: string) => render(<p>{formatAnswer(text)}</p>).container.innerHTML;

describe('formatAnswer', () => {
  it('turns bold and italic marks into formatting', () => {
    expect(html('Try **Dune** or *The Hobbit*.')).toBe(
      '<p>Try <strong>Dune</strong> or <em>The Hobbit</em>.</p>'
    );
    expect(html('__Bold__ and _italic_')).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('leaves marks without a partner, maths and snake_case as typed', () => {
    expect(html('Rated 4.5* by readers')).toBe('<p>Rated 4.5* by readers</p>');
    expect(html('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
    expect(html('a snake_case_word')).toBe('<p>a snake_case_word</p>');
  });

  it('shows list items with a bullet and headings in bold, keeping the lines', () => {
    expect(html('# Picks\n- **Dune** (1965)\n* Solaris')).toBe(
      '<p><strong>Picks</strong>\n• <strong>Dune</strong> (1965)\n• Solaris</p>'
    );
  });

  it('never renders markup from the text', () => {
    expect(html('**<img src=x onerror=alert(1)>**')).toBe(
      '<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>'
    );
  });

  it('keeps inline code as code', () => {
    expect(html('Use `FIC TOL` to find it')).toContain('<code');
  });
});
