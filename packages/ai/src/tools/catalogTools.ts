import {
  AddToReadingListInput,
  AddToReadingListOutput,
  DraftBookInput,
  DraftBookOutput,
  GetBookInput,
  GetBookOutput,
  ListGenresInput,
  ListGenresOutput,
  RemoveFromReadingListInput,
  RemoveFromReadingListOutput,
  GetReadingListInput,
  GetReadingListOutput,
  ChangeReadingListInput,
  ChangeReadingListOutput,
  SearchBooksInput,
  SearchBooksOutput,
  UpdateReadingStateInput,
  UpdateReadingStateOutput,
  ToolName,
} from '@library/contracts';
import type { BookDraft } from '@library/contracts';
import { lookupDraft, lookupRecord } from '../features/autofill.js';
import type { z } from 'zod';
import { LIBRARIAN_ROLES, READER_ROLES } from './registry.js';
import type { ToolContext, ToolDefinition } from './registry.js';

export const searchBooksTool: ToolDefinition<
  z.infer<typeof SearchBooksInput>,
  z.infer<typeof SearchBooksOutput>
> = {
  name: ToolName.enum.searchBooks,
  description:
    'Search the catalog. `q` is free text: a title or an author (typo-tolerant), or a description of what the book is about. ' +
    "For a description, pass the user's own words as one full sentence (the search matches meaning; a list of keywords matches worse). " +
    'Optional genre slugs, year range, `language` (ISO codes of the book text: ["fr"] for books in French, ["ar"] for Arabic) and sort. Returns up to `limit` books.',
  input: SearchBooksInput,
  output: SearchBooksOutput,
  roles: READER_ROLES,
  mutates: false,
  run: async (ctx, input) => {
    if (ctx.search && input.q && !input.genre && !input.yearFrom && !input.yearTo && !input.sort) {
      const found = await ctx.search(input);
      const languages = input.language;
      return languages
        ? found.filter(book => book.language !== null && languages.includes(book.language))
        : found;
    }
    return ctx.ports.catalog.searchBooks(ctx.actor, input);
  },
};

export const getBookTool: ToolDefinition<
  z.infer<typeof GetBookInput>,
  z.infer<typeof GetBookOutput>
> = {
  name: ToolName.enum.getBook,
  description: 'Fetch one book with its full synopsis by id.',
  input: GetBookInput,
  output: GetBookOutput,
  roles: READER_ROLES,
  mutates: false,
  run: async (ctx, input) => {
    const book = await ctx.ports.catalog.getBook(ctx.actor, input.bookId);
    if (!book) throw new Error(`Book ${input.bookId} not found`);
    return book;
  },
};

export const listGenresTool: ToolDefinition<
  z.infer<typeof ListGenresInput>,
  z.infer<typeof ListGenresOutput>
> = {
  name: ToolName.enum.listGenres,
  description: 'List the active genres (id, name, slug).',
  input: ListGenresInput,
  output: ListGenresOutput,
  roles: READER_ROLES,
  mutates: false,
  run: ctx => ctx.ports.catalog.listGenres(ctx.actor),
};

export const getReadingListTool: ToolDefinition<
  z.infer<typeof GetReadingListInput>,
  z.infer<typeof GetReadingListOutput>
> = {
  name: ToolName.enum.getReadingList,
  description:
    "The reader's reading list: every book on it with its state (want to read, reading, finished) and whether it is still available.",
  input: GetReadingListInput,
  output: GetReadingListOutput,
  roles: READER_ROLES,
  mutates: false,
  run: ctx => ctx.ports.catalog.getShelf(ctx.actor),
};

export const addToReadingListTool: ToolDefinition<
  z.infer<typeof AddToReadingListInput>,
  z.infer<typeof AddToReadingListOutput>
> = {
  name: ToolName.enum.addToReadingList,
  description:
    "Add a book to the reader's reading list (idempotent: re-adding reactivates the same entry).",
  input: AddToReadingListInput,
  output: AddToReadingListOutput,
  roles: READER_ROLES,
  mutates: true,
  run: (ctx, input) => ctx.ports.catalog.addToReadingList(ctx.actor, input),
};

export const updateReadingStateTool: ToolDefinition<
  z.infer<typeof UpdateReadingStateInput>,
  z.infer<typeof UpdateReadingStateOutput>
> = {
  name: ToolName.enum.updateReadingState,
  description: "Change the reading state of a book on the reader's list (idempotent).",
  input: UpdateReadingStateInput,
  output: UpdateReadingStateOutput,
  roles: READER_ROLES,
  mutates: true,
  run: (ctx, input) => ctx.ports.catalog.updateReadingState(ctx.actor, input.bookId, input.state),
};

export const removeFromReadingListTool: ToolDefinition<
  z.infer<typeof RemoveFromReadingListInput>,
  z.infer<typeof RemoveFromReadingListOutput>
> = {
  name: ToolName.enum.removeFromReadingList,
  description:
    "Take a book off the reader's reading list (it can be added back later). Only books currently on the list.",
  input: RemoveFromReadingListInput,
  output: RemoveFromReadingListOutput,
  roles: READER_ROLES,
  mutates: true,
  run: async (ctx, input) => {
    await ctx.ports.catalog.removeFromReadingList(ctx.actor, input.bookId);
    return { bookId: input.bookId, removed: true as const };
  },
};

export const changeReadingListTool: ToolDefinition<
  z.infer<typeof ChangeReadingListInput>,
  z.infer<typeof ChangeReadingListOutput>
> = {
  name: ToolName.enum.changeReadingList,
  description:
    "Several changes to books already on the reader's reading list in one go (at most 10): remove a book, or set its state. " +
    'All are confirmed together and applied together. It cannot add books: adding is one book at a time with addToReadingList.',
  input: ChangeReadingListInput,
  output: ChangeReadingListOutput,
  roles: READER_ROLES,
  mutates: true,
  run: (ctx, input) => ctx.ports.catalog.changeReadingList(ctx.actor, input.changes),
};

export const draftBookTool: ToolDefinition<z.infer<typeof DraftBookInput>, BookDraft> = {
  name: ToolName.enum.draftBook,
  description:
    'Librarian only. Build a book draft from an ISBN or a title (+ author) using the external catalog lookup. Nothing is saved.',
  input: DraftBookInput,
  output: DraftBookOutput,
  roles: LIBRARIAN_ROLES,
  mutates: false,
  run: async (ctx, input) => lookupDraft(input, await lookupRecord(ctx.ports.lookup, input)),
};

export const catalogTools = [
  searchBooksTool,
  getBookTool,
  listGenresTool,
  getReadingListTool,
  addToReadingListTool,
  updateReadingStateTool,
  removeFromReadingListTool,
  changeReadingListTool,
  draftBookTool,
] as ToolDefinition<never, unknown>[];

export type { ToolContext };
