import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { VALIDATION_CODES } from '@library/contracts';
import { createQueryClient } from '@/app/queryClient';
import { setLocale } from '@/i18n';
import enCommon from '@/locales/en/common.json';
import frCommon from '@/locales/fr/common.json';
import { qk } from '@/lib/queryKeys';
import { book, genres, librarian } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { BookFormPage } from './BookFormPage';
import { GenresPage } from './GenresPage';
import { LibrarianBooksPage } from './LibrarianBooksPage';
import { UI_LOCALE } from '@library/domain-config';

const asLibrarian = () => server.use(http.get(`${API}/auth/me`, () => ok(librarian)));

describe('BookFormPage', () => {
  it('translates the contract ISBN code into a sentence in the current language', async () => {
    asLibrarian();
    renderWithProviders(
      <Routes>
        <Route path="/librarian/books/new" element={<BookFormPage />} />
      </Routes>,
      { route: '/librarian/books/new' }
    );
    await userEvent.type(await screen.findByLabelText(/^ISBN/), 'not-an-isbn');
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));
    expect(await screen.findByText(enCommon.zod.isbn.invalid)).toBeInTheDocument();
    expect(screen.queryByText(VALIDATION_CODES.isbnInvalid)).not.toBeInTheDocument();
    await setLocale(UI_LOCALE.fr);
    await userEvent.click(screen.getByRole('button', { name: 'Créer le livre' }));
    expect(await screen.findByText(frCommon.zod.isbn.invalid)).toBeInTheDocument();
  });

  it('creates a book with the chosen genres and then invalidates only book-related queries', async () => {
    asLibrarian();
    let sent: unknown = null;
    server.use(
      http.post(`${API}/books`, async ({ request }) => {
        sent = await request.json();
        return ok(book(77, { title: 'New Book' }), undefined, { status: 201 });
      })
    );
    const queryClient = createQueryClient();
    const invalidated: string[] = [];
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async filters => {
      invalidated.push(JSON.stringify((filters as { queryKey: unknown }).queryKey));
    });
    renderWithProviders(
      <Routes>
        <Route path="/librarian/books/new" element={<BookFormPage />} />
        <Route path="/books/:id" element={<h1>Detail page</h1>} />
      </Routes>,
      { route: '/librarian/books/new', queryClient }
    );
    await userEvent.type(await screen.findByLabelText(/^Title/), 'New Book');
    await userEvent.type(screen.getByLabelText(/^Author/), 'Someone');
    await userEvent.clear(screen.getByLabelText(/^Published/));
    await userEvent.type(screen.getByLabelText(/^Published/), '1999');
    await userEvent.type(screen.getByLabelText(/^Synopsis/), 'A synopsis.');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Fantasy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(await screen.findByText('Detail page')).toBeInTheDocument();
    expect(sent).toMatchObject({
      title: 'New Book',
      author: 'Someone',
      publishedYear: 1999,
      genreIds: [1],
    });
    expect(sent).not.toHaveProperty('isbn');
    expect(sent).not.toHaveProperty('coverUrl');
    expect(invalidated).toEqual(
      expect.arrayContaining([
        JSON.stringify(qk.books.lists),
        JSON.stringify(qk.books.infinites),
        JSON.stringify(qk.books.newest),
        JSON.stringify(qk.genres.all),
      ])
    );
    expect(invalidated).not.toContain(JSON.stringify(qk.favorites.list));
    expect(invalidated).not.toContain(JSON.stringify(qk.auth.me));
  });

  it('shows the version conflict dialog with the current version when the edit is stale', async () => {
    asLibrarian();
    server.use(
      http.get(`${API}/books/5`, () => ok(book(5, { title: 'Old title', version: 1 }))),
      http.patch(`${API}/books/5`, () =>
        error(409, 'VERSION_CONFLICT', 'The book changed since you loaded it', {
          current: book(5, { title: 'Someone else edited', version: 2 }),
        })
      )
    );
    renderWithProviders(
      <Routes>
        <Route path="/librarian/books/:id/edit" element={<BookFormPage />} />
      </Routes>,
      { route: '/librarian/books/5/edit' }
    );
    const title = await screen.findByLabelText(/^Title/);
    await waitFor(() => expect(title).toHaveValue('Old title'));
    await userEvent.clear(title);
    await userEvent.type(title, 'My edit');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = await screen.findByRole('dialog', { name: /changed since you opened it/ });
    expect(within(dialog).getByText(/Someone else edited/)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep my changes and retry' })
    );
    expect(screen.getByLabelText(/^Title/)).toHaveValue('My edit');
    expect(screen.getByText(/version 2/)).toBeInTheDocument();
  });
});

describe('GenresPage', () => {
  it('shows the blocking books when a genre cannot be archived', async () => {
    asLibrarian();
    server.use(
      http.get(`${API}/genres`, () => ok(genres)),
      http.post(`${API}/genres/1/archive`, () =>
        error(409, 'GENRE_IN_USE', 'This genre is the only active genre of active books', {
          genreId: 1,
          books: [{ id: 3, title: 'Lonely Book' }],
        })
      )
    );
    renderWithProviders(<GenresPage />);
    const row = await screen.findByRole('row', { name: /Fantasy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Archive Fantasy' }));
    const dialog = await screen.findByRole('dialog', { name: /cannot be archived/ });
    expect(within(dialog).getByText('Lonely Book')).toBeInTheDocument();
  });
});

describe('LibrarianBooksPage', () => {
  it('lists books including archived ones when the filter says so', async () => {
    asLibrarian();
    const statuses: string[] = [];
    server.use(
      http.get(`${API}/books`, ({ request }) => {
        statuses.push(new URL(request.url).searchParams.get('status') ?? 'active');
        return ok({
          items: [book(1), book(2, { archivedAt: '2026-01-01T00:00:00.000Z' })],
          meta: { page: 1, pageSize: 24, total: 2, totalPages: 1 },
        });
      })
    );
    renderWithProviders(<LibrarianBooksPage />);
    expect(await screen.findByRole('row', { name: /Book 1/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    await waitFor(() => expect(statuses).toContain('all'));
    expect(await screen.findByRole('row', { name: /Book 2/ })).toHaveTextContent('Archived');
  });
});
