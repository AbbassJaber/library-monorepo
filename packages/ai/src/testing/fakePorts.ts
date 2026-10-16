import {
  Role,
  BookSort,
  type Book,
  type BookSummary,
  type FavoriteGenre,
  type Genre,
  type ReadingListEntry,
} from '@library/contracts';
import type { ExternalRecord } from '@library/domain-config';
import type {
  ExpansionStorePort,
  PendingActionPort,
  StoredExpansion,
  StoredPendingAction,
  Actor,
  AiRunInput,
  CatalogPort,
  EmbeddingSource,
  KnnHit,
  LookupPort,
  Ports,
  TracePort,
  VectorStorePort,
  VectorUpsert,
} from '../ports/index.js';
import { contentHash } from '../features/embeddings.js';

export interface FakeState {
  books: Book[];
  genres: Genre[];
  shelf: Map<number, ReadingListEntry[]>;
  favorites: Map<number, FavoriteGenre[]>;
  lookup: ExternalRecord[];
  runs: AiRunInput[];
  vectors: Map<number, VectorUpsert>;
  expansions: Map<number, StoredExpansion>;
  pending: Map<
    string,
    StoredPendingAction & {
      status: 'pending' | 'confirmed' | 'cancelled';
      outcome?: { ok: boolean; error?: string };
    }
  >;
}

const summaryOf = (book: Book): BookSummary => {
  const { synopsis: _s, isbn: _i, version: _v, updatedAt: _u, ...summary } = book;
  return summary;
};

const cosine = (a: number[], b: number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
};

export const createFakeState = (overrides: Partial<FakeState> = {}): FakeState => ({
  books: [],
  genres: [],
  shelf: new Map(),
  favorites: new Map(),
  lookup: [],
  runs: [],
  vectors: new Map(),
  expansions: new Map(),
  pending: new Map(),
  ...overrides,
});

export const createFakePorts = (
  state: FakeState = createFakeState()
): Ports & { state: FakeState } => {
  const visible = (actor: Actor) =>
    state.books.filter(book => book.archivedAt === null || actor.role === Role.enum.LIBRARIAN);
  let nextEntryId = 1000;
  const catalog: CatalogPort = {
    async searchBooks(actor, input) {
      const q = input.q?.toLowerCase();
      return visible(actor)
        .filter(book => book.archivedAt === null)
        .filter(
          book =>
            !q || book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q)
        )
        .filter(
          book => !input.genre || input.genre.some(slug => book.genres.some(g => g.slug === slug))
        )
        .filter(book => input.yearFrom === undefined || book.publishedYear >= input.yearFrom)
        .filter(book => input.yearTo === undefined || book.publishedYear <= input.yearTo)
        .filter(
          book =>
            !input.language || (book.language !== null && input.language.includes(book.language))
        )
        .sort((a, b) =>
          input.sort === BookSort.enum.title
            ? a.title.localeCompare(b.title)
            : input.sort === BookSort.enum.rating
              ? b.rating - a.rating
              : b.createdAt.localeCompare(a.createdAt)
        )
        .slice(0, input.limit)
        .map(summaryOf);
    },
    async getBook(actor, bookId) {
      return visible(actor).find(book => book.id === bookId) ?? null;
    },
    async listGenres(actor) {
      return state.genres.filter(
        genre => genre.archivedAt === null || actor.role === Role.enum.LIBRARIAN
      );
    },
    async getShelf(actor) {
      return state.shelf.get(actor.id) ?? [];
    },
    async getFavoriteGenres(actor) {
      return state.favorites.get(actor.id) ?? [];
    },
    async addToReadingList(actor, input) {
      const book = state.books.find(b => b.id === input.bookId && b.archivedAt === null);
      if (!book) throw new Error('NOT_FOUND');
      const shelf = state.shelf.get(actor.id) ?? [];
      const existing = shelf.find(entry => entry.book.id === input.bookId);
      if (existing) return existing;
      const entry: ReadingListEntry = {
        id: nextEntryId++,
        state: input.state,
        book: summaryOf(book),
        available: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.shelf.set(actor.id, [...shelf, entry]);
      return entry;
    },
    async updateReadingState(actor, bookId, newState) {
      const shelf = state.shelf.get(actor.id) ?? [];
      const entry = shelf.find(item => item.book.id === bookId);
      if (!entry) throw new Error('NOT_FOUND');
      entry.state = newState;
      entry.updatedAt = new Date().toISOString();
      return entry;
    },
    async removeFromReadingList(actor, bookId) {
      const shelf = state.shelf.get(actor.id) ?? [];
      if (!shelf.some(entry => entry.book.id === bookId)) throw new Error('NOT_FOUND');
      state.shelf.set(
        actor.id,
        shelf.filter(entry => entry.book.id !== bookId)
      );
    },
    async changeReadingList(actor, changes) {
      const shelf = state.shelf.get(actor.id) ?? [];
      for (const change of changes) {
        const entry = shelf.find(e => e.book.id === change.bookId);
        if (!entry) throw new Error('NOT_FOUND');
        if (change.action === 'setState' && !entry.available) throw new Error('BOOK_ARCHIVED');
      }
      const removed: number[] = [];
      const updated: ReadingListEntry[] = [];
      for (const change of changes) {
        const entry = shelf.find(e => e.book.id === change.bookId)!;
        if (change.action === 'remove') removed.push(change.bookId);
        else {
          entry.state = change.state;
          entry.updatedAt = new Date().toISOString();
          updated.push(entry);
        }
      }
      state.shelf.set(
        actor.id,
        shelf.filter(entry => !removed.includes(entry.book.id))
      );
      return { removed, updated };
    },
    async booksByIds(_actor, ids) {
      return ids
        .map(id => state.books.find(book => book.id === id && book.archivedAt === null))
        .filter((book): book is Book => book !== undefined)
        .map(summaryOf);
    },
    async listBooksForEmbedding(): Promise<EmbeddingSource[]> {
      return state.books
        .filter(book => book.archivedAt === null)
        .map(book => {
          const text = `${book.title}\n${book.author}\n${book.genres.map(g => g.slug).join(' ')}\n${book.synopsis}`;
          return { id: book.id, text, contentHash: contentHash(text) };
        });
    },
  };
  const vectorStore: VectorStorePort = {
    async upsert(items) {
      for (const item of items) state.vectors.set(item.bookId, item);
    },
    async knn(vector, opts): Promise<KnnHit[]> {
      return [...state.vectors.values()]
        .filter(row => row.model === opts.model && row.dimensions === vector.length)
        .filter(row => row.bookId !== opts.excludeBookId)
        .filter(row => {
          const book = state.books.find(b => b.id === row.bookId);
          return (
            book &&
            book.archivedAt === null &&
            (!opts.genreSlug || book.genres.some(g => g.slug === opts.genreSlug))
          );
        })
        .map(row => ({ bookId: row.bookId, score: cosine(vector, row.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit);
    },
    async hashes() {
      return new Map(
        [...state.vectors.values()].map(row => [
          row.bookId,
          { contentHash: row.contentHash, model: row.model, dimensions: row.dimensions },
        ])
      );
    },
    async vectorOf(bookId) {
      return state.vectors.get(bookId)?.vector ?? null;
    },
  };
  const trace: TracePort = {
    async record(run) {
      state.runs.push(run);
      return state.runs.length;
    },
  };
  const lookup: LookupPort = {
    async byIsbn(isbn) {
      return state.lookup.find(record => record.isbn === isbn) ?? null;
    },
    async byTitle(title, author) {
      const t = title.toLowerCase();
      return state.lookup.filter(
        record =>
          record.title.toLowerCase().includes(t) &&
          (!author || record.authors.some(a => a.toLowerCase().includes(author.toLowerCase())))
      );
    },
  };
  const expansions: ExpansionStorePort = {
    all: async () => new Map(state.expansions),
    upsert: async (bookId, expansion) => {
      state.expansions.set(bookId, expansion);
    },
  };
  const pendingActions: PendingActionPort = {
    create: async action => {
      state.pending.set(action.id, { ...action, status: 'pending' });
    },
    decide: async (id, actorId, decision) => {
      const row = state.pending.get(id);
      if (!row || row.actorId !== actorId || row.status !== 'pending') return null;
      if (Date.parse(row.expiresAt) <= Date.now()) return null;
      row.status = decision;
      const { status: _status, outcome: _outcome, ...action } = row;
      return action;
    },
    finish: async (id, outcome) => {
      const row = state.pending.get(id);
      if (row) row.outcome = outcome;
    },
  };
  return { catalog, vectorStore, trace, lookup, expansions, pendingActions, state };
};
