import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import enCommon from '@/locales/en/common.json';
import { book, entry, genres } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { BookDetailPage } from './books/BookDetailPage';
import { CatalogPage } from './catalog/CatalogPage';
import { FavoriteGenresPage } from './favorites/FavoriteGenresPage';
import { ShelfPage } from './shelf/ShelfPage';

const SERVER_TEXT = 'pg: connection refused (never shown to readers)';
const failOnce = (resolver: () => Response) => {
  let calls = 0;
  return () => (calls++ === 0 ? error(500, 'INTERNAL', SERVER_TEXT) : resolver());
};

const expectTranslatedError = (alert: HTMLElement) => {
  expect(within(alert).getByText(enCommon.errors.INTERNAL)).toBeInTheDocument();
  expect(within(alert).queryByText(SERVER_TEXT)).not.toBeInTheDocument();
};

const skeletons = () => document.querySelectorAll('.animate-pulse');

describe('catalog page states', () => {
  const renderCatalog = () =>
    renderWithProviders(
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
      </Routes>,
      { route: '/catalog' }
    );

  it('shows a skeleton grid while the first page loads', async () => {
    server.use(
      http.get(`${API}/books`, async () =>
        ok({ items: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 } })
      )
    );
    renderCatalog();
    expect(skeletons().length).toBeGreaterThan(0);
    await screen.findByRole('heading', { name: /No books match/ });
    expect(skeletons().length).toBe(0);
  });

  it('shows the server message with a retry that recovers', async () => {
    server.use(
      http.get(
        `${API}/books`,
        failOnce(() =>
          ok({
            items: [{ ...book(7), genres: [] }],
            meta: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
          })
        )
      )
    );
    renderCatalog();
    const alert = await screen.findByRole('alert');
    expectTranslatedError(alert);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Book 7' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers to reset the search when nothing matches', async () => {
    server.use(
      http.get(`${API}/books`, () =>
        ok({ items: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 } })
      )
    );
    renderCatalog();
    expect(await screen.findByRole('heading', { name: /No books match/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset search' })).toBeInTheDocument();
  });
});

describe('shelf page states', () => {
  it('shows skeleton rows while the list loads', async () => {
    renderWithProviders(<ShelfPage />);
    expect(skeletons().length).toBeGreaterThan(0);
    await screen.findByRole('heading', { name: 'Book 1' });
    expect(skeletons().length).toBe(0);
  });

  it('shows the server message with a retry that recovers', async () => {
    server.use(
      http.get(
        `${API}/me/reading-list`,
        failOnce(() => ok([entry(1, 1)]))
      )
    );
    renderWithProviders(<ShelfPage />);
    const alert = await screen.findByRole('alert');
    expectTranslatedError(alert);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('points an empty shelf at the catalogue', async () => {
    server.use(http.get(`${API}/me/reading-list`, () => ok([])));
    renderWithProviders(<ShelfPage />);
    expect(
      await screen.findByRole('heading', { name: 'Your reading list is empty' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse the catalog/i })).toHaveAttribute(
      'href',
      '/catalog'
    );
  });
});

describe('favourite genres page states', () => {
  it('shows a skeleton while the genres load', async () => {
    renderWithProviders(<FavoriteGenresPage />);
    expect(skeletons().length).toBeGreaterThan(0);
    await screen.findByRole('checkbox', { name: 'Fantasy' });
    expect(skeletons().length).toBe(0);
  });

  it('shows the server message with a retry that recovers', async () => {
    server.use(
      http.get(
        `${API}/genres`,
        failOnce(() => ok(genres))
      )
    );
    renderWithProviders(<FavoriteGenresPage />);
    const alert = await screen.findByRole('alert');
    expectTranslatedError(alert);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: 'Fantasy' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says how many are chosen when there are none yet', async () => {
    renderWithProviders(<FavoriteGenresPage />);
    await screen.findByRole('checkbox', { name: 'Fantasy' });
    expect(screen.getByText('0 of 5 chosen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save favorites' })).toBeDisabled();
  });
});

describe('book detail page states', () => {
  const renderDetail = (id: number) =>
    renderWithProviders(
      <Routes>
        <Route path="/books/:id" element={<BookDetailPage />} />
      </Routes>,
      { route: `/books/${id}` }
    );

  it('shows a skeleton while the book loads', async () => {
    renderDetail(3);
    expect(skeletons().length).toBeGreaterThan(0);
    await screen.findByRole('heading', { level: 1, name: 'Book 3' });
  });

  it('shows "Book not found" without a retry for a 404', async () => {
    server.use(http.get(`${API}/books/999`, () => error(404, 'NOT_FOUND', 'Book not found')));
    renderDetail(999);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Book not found' })).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the server message with a retry that recovers for other errors', async () => {
    server.use(
      http.get(
        `${API}/books/3`,
        failOnce(() => ok(book(3)))
      )
    );
    renderDetail(3);
    const alert = await screen.findByRole('alert');
    expectTranslatedError(alert);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Book 3' })).toBeInTheDocument();
  });
});
