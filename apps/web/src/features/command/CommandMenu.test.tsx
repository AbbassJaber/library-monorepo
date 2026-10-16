import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { useLocation } from 'react-router';
import { librarian } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { useChatStore } from '@/stores/chatStore';
import { useCommandStore } from '@/stores/commandStore';
import { useUiStore } from '@/stores/uiStore';
import { CommandMenuHost } from './CommandMenuHost';
import { UI_LOCALE } from '@library/domain-config';

const LocationProbe = () => <output data-testid="url">{useLocation().pathname}</output>;

const renderMenu = () =>
  renderWithProviders(
    <>
      <CommandMenuHost />
      <LocationProbe />
    </>
  );

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('{Control>}k{/Control}');
  return screen.findByRole('dialog', { name: 'Command menu' });
};

describe('the command menu', () => {
  afterEach(() => {
    useCommandStore.setState({ open: false });
    useChatStore.setState({ open: false, draft: null, entries: [] });
    useUiStore.setState({ toasts: [] });
  });

  it('opens with Ctrl K, lists the pages a reader can go to, and goes there', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    expect(within(menu).getByRole('combobox')).toHaveFocus();
    const pages = within(menu).getByRole('group', { name: 'Go to' });
    expect(
      within(pages)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['Home', 'Catalog', 'Reading list', 'Favorite genres']);
    await user.click(within(pages).getByRole('option', { name: 'Catalog' }));
    expect(screen.getByTestId('url')).toHaveTextContent('/catalog');
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull();
  });

  it('shows the librarian pages to librarians only', async () => {
    server.use(http.get(`${API}/auth/me`, () => ok(librarian)));
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    expect(await within(menu).findByRole('option', { name: 'Manage books' })).toBeInTheDocument();
    expect(within(menu).getByRole('option', { name: 'New book' })).toBeInTheDocument();
  });

  it('finds books with the catalog query and adds one to Reading through its actions', async () => {
    const searched: string[] = [];
    const added: unknown[] = [];
    server.use(
      http.get(`${API}/books`, ({ request }) => {
        searched.push(new URL(request.url).search);
        return ok({
          items: [3, 4].map(id => ({
            id,
            title: `Book ${id}`,
            author: `Author ${id}`,
            publishedYear: 1900 + id,
            rating: 4,
            coverUrl: null,
            genres: [],
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          })),
          meta: { page: 1, pageSize: 6, total: 2, totalPages: 1 },
        });
      }),
      http.post(`${API}/me/reading-list`, async ({ request }) => {
        added.push(await request.json());
        return ok(
          {
            id: 30,
            state: 'READING',
            book: { id: 3 },
            available: true,
            createdAt: '2026-10-07T00:00:00.000Z',
            updatedAt: '2026-10-07T00:00:00.000Z',
          },
          undefined,
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.type(within(menu).getByRole('combobox'), 'book');
    const books = await within(menu).findByRole('group', { name: 'Books' });
    expect(searched).toEqual(['?q=book&pageSize=6']);
    await user.click(within(books).getByRole('option', { name: /Book 3/ }));

    const actions = await within(menu).findByRole('group', { name: 'This book' });
    expect(
      within(actions)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['Open', 'Add to Want to read', 'Add to Reading', 'Back to the results']);
    await user.click(within(actions).getByRole('option', { name: 'Add to Reading' }));
    await waitFor(() => expect(added).toEqual([{ bookId: 3, state: 'READING' }]));
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull();
    await waitFor(() =>
      expect(useUiStore.getState().toasts.map(t => t.message)).toContain('Added to Reading: Book 3')
    );
  });

  it('ranks a page you named above asking the librarian, so Enter goes there', async () => {
    server.use(
      http.get(`${API}/books`, () =>
        ok({ items: [], meta: { page: 1, pageSize: 6, total: 0, totalPages: 0 } })
      )
    );
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.type(within(menu).getByRole('combobox'), 'reading list');
    const options = within(menu).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'Reading list',
      'Ask the librarian: reading list',
    ]);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('url')).toHaveTextContent('/shelf');
  });

  it('hands what was typed to the librarian, sending nothing', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.type(within(menu).getByRole('combobox'), 'a short sad novel');
    await user.click(
      within(menu).getByRole('option', { name: 'Ask the librarian: a short sad novel' })
    );
    expect(useChatStore.getState()).toMatchObject({ open: true, draft: 'a short sad novel' });
    expect(useChatStore.getState().entries).toEqual([]);
  });

  it('switches the theme and the language', async () => {
    useUiStore.setState({ theme: 'dark', locale: UI_LOCALE.en });
    const user = userEvent.setup();
    renderMenu();
    let menu = await openMenu(user);
    await user.click(within(menu).getByRole('option', { name: 'Switch to the light theme' }));
    expect(useUiStore.getState().theme).toBe('light');
    menu = await openMenu(user);
    await user.click(within(menu).getByRole('option', { name: 'Switch to Français' }));
    expect(useUiStore.getState().locale).toBe('fr');
  });
});
