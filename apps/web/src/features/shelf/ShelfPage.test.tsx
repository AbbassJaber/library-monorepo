import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { qk } from '@/lib/queryKeys';
import { useUiStore } from '@/stores/uiStore';
import { entry, summary } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { ShelfPage } from './ShelfPage';
import { ReadingState } from '@library/contracts';

describe('ShelfPage', () => {
  it('groups entries by state and marks archived books as unavailable with a locked state', async () => {
    server.use(
      http.get(`${API}/me/reading-list`, () =>
        ok([
          entry(1, 1, { state: ReadingState.enum.READING }),
          entry(2, 2, {
            state: ReadingState.enum.WANT_TO_READ,
            available: false,
            book: summary(2, { archivedAt: '2026-02-01T00:00:00.000Z' }),
          }),
        ])
      )
    );
    renderWithProviders(<ShelfPage />);
    expect(await screen.findByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    const archived = screen.getByRole('article', { name: /Book 2/ });
    expect(within(archived).getByText('Archived / unavailable')).toBeInTheDocument();
    expect(within(archived).getByLabelText('Reading state')).toBeDisabled();
    expect(within(archived).getByRole('button', { name: /Remove/ })).toBeEnabled();
  });

  it('updates the state optimistically and keeps it when the server agrees', async () => {
    let serverState: 'WANT_TO_READ' | 'FINISHED' = 'WANT_TO_READ';
    let release: (() => void) | undefined;
    server.use(
      http.get(`${API}/me/reading-list`, () =>
        ok([entry(1, 1, { state: serverState }), entry(2, 2, { state: ReadingState.enum.READING })])
      ),
      http.patch(`${API}/me/reading-list/1`, async () => {
        await new Promise<void>(resolve => (release = resolve));
        serverState = 'FINISHED';
        return ok(entry(1, 1, { state: ReadingState.enum.FINISHED }));
      })
    );
    const { queryClient } = renderWithProviders(<ShelfPage />);
    const card = await screen.findByRole('article', { name: /Book 1/ });
    await userEvent.selectOptions(within(card).getByLabelText('Reading state'), 'FINISHED');
    const stateOf = () =>
      (
        within(screen.getByRole('article', { name: /Book 1/ })).getByLabelText(
          'Reading state'
        ) as HTMLSelectElement
      ).value;
    await waitFor(() => expect(stateOf()).toBe('FINISHED'));
    expect(queryClient.isMutating()).toBe(1);
    await waitFor(() => expect(release).toBeDefined());
    release?.();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(stateOf()).toBe('FINISHED');
  });

  it('rolls back and toasts when the server rejects the state change', async () => {
    server.use(
      http.patch(`${API}/me/reading-list/1`, async () => {
        await new Promise(r => setTimeout(r, 80));
        return error(409, 'BOOK_ARCHIVED', 'This book is archived; its reading state is locked');
      })
    );
    const { queryClient } = renderWithProviders(<ShelfPage />);
    const card = await screen.findByRole('article', { name: /Book 1/ });
    const stateOf = () =>
      (
        within(screen.getByRole('article', { name: /Book 1/ })).getByLabelText(
          'Reading state'
        ) as HTMLSelectElement
      ).value;
    expect(stateOf()).toBe('WANT_TO_READ');

    await userEvent.selectOptions(within(card).getByLabelText('Reading state'), 'FINISHED');
    await waitFor(() => expect(stateOf()).toBe('FINISHED'));

    await waitFor(() => expect(stateOf()).toBe('WANT_TO_READ'));
    expect(
      useUiStore.getState().toasts.some(t => t.tone === 'error' && /archived/.test(t.message))
    ).toBe(true);
    const cached = queryClient.getQueryData(qk.shelf.list) as Array<{ id: number; state: string }>;
    expect(cached.find(e => e.id === 1)?.state).toBe('WANT_TO_READ');
  });

  it('removes an entry optimistically', async () => {
    server.use(http.delete(`${API}/me/reading-list/2`, () => ok({ removed: true })));
    renderWithProviders(<ShelfPage />);
    const card = await screen.findByRole('article', { name: /Book 2/ });
    await userEvent.click(within(card).getByRole('button', { name: /Remove/ }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: /Book 2/ })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('article', { name: /Book 1/ })).toBeInTheDocument();
  });
});
