import { describe, expect, it } from 'vitest';
import {
  AutofillBody,
  AutofillModelOutput,
  FieldSource,
  HybridSearchQuery,
  RerankModelOutput,
  BookDraft,
  ChatBody,
  ConfirmActionBody,
  NlSearchModelOutput,
  ParseSearchBody,
  ParsedSearch,
  SearchBooksInput,
  ToolName,
  UpdateReadingStateInput,
} from './ai.js';
import { VALIDATION_CODES } from './constants.js';

describe('ParseSearchBody', () => {
  it('trims and caps the text at 300 characters', () => {
    expect(ParseSearchBody.parse({ text: '  fantasy from the 90s  ' })).toEqual({
      text: 'fantasy from the 90s',
    });
    expect(ParseSearchBody.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
    expect(ParseSearchBody.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('rejects unknown keys (strict body)', () => {
    expect(ParseSearchBody.safeParse({ text: 'ok', page: 2 }).success).toBe(false);
  });
});

describe('ParsedSearch / NlSearchModelOutput', () => {
  it('nests a fully validated BooksQuery with chips and a confidence in [0, 1]', () => {
    const parsed = ParsedSearch.parse({
      query: { genre: 'fantasy', yearFrom: '1990', yearTo: '1999', sort: 'rating' },
      chips: [{ key: 'genre', label: 'Fantasy', value: 'fantasy' }],
      confidence: 0.9,
    });
    expect(parsed.query).toMatchObject({ genre: ['fantasy'], yearFrom: 1990, page: 1 });
    expect(ParsedSearch.safeParse({ query: {}, chips: [], confidence: 1.5 }).success).toBe(false);
  });

  it('lets the model answer null for anything it did not find', () => {
    const out = NlSearchModelOutput.parse({
      q: null,
      genres: ['science-fiction'],
      yearFrom: null,
      yearTo: null,
      sort: null,
      confidence: 0.4,
    });
    expect(out.genres).toEqual(['science-fiction']);
    expect(NlSearchModelOutput.safeParse({ ...out, genres: ['Not A Slug'] }).success).toBe(false);
  });
});

describe('AutofillBody', () => {
  it('requires an ISBN or a title, with a code (not a sentence) as the message', () => {
    const result = AutofillBody.safeParse({ author: 'Someone' });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe(VALIDATION_CODES.autofillIsbnOrTitle);
    expect(AutofillBody.parse({ isbn: '978-0-618-26030-0' })).toEqual({ isbn: '9780618260300' });
    expect(AutofillBody.parse({ title: 'Dune' })).toEqual({ title: 'Dune' });
  });
});

describe('AutofillModelOutput', () => {
  it('lets the model fill only author, year, synopsis and genre slugs, each with a confidence', () => {
    const out = AutofillModelOutput.parse({
      author: null,
      publishedYear: 1967,
      synopsis: 'A visit from the devil.',
      genres: ['literary-fiction', 'fantasy'],
      yearCheck: null,
      confidence: { author: 0, publishedYear: 0.8, synopsis: 0.7, genres: 0.9, yearCheck: 0 },
    });
    expect(out.genres).toEqual(['literary-fiction', 'fantasy']);
    expect(AutofillModelOutput.safeParse({ ...out, yearCheck: 'around 1930' }).success).toBe(false);
    expect(AutofillModelOutput.safeParse({ ...out, title: 'x' }).success).toBe(false);
    expect(AutofillModelOutput.safeParse({ ...out, genres: ['Science Fiction'] }).success).toBe(
      false
    );
    expect(FieldSource.options).toContain('input');
  });
});

describe('BookDraft', () => {
  it('carries a source and confidence for every field and allows nulls', () => {
    const field = (value: unknown, source: 'lookup' | 'model' | 'empty' = 'lookup') => ({
      value,
      source,
      confidence: 1,
    });
    const draft = BookDraft.parse({
      title: field('Dune'),
      author: field('Frank Herbert'),
      publishedYear: field(1965),
      synopsis: field(null, 'empty'),
      isbn: field('9780441013593'),
      coverUrl: field(null, 'empty'),
      genreIds: field([2], 'model'),
      lookupSource: 'openlibrary',
    });
    expect(draft.synopsis).toEqual({ value: null, source: 'empty', confidence: 1 });
    expect(draft.publishedYear.conflict).toBeNull();
    const flagged = BookDraft.parse({
      ...draft,
      publishedYear: { ...field(1800), conflict: { value: 1859, confidence: 0.9 } },
    });
    expect(flagged.publishedYear.conflict).toEqual({ value: 1859, confidence: 0.9 });
    expect(BookDraft.safeParse({ ...draft, genreIds: field([1, 2, 3, 4, 5, 6]) }).success).toBe(
      false
    );
  });
});

describe('ChatBody / ConfirmActionBody', () => {
  const message = (content: string) => ({ role: 'user' as const, content });

  it('defaults to English, takes no mode (tools follow the role) and caps the transcript at 20', () => {
    expect(ChatBody.parse({ messages: [message('hi')] }).locale).toBe('en');
    expect(ChatBody.safeParse({ messages: [message('hi')], locale: 'ar' }).success).toBe(false);
    expect(ChatBody.safeParse({ messages: [message('hi')], mode: 'librarian' }).success).toBe(
      false
    );
    expect(ChatBody.safeParse({ messages: [] }).success).toBe(false);
    expect(
      ChatBody.safeParse({ messages: Array.from({ length: 21 }, () => message('x')) }).success
    ).toBe(false);
    expect(ChatBody.safeParse({ messages: [message('x')], extra: true }).success).toBe(false);
  });

  it('takes an optional book context: an id only, nothing else', () => {
    expect(ChatBody.parse({ messages: [message('hi')], context: { bookId: 7 } }).context).toEqual({
      bookId: 7,
    });
    expect(ChatBody.parse({ messages: [message('hi')] }).context).toBeUndefined();
    expect(ChatBody.safeParse({ messages: [message('hi')], context: { bookId: 0 } }).success).toBe(
      false
    );
    expect(
      ChatBody.safeParse({ messages: [message('hi')], context: { bookId: 7, title: 'Dune' } })
        .success
    ).toBe(false);
  });

  it('confirm needs a non-empty token', () => {
    expect(ConfirmActionBody.safeParse({ token: '' }).success).toBe(false);
    expect(ConfirmActionBody.parse({ token: 'abc' })).toEqual({ token: 'abc' });
  });
});

describe('tool inputs', () => {
  it('lists the nine tools shared by HTTP, chat, voice and MCP', () => {
    expect(ToolName.options).toEqual([
      'searchBooks',
      'getBook',
      'listGenres',
      'getReadingList',
      'addToReadingList',
      'updateReadingState',
      'removeFromReadingList',
      'changeReadingList',
      'draftBook',
    ]);
  });

  it('searchBooks defaults the limit to 6 and caps it at 10', () => {
    expect(SearchBooksInput.parse({ q: 'dune' })).toEqual({ q: 'dune', limit: 6 });
    expect(SearchBooksInput.safeParse({ limit: 11 }).success).toBe(false);
    expect(SearchBooksInput.safeParse({ q: 'd' }).success).toBe(false);
  });

  it('updateReadingState takes a book id and a known state', () => {
    expect(UpdateReadingStateInput.parse({ bookId: 3, state: 'READING' })).toEqual({
      bookId: 3,
      state: 'READING',
    });
    expect(UpdateReadingStateInput.safeParse({ bookId: 3, state: 'DONE' }).success).toBe(false);
  });
});

describe('HybridSearchQuery / RerankModelOutput', () => {
  it('reads rerank from the query string and leaves it unset when absent', () => {
    expect(HybridSearchQuery.parse({ q: 'desert planet', rerank: 'true' })).toMatchObject({
      q: 'desert planet',
      limit: 10,
      rerank: true,
    });
    expect(HybridSearchQuery.parse({ q: 'desert planet' }).rerank).toBeUndefined();
    expect(HybridSearchQuery.safeParse({ q: 'x' }).success).toBe(false);
  });

  it('a rerank is a list of book ids, at most the candidate cap, nothing else', () => {
    expect(RerankModelOutput.parse({ order: [12, 3, 7] }).order).toEqual([12, 3, 7]);
    expect(RerankModelOutput.safeParse({ order: [1], why: 'x' }).success).toBe(false);
    expect(
      RerankModelOutput.safeParse({ order: Array.from({ length: 21 }, (_, i) => i + 1) }).success
    ).toBe(false);
  });
});
