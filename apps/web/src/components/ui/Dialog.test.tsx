import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('opens as a native modal dialog with a labelled title and closes with the close button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Remove this book?" onClose={onClose}>
        <p>Body</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Remove this book?' });
    expect(dialog).toHaveAttribute('open');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing visible when closed', () => {
    render(
      <Dialog open={false} title="Hidden" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('with onRequestClose, Esc and the backdrop ask instead of closing at once', () => {
    const onClose = vi.fn();
    const onRequestClose = vi.fn();
    render(
      <Dialog
        open
        title="Command menu"
        onClose={onClose}
        onRequestClose={onRequestClose}
        variant="command"
      >
        <input aria-label="Search" />
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Command menu' });
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
    expect(onRequestClose).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute('open');
  });

  it('ignores a close event that lands after the dialog was opened again', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Menu" onClose={onClose}>
        <p>Body</p>
      </Dialog>
    );
    screen.getByRole('dialog', { name: 'Menu' }).dispatchEvent(new Event('close'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
