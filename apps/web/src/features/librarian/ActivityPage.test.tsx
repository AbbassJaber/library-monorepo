import { AUDIT_ACTIONS } from '@library/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { ActivityPage } from './ActivityPage';

const LocationProbe = () => <output data-testid="url">{useLocation().search}</output>;

const entry = (id: number, overrides: Record<string, unknown>) => ({
  id,
  actorId: 2,
  entityId: 7,
  before: null,
  after: null,
  source: 'HTTP',
  requestId: 'r',
  createdAt: '2026-10-08T14:03:00.000Z',
  actor: { id: 2, displayName: 'Demo Librarian', role: 'LIBRARIAN' },
  entityLabel: 'Dune',
  ...overrides,
});

const renderActivity = (route = '/librarian/activity') =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/librarian/activity" element={<ActivityPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { route }
  );

describe('ActivityPage', () => {
  it('reads the audit log as sentences: who, what, which book, through what', async () => {
    server.use(
      http.get(`${API}/audit-logs`, () =>
        ok({
          items: [
            entry(3, {
              action: AUDIT_ACTIONS.bookUpdate,
              entityType: 'book',
              before: { title: 'Dune', rating: 4.5 },
              after: { title: 'Dune', rating: 4.6 },
            }),
            entry(2, {
              action: AUDIT_ACTIONS.shelfAdd,
              entityType: 'reading_list_entry',
              source: 'AI',
              actor: { id: 5, displayName: 'Demo Reader', role: 'READER' },
            }),
            entry(1, {
              action: AUDIT_ACTIONS.bookCreate,
              entityType: 'book',
              actor: null,
              source: 'SEED',
            }),
          ],
          meta: { page: 1, pageSize: 30, total: 3, totalPages: 1 },
        })
      )
    );
    renderActivity();
    const list = await screen.findByRole('list', { name: 'Activity' });
    const [edit, shelf, seed] = within(list).getAllByRole('listitem');
    expect(edit).toHaveTextContent('Demo Librarian Librarian edited the book Dune');
    expect(within(edit!).getByRole('link', { name: 'Dune' })).toHaveAttribute('href', '/books/7');
    expect(edit).toHaveTextContent('Web app');
    await userEvent.click(within(edit!).getByText('1 change'));
    expect(within(edit!).getByText(/^4\.5/)).toHaveTextContent('4.5 → changed to 4.6');
    expect(shelf).toHaveTextContent('Demo Reader added Dune to their reading list');
    expect(shelf).toHaveTextContent('Librarian assistant');
    expect(seed).toHaveTextContent('Seed data added the book Dune');
    expect(screen.getByText('3 entries')).toBeInTheDocument();
  });

  it('filters by kind and pages through the URL', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/audit-logs`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return ok({
          items: [
            entry(1, { action: AUDIT_ACTIONS.genreRename, entityType: 'genre', entityLabel: 'SF' }),
          ],
          meta: { page: 1, pageSize: 30, total: 40, totalPages: 2 },
        });
      })
    );
    renderActivity();
    await screen.findByRole('list', { name: 'Activity' });
    expect(asked[0]).toContain('entityType=book%2Cgenre');
    expect(screen.getByLabelText('Show')).toHaveValue('catalog');
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'genre');
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('type=genre'));
    await waitFor(() => expect(asked.at(-1)).toContain('entityType=genre'));
    await userEvent.click(screen.getByRole('link', { name: /Next page/ }));
    await waitFor(() => expect(asked.at(-1)).toContain('page=2'));
    expect(screen.getByTestId('url')).toHaveTextContent('type=genre&page=2');
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    await waitFor(() => expect(asked.at(-1)).not.toContain('entityType'));
  });

  it('says so when there is nothing yet', async () => {
    server.use(
      http.get(`${API}/audit-logs`, () =>
        ok({ items: [], meta: { page: 1, pageSize: 30, total: 0, totalPages: 0 } })
      )
    );
    renderActivity();
    expect(await screen.findByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument();
  });
});
