import { describe, expect, it } from 'vitest';
import { DEMO, cleanup, data, http, login, registerReader } from './smoke.setup.js';

interface Drafted<T> {
  value: T | null;
  source: 'lookup' | 'input' | 'model' | 'empty';
  confidence: number;
}
interface BookDraft {
  title: Drafted<string>;
  publishedYear: Drafted<number>;
  genreIds: Drafted<number[]>;
  lookupSource: string | null;
}

describe('ai: librarian autofill', () => {
  it('drafts Dune from its ISBN with sources, for librarians only', async () => {
    const librarian = await login(DEMO.librarian);
    const res = await http<BookDraft>('/ai/books/autofill', {
      method: 'POST',
      body: { isbn: '9780441172719' },
      token: librarian.token,
    });
    expect(res.status).toBe(200);
    expect(data(res)).toMatchObject({
      title: { value: 'Dune', source: 'lookup' },
      publishedYear: { value: 1965, source: 'lookup' },
      lookupSource: 'openlibrary',
    });
    expect(data(res).genreIds.source).toBe('model');

    const reader = await login(DEMO.reader);
    const forbidden = await http('/ai/books/autofill', {
      method: 'POST',
      body: { isbn: '9780441172719' },
      token: reader.token,
    });
    expect(forbidden.status).toBe(403);
  });
});

interface ChatTurn {
  message: { content: string; citations?: Array<{ bookId: number; title: string }> };
  pendingAction?: {
    id: string;
    tool: string;
    input: { bookId: number };
    token: string;
    summary: string;
  };
}

describe('ai: librarian agent chat (Mock agent)', () => {
  it('proposes a reading-list change, runs it once on confirm, refuses a replay', async () => {
    const reader = await registerReader('chat');
    const turn = await http<ChatTurn>('/ai/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'add dune to my reading list' }], locale: 'en' },
      token: reader.token,
    });
    expect(turn.status).toBe(200);
    const action = data(turn).pendingAction;
    expect(action).toMatchObject({ tool: 'addToReadingList' });
    const before = await http<unknown[]>('/me/reading-list', { token: reader.token });
    expect(data(before)).toEqual([]);

    const confirm = () =>
      http('/ai/actions/confirm', {
        method: 'POST',
        body: { token: action!.token },
        token: reader.token,
      });
    expect((await confirm()).status).toBe(200);
    cleanup.shelf(reader, action!.input.bookId);
    expect((await confirm()).status).toBe(409);
    const after = await http<Array<{ book: { title: string } }>>('/me/reading-list', {
      token: reader.token,
    });
    expect(data(after).map(entry => entry.book.title)).toEqual(['Dune']);
  });
});
