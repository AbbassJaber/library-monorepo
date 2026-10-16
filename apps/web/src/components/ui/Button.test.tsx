import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders an accessible button that calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save changes</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('announces a busy state and blocks clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Save changes
      </Button>
    );
    const button = screen.getByRole('button', { name: /Save changes/ });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('meets the 44px target size through its base classes', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button').className).toMatch(/min-h-11/);
  });
});
