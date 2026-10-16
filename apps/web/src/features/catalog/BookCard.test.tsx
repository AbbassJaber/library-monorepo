import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { qk } from '@/lib/queryKeys';
import { book, summary } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { BookCard } from './BookCard';

describe('BookCard', () => {
  it('prefetches the detail on hover intent and on focus', async () => {
    let detailRequests = 0;
    server.use(
      http.get(`${API}/books/7`, () => {
        detailRequests += 1;
        return ok(book(7));
      })
    );
    const { queryClient } = renderWithProviders(<BookCard book={summary(7)} />);
    const link = screen.getByRole('link', { name: /Book 7/ });

    await userEvent.hover(link);
    await act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    await waitFor(() => expect(queryClient.getQueryData(qk.books.detail(7))).toBeDefined());
    expect(detailRequests).toBe(1);

    link.focus();
    await act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    expect(detailRequests).toBe(1);
  });

  it('marks books that are on the shelf', async () => {
    renderWithProviders(<BookCard book={summary(1)} onShelf />);
    expect(screen.getByText('On your reading list')).toBeInTheDocument();
  });
});
