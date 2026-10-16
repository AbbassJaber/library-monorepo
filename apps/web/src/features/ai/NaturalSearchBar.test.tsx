import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { setLocale } from '@/i18n';
import { aiStatus } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { UI_LOCALE } from '@library/domain-config';

const LocationProbe = () => <output data-testid="url">{useLocation().search}</output>;

const renderCatalog = (route = '/catalog') =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { route }
  );

const parsed = {
  query: {
    genre: ['fantasy'],
    yearFrom: 1990,
    yearTo: 1999,
    sort: 'rating',
    page: 1,
    pageSize: 24,
    status: 'active',
  },
  chips: [
    { key: 'genre', label: 'Fantasy', value: 'fantasy' },
    { key: 'yearFrom', label: '1990', value: '1990' },
    { key: 'yearTo', label: '1999', value: '1999' },
    { key: 'sort', label: 'rating', value: 'rating' },
  ],
  confidence: 0.95,
};
const meta = {
  ai: {
    runId: 7,
    feature: 'NL_SEARCH',
    provider: 'bedrock',
    model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
    tokensIn: 5020,
    tokensOut: 50,
    tokensCachedRead: 4591,
    tokensCachedWrite: 0,
    costUsd: 0.00167,
    latencyMs: 1545,
    fallbackUsed: false,
  },
};

const parseHandler = (sent: unknown[] = []) =>
  http.post(`${API}/ai/search/parse`, async ({ request }) => {
    sent.push(await request.json());
    return ok(parsed, meta);
  });

const interpret = async (text: string) => {
  await userEvent.type(await screen.findByLabelText('Describe what you are looking for'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Interpret' }));
};

describe('NaturalSearchBar', () => {
  it('turns a request into editable chips and applies them to the URL, replacing the old filters', async () => {
    const sent: unknown[] = [];
    server.use(parseHandler(sent));
    renderCatalog('/catalog?q=dune');
    await interpret('fantasy from the 90s sorted by rating');
    const chips = await screen.findByRole('group', { name: 'What I understood' });
    expect(within(chips).getByText('Fantasy')).toBeInTheDocument();
    expect(within(chips).getByText('from 1990')).toBeInTheDocument();
    expect(within(chips).getByText('to 1999')).toBeInTheDocument();
    expect(within(chips).getByText('sorted by Rating')).toBeInTheDocument();
    expect(screen.getByText(/eu\.anthropic\.claude-haiku-4-5.*1545 ms/)).toBeInTheDocument();
    expect(sent).toEqual([{ text: 'fantasy from the 90s sorted by rating' }]);

    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      const url = new URLSearchParams(screen.getByTestId('url').textContent ?? '');
      expect(url.get('q')).toBeNull();
      expect(url.getAll('genre')).toEqual(['fantasy']);
      expect(url.get('yearFrom')).toBe('1990');
      expect(url.get('yearTo')).toBe('1999');
      expect(url.get('sort')).toBe('rating');
    });
    expect(screen.queryByRole('group', { name: 'What I understood' })).not.toBeInTheDocument();
  });

  it('lets the reader remove and edit chips before applying', async () => {
    server.use(parseHandler());
    renderCatalog();
    await interpret('fantasy from the 90s sorted by rating');
    const chips = await screen.findByRole('group', { name: 'What I understood' });
    await userEvent.click(within(chips).getByRole('button', { name: 'Remove sorted by Rating' }));
    await userEvent.click(within(chips).getByRole('button', { name: 'Edit from 1990' }));
    const year = within(chips).getByLabelText('From year');
    await userEvent.clear(year);
    await userEvent.type(year, '1985');
    await userEvent.click(within(chips).getByRole('button', { name: 'Save' }));
    expect(within(chips).getByText('from 1985')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      const url = new URLSearchParams(screen.getByTestId('url').textContent ?? '');
      expect(url.get('yearFrom')).toBe('1985');
      expect(url.get('sort')).toBeNull();
    });
  });

  it('falls back to the plain search with a notice when the AI is unavailable', async () => {
    server.use(http.post(`${API}/ai/search/parse`, () => error(503, 'AI_UNAVAILABLE', 'down')));
    renderCatalog();
    await interpret('tolkein dragons');
    expect(await screen.findByText(/assistant is unavailable/)).toBeInTheDocument();
    await waitFor(() =>
      expect(new URLSearchParams(screen.getByTestId('url').textContent ?? '').get('q')).toBe(
        'tolkein dragons'
      )
    );
  });

  it('is not shown when natural-language search is off', async () => {
    server.use(
      http.get(`${API}/ai/status`, () =>
        ok({ ...aiStatus, features: { ...aiStatus.features, NL_SEARCH: false } })
      )
    );
    renderCatalog();
    await screen.findByRole('feed', { name: 'Books' });
    expect(screen.queryByLabelText('Describe what you are looking for')).not.toBeInTheDocument();
  });

  it('speaks French', async () => {
    server.use(parseHandler());
    await setLocale(UI_LOCALE.fr);
    renderCatalog();
    await userEvent.type(
      await screen.findByLabelText('Décrivez ce que vous cherchez'),
      'fantasy des années 90'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Interpréter' }));
    const chips = await screen.findByRole('group', { name: 'Ce que j’ai compris' });
    expect(within(chips).getByText('depuis 1990')).toBeInTheDocument();
    expect(within(chips).getByText('triés par Note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).toBeInTheDocument();
  });
});
