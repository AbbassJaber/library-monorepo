import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { qk } from '@/lib/queryKeys';
import { summary } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { UI_STORAGE_KEY, useUiStore } from '@/stores/uiStore';
import { CatalogPage } from './CatalogPage';

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
};

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

describe('CatalogPage', () => {
  it('reads its state from the URL and writes every filter back to it', async () => {
    renderCatalog('/catalog?q=dune&genre=fantasy&yearFrom=1950&sort=rating&page=2');
    expect(await screen.findByRole('heading', { name: 'Book 25' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search by title or author')).toHaveValue('dune');
    expect(screen.getByLabelText('Sort')).toHaveValue('rating');

    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'title');
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('sort=title'));
    expect(screen.getByTestId('url').textContent).not.toContain('page=');

    await userEvent.clear(screen.getByLabelText('From year'));
    await userEvent.type(screen.getByLabelText('From year'), '1980');
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('yearFrom=1980'));
    expect(screen.getByTestId('url').textContent).toContain('genre=fantasy');
    expect(screen.getByTestId('url').textContent).toContain('q=dune');
  });

  it('keeps the previous page visible while loading the next', async () => {
    let release: (() => void) | undefined;
    server.use(
      http.get(`${API}/books`, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (page === 2) await new Promise<void>(resolve => (release = resolve));
        const items = Array.from({ length: 24 }, (_, i) => summary((page - 1) * 24 + i + 1));
        return ok({ items, meta: { page, pageSize: 24, total: 50, totalPages: 3 } });
      })
    );
    renderCatalog();
    expect(await screen.findByRole('heading', { name: 'Book 1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }));

    expect(screen.getByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    expect(screen.getByRole('feed', { name: 'Books' })).toHaveAttribute('aria-busy', 'true');
    release?.();
    expect(await screen.findByRole('heading', { name: 'Book 25' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book 1' })).not.toBeInTheDocument();
  });

  it('prefetches the next page once the current one has loaded', async () => {
    const requested: string[] = [];
    server.use(
      http.get(`${API}/books`, ({ request }) => {
        const url = new URL(request.url);
        requested.push(url.searchParams.get('page') ?? '1');
        const page = Number(url.searchParams.get('page') ?? '1');
        return ok({
          items: [summary(page)],
          meta: { page, pageSize: 24, total: 50, totalPages: 3 },
        });
      })
    );
    const { queryClient } = renderCatalog();
    await screen.findByRole('heading', { name: 'Book 1' });
    await waitFor(() => expect(requested).toEqual(['1', '2']));
    expect(queryClient.getQueryData(qk.books.list({ page: 2 }))).toBeDefined();
  });

  it('Load more appends without resetting the list in scroll mode', async () => {
    useUiStore.setState({ catalogViewMode: 'scroll' });
    renderCatalog();
    expect(await screen.findByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('heading', { name: 'Book 25' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    const feed = screen.getByRole('feed', { name: 'Books' });
    expect(within(feed).getAllByRole('article')).toHaveLength(48);
  });

  it('filters by language through the URL and the list query', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/books`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return ok({
          items: [summary(7, { title: 'Le Petit Prince', language: 'fr' })],
          meta: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
        });
      })
    );
    renderCatalog('/catalog');
    await screen.findByRole('heading', { name: 'Le Petit Prince' });
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'fr');
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('language=fr'));
    await waitFor(() => expect(asked.at(-1)).toContain('language=fr'));
    await userEvent.click(screen.getByRole('button', { name: /Remove French/ }));
    await waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('language'));
  });

  it('shows an empty state with a way out when nothing matches', async () => {
    server.use(
      http.get(`${API}/books`, () =>
        ok({ items: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 } })
      )
    );
    renderCatalog('/catalog?q=zzzz');
    expect(await screen.findByRole('heading', { name: /No books match/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset search' }));
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe(''));
  });
});

describe('Search by meaning', () => {
  const scored = (id: number, title: string) => ({
    book: summary(id, { title }),
    scores: { lexical: null, semantic: 0.8, fused: 0.016 },
  });

  it('with a query, switches to hybrid results from /ai/search and keeps the mode in the URL', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/ai/search`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return ok({ items: [scored(12, 'Dune')], reranked: false });
      })
    );
    renderCatalog('/catalog?q=desert%20planet%20with%20giant%20worms');
    await userEvent.click(await screen.findByRole('button', { name: 'Search by meaning' }));
    expect(await screen.findByRole('heading', { name: 'Dune' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search by meaning' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('url').textContent).toContain('mode=semantic');
    expect(asked[0]).toContain('q=desert+planet+with+giant+worms');
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'title');
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('sort=title'));
    expect(screen.getByTestId('url').textContent).toContain('mode=semantic');
  });

  it('shows the normal catalog empty state when nothing is close in meaning', async () => {
    server.use(http.get(`${API}/ai/search`, () => ok({ items: [], reranked: false })));
    renderCatalog('/catalog?q=xqzv%20plorbt&mode=semantic');
    expect(
      await screen.findByRole('heading', { name: 'No books match these filters' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset search' }));
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe(''));
  });

  it('is offered only with a query and when hybrid search is enabled', async () => {
    renderCatalog('/catalog');
    expect(await screen.findByRole('heading', { name: 'Book 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search by meaning' })).not.toBeInTheDocument();
  });
});

const stubWidth = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 768px') ? wide : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));

describe('Covers / Table', () => {
  beforeEach(() => useUiStore.setState({ catalogLayout: 'covers' }));
  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ catalogLayout: 'covers' });
  });

  it("switches to a dense table, remembers it, and keeps the reader's states in it", async () => {
    stubWidth(true);
    renderCatalog('/catalog');
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = await screen.findByRole('table', { name: 'Books' });
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByRole('columnheader', { name: 'Rating' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Language' })).toBeInTheDocument();
    const link = within(table).getByRole('link', { name: 'Book 2' });
    expect(link).toHaveAttribute('href', '/books/2');
    expect(await within(link.closest('tr')!).findByText('Reading')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}').state.catalogLayout).toBe(
      'table'
    );
  });

  it('under 768px hides the switch and always shows covers', async () => {
    stubWidth(false);
    useUiStore.setState({ catalogLayout: 'table' });
    renderCatalog('/catalog');
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull();
  });

  it('during a search by meaning, a row says why it matched, with the ranking signals', async () => {
    stubWidth(true);
    useUiStore.setState({ catalogLayout: 'table' });
    server.use(
      http.get(`${API}/ai/search`, () =>
        ok({
          items: [
            {
              book: summary(12, { title: 'Dune' }),
              scores: { lexical: 3, semantic: 0.6123, fused: 0.03252 },
              match: {
                semanticRank: 1,
                fusedRank: 2,
                rerankedRank: 1,
                matchedOn: ['title', 'meaning'],
              },
            },
            {
              book: summary(7, { title: 'Solaris' }),
              scores: { lexical: null, semantic: 0.5, fused: 0.0161 },
              match: { semanticRank: 2, fusedRank: 1, rerankedRank: 2, matchedOn: ['meaning'] },
            },
          ],
          reranked: true,
        })
      )
    );
    renderCatalog('/catalog?q=dune%20desert&mode=semantic');
    const why = await screen.findByRole('button', { name: 'Why “Dune” matched' });
    await userEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('complementary', { name: 'Why it matched' });
    expect(within(panel).getByText('Your words are in the title')).toBeInTheDocument();
    expect(within(panel).getByText('Close in meaning to your search')).toBeInTheDocument();
    expect(within(panel).getByText('0.612')).toBeInTheDocument();
    expect(within(panel).getByText('#2 · RRF 0.0325')).toBeInTheDocument();
    expect(within(panel).getByText('#3')).toBeInTheDocument();
    expect(within(panel).getByText('After rerank')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close the explanation' }));
    expect(screen.queryByRole('complementary', { name: 'Why it matched' })).toBeNull();
  });

  it('the cover grid and plain searches have no "Why" buttons', async () => {
    stubWidth(true);
    useUiStore.setState({ catalogLayout: 'table' });
    renderCatalog('/catalog?q=dune');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Why/ })).toBeNull();
  });
});
