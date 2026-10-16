import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { qk } from '@/lib/queryKeys';
import { book, entry, summary } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { createQueryClient } from '@/app/queryClient';
import { BookDetailPage } from './BookDetailPage';
import { ReadingState } from '@library/contracts';

const renderDetail = (id: number, queryClient = createQueryClient()) =>
  renderWithProviders(
    <Routes>
      <Route path="/books/:id" element={<BookDetailPage />} />
      <Route path="/catalog" element={<h1>Catalog page</h1>} />
    </Routes>,
    { route: `/books/${id}`, queryClient }
  );

describe('BookDetailPage', () => {
  it('paints title and author immediately from the list cache while the detail loads', async () => {
    let release: (() => void) | undefined;
    server.use(
      http.get(`${API}/books/3`, async () => {
        await new Promise<void>(resolve => (release = resolve));
        return ok(book(3, { synopsis: 'The full synopsis.' }));
      })
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(qk.books.list({}), {
      items: [summary(3, { title: 'Cached Title' })],
      meta: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
    });
    renderDetail(3, queryClient);

    expect(screen.getByRole('heading', { name: 'Cached Title' })).toBeInTheDocument();
    expect(screen.queryByText('The full synopsis.')).not.toBeInTheDocument();
    await waitFor(() => expect(release).toBeDefined());
    release?.();
    expect(await screen.findByText('The full synopsis.')).toBeInTheDocument();
  });

  it('offers to add the book and switches to the state control once it is on the shelf', async () => {
    let added = false;
    server.use(
      http.get(`${API}/me/reading-list`, () => ok(added ? [entry(9, 3)] : [])),
      http.post(`${API}/me/reading-list`, () => {
        added = true;
        return ok(entry(9, 3), undefined, { status: 201 });
      })
    );
    renderDetail(3);
    const add = await screen.findByRole('button', { name: 'Add to reading list' });
    await userEvent.click(add);
    expect(await screen.findByLabelText('Reading state')).toHaveValue('WANT_TO_READ');
  });

  it('keeps the state control disabled until the optimistic add is confirmed', async () => {
    let release: (() => void) | undefined;
    let added = false;
    server.use(
      http.get(`${API}/me/reading-list`, () => ok(added ? [entry(9, 3)] : [])),
      http.post(`${API}/me/reading-list`, async () => {
        await new Promise<void>(resolve => (release = resolve));
        added = true;
        return ok(entry(9, 3), undefined, { status: 201 });
      })
    );
    renderDetail(3);
    await userEvent.click(await screen.findByRole('button', { name: 'Add to reading list' }));
    const select = await screen.findByLabelText('Reading state');
    expect(select).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Remove / })).toBeDisabled();
    await waitFor(() => expect(release).toBeDefined());
    release?.();
    await waitFor(() => expect(screen.getByLabelText('Reading state')).toBeEnabled());
  });
});

describe('the open book', () => {
  it("has the title as its h1 and a library card with the shelf mark and the reader's history", async () => {
    server.use(
      http.get(`${API}/books/3`, () =>
        ok(
          book(3, {
            title: 'Dune',
            author: 'Frank Herbert',
            isbn: '9780441172719',
            language: 'fr',
          })
        )
      ),
      http.get(`${API}/me/reading-list`, () =>
        ok([
          entry(9, 3, {
            state: ReadingState.enum.FINISHED,
            createdAt: '2026-09-12T10:00:00.000Z',
            updatedAt: '2026-10-04T10:00:00.000Z',
          }),
        ])
      )
    );
    renderDetail(3);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument();
    const [card] = await screen.findAllByRole('region', { name: 'Library card' });
    expect(card).toHaveTextContent('FIC HER');
    expect(card).toHaveTextContent('9780441172719');
    expect(card).toHaveTextContent('LanguageFrench');
    expect(await within(card!).findByText('since Sep 12, 2026')).toBeInTheDocument();
    expect(within(card!).getByText('Finished')).toBeInTheDocument();
    expect(within(card!).getByText('Oct 4, 2026')).toBeInTheDocument();
  });

  it('says "Not yet" and has no stamp when the book is not on the list', async () => {
    server.use(http.get(`${API}/me/reading-list`, () => ok([])));
    renderDetail(3);
    const [card] = await screen.findAllByRole('region', { name: 'Library card' });
    expect(await within(card!).findByText('Not yet')).toBeInTheDocument();
    expect(card!.querySelector('.stamp')).toBeNull();
  });

  it('Close on a direct load goes to the catalog (no history to go back to)', async () => {
    renderDetail(3);
    await userEvent.click(await screen.findByRole('button', { name: 'Close the book' }));
    expect(await screen.findByRole('heading', { name: 'Catalog page' })).toBeInTheDocument();
  });
});

describe('Books like this', () => {
  it('lists the similar books from /books/:id/similar', async () => {
    server.use(
      http.get(`${API}/books/3/similar`, () =>
        ok([
          {
            book: summary(8, { title: 'A Neighbour Book' }),
            scores: { lexical: null, semantic: 0.9, fused: 0.9 },
          },
        ])
      )
    );
    renderDetail(3);
    const section = await screen.findByRole('region', { name: 'Books like this' });
    expect(section).toHaveTextContent('A Neighbour Book');
  });

  it('shows nothing when there are no similar books yet', async () => {
    let asked = false;
    server.use(
      http.get(`${API}/books/4/similar`, () => {
        asked = true;
        return ok([]);
      })
    );
    renderDetail(4);
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByRole('region', { name: 'Books like this' })).not.toBeInTheDocument();
  });
});
