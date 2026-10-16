import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/uiStore';
import { entry, summary } from '@/test/fixtures';
import { API, error } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { useChatStore } from '@/stores/chatStore';
import { ChatPanel } from './ChatPanel';
import { ReadingState } from '@library/contracts';

const ok = (data: unknown) => HttpResponse.json({ data });
const pending = {
  id: 'a-1',
  tool: 'addToReadingList',
  input: { bookId: 12, state: 'WANT_TO_READ' },
  summary: 'Add “Dune” to your reading list as “Want to read”',
  token: 'signed.token',
  expiresAt: '2026-10-02T12:10:00.000Z',
};

const open = () => {
  useChatStore.setState({ open: true, entries: [] });
  return renderWithProviders(<ChatPanel />);
};

describe('ChatPanel', () => {
  beforeEach(() => useChatStore.setState({ open: false, entries: [], draft: null }));
  afterEach(() => useChatStore.setState({ open: false, entries: [], draft: null }));

  it('takes a draft handed over by another page into the message box, focused, sending nothing', async () => {
    let sent = 0;
    server.use(
      http.post(`${API}/ai/chat`, () => {
        sent += 1;
        return ok({ message: { role: 'assistant', content: 'ok' } });
      })
    );
    useChatStore.getState().openWithDraft('Tell me about “Dune” by Frank Herbert.');
    renderWithProviders(<ChatPanel />);
    const input = await screen.findByLabelText('Your message');
    expect(input).toHaveValue('Tell me about “Dune” by Frank Herbert.');
    await waitFor(() => expect(input).toHaveFocus());
    expect(useChatStore.getState().draft).toBeNull();
    expect(sent).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toBe(1));
    expect(input).toHaveValue('');
  });

  it('sends the conversation with the UI locale and shows the answer with links to the cited books', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/ai/chat`, async ({ request }) => {
        bodies.push(await request.json());
        return ok({
          message: {
            role: 'assistant',
            content: 'Here is what I found: The Hobbit.',
            citations: [{ bookId: 1, title: 'The Hobbit' }],
          },
          runIds: [1],
        });
      })
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your message'), 'books by tolkien{Enter}');
    const log = screen.getByRole('log');
    expect(await within(log).findByText('Here is what I found: The Hobbit.')).toBeVisible();
    expect(within(log).getByRole('link', { name: /^The Hobbit/ })).toHaveAttribute(
      'href',
      '/books/1'
    );
    expect(bodies).toEqual([
      { messages: [{ role: 'user', content: 'books by tolkien' }], locale: 'en' },
    ]);
  });

  it('a proposed change does nothing until Confirm; then it runs once and the card says so', async () => {
    const confirms: unknown[] = [];
    server.use(
      http.post(`${API}/ai/chat`, () =>
        ok({
          message: { role: 'assistant', content: 'Please confirm adding Dune.' },
          pendingAction: pending,
          runIds: [2],
        })
      ),
      http.post(`${API}/ai/actions/confirm`, async ({ request }) => {
        confirms.push(await request.json());
        return ok({
          status: 'confirmed',
          actionId: 'a-1',
          tool: 'addToReadingList',
          result: {},
          message: { role: 'assistant', content: `Done: ${pending.summary}.` },
        });
      })
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your message'), 'add dune to my reading list{Enter}');
    const card = await screen.findByRole('region', { name: 'Reading list slip' });
    expect(within(card).getByText(pending.summary)).toBeVisible();
    expect(confirms).toEqual([]);
    await user.click(within(card).getByRole('button', { name: 'Confirm' }));
    expect(await within(card).findByText('Confirmed by you')).toBeVisible();
    expect(within(card).getByText('Added')).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(confirms).toEqual([{ token: 'signed.token' }]);
    expect(await screen.findByText(`Done: ${pending.summary}.`)).toBeVisible();
  });

  it('cancel drops the change; a change decided elsewhere says so instead of failing silently', async () => {
    server.use(
      http.post(`${API}/ai/chat`, () =>
        ok({
          message: { role: 'assistant', content: 'Confirm?' },
          pendingAction: pending,
          runIds: [],
        })
      ),
      http.post(`${API}/ai/actions/cancel`, () =>
        error(409, 'ACTION_ALREADY_DECIDED', 'already decided')
      )
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your message'), 'add dune{Enter}');
    const card = await screen.findByRole('region', { name: 'Reading list slip' });
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'This change was already confirmed or cancelled.'
    );
  });

  it('an unavailable assistant gets a plain notice, and the next message still goes out', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/ai/chat`, () => {
        calls += 1;
        return calls === 1
          ? error(503, 'AI_UNAVAILABLE', 'down')
          : ok({ message: { role: 'assistant', content: 'Back.' }, runIds: [] });
      })
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your message'), 'hello{Enter}');
    expect(
      await screen.findByText(
        'The assistant is unavailable right now. The catalog search still works.'
      )
    ).toBeVisible();
    await user.type(screen.getByLabelText('Your message'), 'again{Enter}');
    expect(await screen.findByText('Back.')).toBeVisible();
    await waitFor(() => expect(calls).toBe(2));
  });

  it('starts with fixed suggestions when the reading list is empty; one click asks it', async () => {
    let asked = '';
    server.use(
      http.get(`${API}/me/reading-list`, () => ok([])),
      http.post(`${API}/ai/chat`, async ({ request }) => {
        const body = (await request.json()) as { messages: Array<{ content: string }> };
        asked = body.messages.at(-1)!.content;
        return ok({ message: { role: 'assistant', content: 'Sure.' }, runIds: [] });
      })
    );
    open();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Books by Tolkien' }));
    expect(await screen.findByText('Sure.')).toBeVisible();
    expect(asked).toBe('Books by Tolkien');
  });

  it("builds the starters from the reader's list and hides them once a message is sent", async () => {
    server.use(
      http.get(`${API}/me/reading-list`, () =>
        ok([
          entry(1, 1, {
            state: ReadingState.enum.FINISHED,
            book: summary(1, { title: 'Dune' }),
            updatedAt: '2026-09-01T00:00:00.000Z',
          }),
          entry(2, 2, {
            state: ReadingState.enum.FINISHED,
            book: summary(2, { title: 'Older Read' }),
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
          entry(3, 3, {
            state: ReadingState.enum.READING,
            book: summary(3, { title: 'Piranesi' }),
          }),
        ])
      ),
      http.post(`${API}/ai/chat`, () =>
        ok({ message: { role: 'assistant', content: 'Try these.' }, runIds: [] })
      )
    );
    open();
    const starters = await screen.findByRole('list', { name: 'Ways to start' });
    await waitFor(() =>
      expect(
        within(starters)
          .getAllByRole('button')
          .map(b => b.textContent)
      ).toEqual(['After Dune, what next?', 'Something like Piranesi', 'Suggest a book in French'])
    );
    await userEvent.setup().click(within(starters).getByRole('button', { name: /^After Dune/ }));
    expect(await screen.findByText('Try these.')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Ways to start' })).toBeNull();
  });

  it('shows the cited books as a shelf, says it is looking meanwhile, and never shows a book twice', async () => {
    let release: (() => void) | undefined;
    server.use(
      http.post(`${API}/ai/chat`, async () => {
        await new Promise<void>(resolve => (release = resolve));
        return ok({
          message: {
            role: 'assistant',
            content: 'Two picks, and I can add the first.',
            citations: [
              { bookId: 12, title: 'Dune' },
              { bookId: 7, title: 'Solaris' },
              { bookId: 8, title: 'Foundation' },
            ],
          },
          pendingAction: pending,
          runIds: [3],
        });
      })
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your message'), 'space classics{Enter}');
    expect(await screen.findByText('Looking through the catalog…')).toBeVisible();
    expect(screen.getByText('Pulling books from the shelves…')).toBeVisible();
    await waitFor(() => expect(release).toBeDefined());
    release?.();

    const shelf = await screen.findByRole('list', { name: 'Books mentioned' });
    expect(
      within(shelf)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/books/7', '/books/8']);
    expect(await within(shelf).findByText('1907')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Reading list slip' })).toBeVisible();
    expect(await screen.findByText('At the desk')).toBeVisible();
  });
});

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  started = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.stop();
  }
  hear(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe('ChatPanel book context and dictation', () => {
  beforeEach(() => useChatStore.setState({ open: false, entries: [], draft: null, context: null }));
  afterEach(() => {
    vi.unstubAllGlobals();
    useChatStore.setState({ open: false, entries: [], draft: null, context: null });
    useUiStore.setState({ toasts: [] });
  });

  it('"Asking about" a book sends its id as the chat context until the chip is removed', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/ai/chat`, async ({ request }) => {
        bodies.push(await request.json());
        return ok({ message: { role: 'assistant', content: 'A classic.' }, runIds: [1] });
      })
    );
    useChatStore.getState().openWithDraft('Is it long?', { bookId: 12, title: 'Dune' });
    renderWithProviders(<ChatPanel />);
    expect(await screen.findByText('Asking about')).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ context: { bookId: 12 } });

    await user.click(screen.getByRole('button', { name: 'Stop asking about Dune' }));
    await user.type(screen.getByLabelText('Your message'), 'and another?{Enter}');
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).not.toHaveProperty('context');
  });

  it('has no mic when the browser has no speech recognition', async () => {
    open();
    await screen.findByLabelText('Your message');
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
  });

  it('dictation types at the caret, shows the unfinished phrase, and never sends', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    let sent = 0;
    server.use(
      http.post(`${API}/ai/chat`, () => {
        sent += 1;
        return ok({ message: { role: 'assistant', content: 'ok' }, runIds: [1] });
      })
    );
    open();
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Your message');
    await user.type(input, 'Is it');
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    const recognition = FakeRecognition.last!;
    expect(recognition).toMatchObject({
      started: true,
      lang: 'en-US',
      continuous: true,
      interimResults: true,
    });
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Listening… speak to type')).toBeVisible();

    act(() => recognition.hear('a good first', false));
    expect(screen.getByText('a good first')).toBeVisible();
    act(() => recognition.hear('a good first book', true));
    expect(input).toHaveValue('Is it a good first book');
    expect(sent).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Stop dictation' }));
    expect(recognition.started).toBe(false);
    expect(screen.queryByText('Listening… speak to type')).toBeNull();
    expect(sent).toBe(0);
  });

  it('a blocked microphone stops dictation with a clear message', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Dictate' }));
    act(() => {
      FakeRecognition.last!.onerror?.({ error: 'not-allowed' });
      FakeRecognition.last!.stop();
    });
    expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: 'The microphone is blocked. Allow it in the browser to dictate.',
    });
    expect(screen.getByRole('button', { name: 'Dictate' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
