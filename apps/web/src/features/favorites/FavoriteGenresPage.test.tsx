import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { FavoriteGenresPage } from './FavoriteGenresPage';

describe('FavoriteGenresPage', () => {
  it('lets a reader pick up to five genres, reorder them with the keyboard and save the ordered ids', async () => {
    let saved: number[] | null = null;
    server.use(
      http.put(`${API}/me/favorite-genres`, async ({ request }) => {
        saved = ((await request.json()) as { genreIds: number[] }).genreIds;
        return ok(
          saved.map((id, position) => ({ genre: { id, name: `G${id}`, slug: `g${id}` }, position }))
        );
      })
    );
    renderWithProviders(<FavoriteGenresPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Fantasy/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Poetry/ }));

    const list = screen.getByRole('list', { name: 'Your favorite genres, in order' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map(li => li.textContent)
    ).toEqual([expect.stringContaining('Fantasy'), expect.stringContaining('Poetry')]);

    await userEvent.click(within(list).getByRole('button', { name: 'Move Poetry up' }));
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Poetry');

    await userEvent.click(screen.getByRole('button', { name: 'Save favorites' }));
    await waitFor(() => expect(saved).toEqual([3, 1]));
  });

  it('caps the selection at five', async () => {
    server.use(
      http.get(`${API}/genres`, () =>
        ok(
          Array.from({ length: 7 }, (_, i) => ({
            id: i + 1,
            name: `Genre ${i + 1}`,
            slug: `genre-${i + 1}`,
            archivedAt: null,
            activeBookCount: 1,
            createdAt: '',
            updatedAt: '',
          }))
        )
      )
    );
    renderWithProviders(<FavoriteGenresPage />);
    for (let i = 1; i <= 5; i++)
      await userEvent.click(await screen.findByRole('checkbox', { name: `Genre ${i}` }));
    expect(screen.getByRole('checkbox', { name: 'Genre 6' })).toBeDisabled();
    expect(screen.getByText(/5 of 5 chosen/)).toBeInTheDocument();
  });
});
