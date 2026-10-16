import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { summary } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { ExplainedRecommendations } from './ExplainedRecommendations';

describe('ExplainedRecommendations', () => {
  it('shows each pick with its reason and links to the shelf books it follows from', async () => {
    server.use(
      http.get(`${API}/ai/recommendations`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('locale')).toBe('en');
        return ok(
          [
            {
              book: summary(2, { title: 'The Fellowship of the Ring' }),
              explanation: 'The sequel to The Hobbit, which you finished.',
              citedEntryIds: [10],
              citedBooks: [{ bookId: 1, title: 'The Hobbit' }],
            },
          ],
          { reason: 'ok' }
        );
      })
    );
    renderWithProviders(<ExplainedRecommendations />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText('The sequel to The Hobbit, which you finished.')).toBeVisible();
    expect(within(list).getByRole('link', { name: 'The Hobbit' })).toHaveAttribute(
      'href',
      '/books/1'
    );
    expect(screen.queryByText(/plain list/)).toBeNull();
  });

  it('when the assistant is down, the plain list stands in with a note', async () => {
    server.use(http.get(`${API}/ai/recommendations`, () => error(503, 'AI_UNAVAILABLE')));
    renderWithProviders(<ExplainedRecommendations />);
    expect(
      await screen.findByText('Explanations are unavailable right now, so this is the plain list.')
    ).toBeVisible();
  });

  it('a rejected answer (fallback) also shows the plain list with the note; an empty shelf shows it without', async () => {
    server.use(http.get(`${API}/ai/recommendations`, () => ok([], { reason: 'fallback' })));
    const view = renderWithProviders(<ExplainedRecommendations />);
    expect(await screen.findByText(/so this is the plain list/)).toBeVisible();
    view.unmount();
    server.use(http.get(`${API}/ai/recommendations`, () => ok([], { reason: 'no-history' })));
    renderWithProviders(<ExplainedRecommendations />);
    expect(await screen.findByRole('heading', { name: 'For your shelves' })).toBeVisible();
    expect(screen.queryByText(/so this is the plain list/)).toBeNull();
  });
});
