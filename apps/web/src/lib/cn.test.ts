import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a text color next to a custom font size, and merges custom sizes and radii', () => {
    expect(cn('text-bg', 'text-small')).toBe('text-bg text-small');
    expect(cn('text-accent-ink text-label', 'text-meta')).toBe('text-accent-ink text-meta');
    expect(cn('rounded-full', 'rounded-panel')).toBe('rounded-panel');
  });
});
