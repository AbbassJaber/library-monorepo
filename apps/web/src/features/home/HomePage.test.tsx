import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { aiStatus, entry, summary } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { HomePage } from './HomePage';
import { ReadingState } from '@library/contracts';

const hero = () => screen.findByRole('region', { name: /^Book|^Dune/ });

describe('HomePage (signed in)', () => {
  afterEach(() => useChatStore.setState({ open: false, entries: [], draft: null, context: null }));

  it('leads with the book being read, and "Mark as finished" moves it to Finished', async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API}/me/reading-list/:bookId`, async ({ request, params }) => {
        patches.push({ bookId: params['bookId'], body: await request.json() });
        return ok(entry(2, 2, { state: ReadingState.enum.FINISHED }));
      })
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    const section = await hero();
    expect(within(section).getByText('Continue reading')).toBeVisible();
    expect(within(section).getByRole('heading', { level: 2, name: 'Book 2' })).toBeVisible();
    expect(within(section).getByText('Author 2 · 1902 · Fantasy')).toBeVisible();
    expect(within(section).getByRole('combobox', { name: 'Reading state of Book 2' })).toHaveValue(
      'READING'
    );

    await userEvent.click(within(section).getByRole('button', { name: 'Mark as finished' }));
    await waitFor(() => expect(patches).toEqual([{ bookId: '2', body: { state: 'FINISHED' } }]));
  });

  it('"Ask about this book" opens the chat with a prefilled question, sending nothing', async () => {
    renderWithProviders(<HomePage />);
    const section = await hero();
    await userEvent.click(within(section).getByRole('button', { name: 'Ask about this book' }));
    expect(useChatStore.getState()).toMatchObject({
      open: true,
      draft: 'Tell me about “Book 2” by Author 2.',
      entries: [],
    });
  });

  it('without a book in progress, leads with the top recommendation and names why', async () => {
    server.use(
      http.get(`${API}/me/reading-list`, () =>
        ok([entry(1, 1, { state: ReadingState.enum.FINISHED })])
      ),
      http.get(`${API}/ai/recommendations`, () =>
        ok(
          [
            {
              book: summary(7, { title: 'Dune' }),
              explanation: 'Like Book 1.',
              citedEntryIds: [1],
              citedBooks: [{ bookId: 1, title: 'Book 1' }],
            },
            {
              book: summary(8),
              explanation: 'Also like Book 1.',
              citedEntryIds: [1],
              citedBooks: [{ bookId: 1, title: 'Book 1' }],
            },
          ],
          { reason: 'ok' }
        )
      )
    );
    renderWithProviders(<HomePage />);
    const section = await hero();
    expect(within(section).getByText('Picked for you')).toBeVisible();
    expect(within(section).getByRole('heading', { name: 'Dune' })).toBeVisible();
    expect(within(section).getByRole('button', { name: 'Add to reading list' })).toBeVisible();

    const forYou = screen.getByRole('region', { name: 'For your shelves' });
    expect(within(forYou).getByText('Because of Book 1 on your reading list')).toBeVisible();
    expect(within(forYou).getAllByRole('listitem')).toHaveLength(1);
    expect(within(forYou).getByRole('link', { name: 'See all: For your shelves' })).toHaveAttribute(
      'href',
      '/shelf'
    );
  });

  it('shows reading states as pills on shelf covers and lists the newest books', async () => {
    renderWithProviders(<HomePage />);
    const newest = await screen.findByRole('region', { name: 'New in the catalog' });
    const list = await within(newest).findByRole('list', { name: 'New in the catalog' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(within(list).getByRole('link', { name: 'Book 2 by Author 2, Reading' })).toBeVisible();
    expect(
      within(list).getByRole('link', { name: 'Book 1 by Author 1, Want to read' })
    ).toBeVisible();
    expect(within(list).getByRole('link', { name: 'Book 3 by Author 3' })).toBeVisible();
  });

  it('the librarian card opens the chat prefilled; no call button without server voice', async () => {
    renderWithProviders(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Ask the librarian' });
    expect(within(card).queryByRole('button', { name: 'Call the librarian' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Books by Tolkien' }));
    expect(useChatStore.getState()).toMatchObject({ open: true, draft: 'Books by Tolkien' });
  });

  it('a failing newest list shows its own error with a retry, the rest of the page stays', async () => {
    server.use(http.get(`${API}/books/newest`, () => error(500, 'INTERNAL')));
    renderWithProviders(<HomePage />);
    const newest = await screen.findByRole('region', { name: 'New in the catalog' });
    expect(await within(newest).findByRole('alert')).toHaveTextContent('Try again');
    expect(screen.getByRole('region', { name: 'Ask the librarian' })).toBeVisible();
  });
});

describe('HomePage (signed out)', () => {
  it('welcomes with a plain headline, log in and create account, and the newest books', async () => {
    server.use(
      http.get(`${API}/auth/me`, () => error(401, 'UNAUTHENTICATED')),
      http.post(`${API}/auth/refresh`, () => error(401, 'UNAUTHENTICATED')),
      http.get(`${API}/ai/status`, () => ok({ ...aiStatus, voiceMode: 'server' }))
    );
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Find a book by its title, its author, or what it is about.',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register'
    );
    const newest = screen.getByRole('region', { name: 'New in the catalog' });
    expect(await within(newest).findAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByRole('region', { name: 'Ask the librarian' })).toBeNull();
  });
});
