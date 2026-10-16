import type {
  ReadingListBatchResponse,
  ReadingListChange,
  AddToShelfBody,
  AiFeature,
  TraceProviderName,
  Book,
  BookSummary,
  FavoriteGenre,
  Genre,
  PendingActionStatus,
  ReadingListEntry,
  ReadingState,
  Role,
  SearchBooksInput,
} from '@library/contracts';
import type { ExternalRecord } from '@library/domain-config';

export interface Actor {
  id: number;
  role: Role;
}

export interface CatalogPort {
  searchBooks(actor: Actor, input: SearchBooksInput): Promise<BookSummary[]>;
  getBook(actor: Actor, bookId: number): Promise<Book | null>;
  listGenres(actor: Actor): Promise<Genre[]>;
  getShelf(actor: Actor): Promise<ReadingListEntry[]>;
  getFavoriteGenres(actor: Actor): Promise<FavoriteGenre[]>;
  addToReadingList(actor: Actor, input: AddToShelfBody): Promise<ReadingListEntry>;
  updateReadingState(actor: Actor, bookId: number, state: ReadingState): Promise<ReadingListEntry>;
  removeFromReadingList(actor: Actor, bookId: number): Promise<void>;
  changeReadingList(actor: Actor, changes: ReadingListChange[]): Promise<ReadingListBatchResponse>;
  booksByIds(actor: Actor, ids: number[]): Promise<BookSummary[]>;
  listBooksForEmbedding(): Promise<EmbeddingSource[]>;
}

export interface EmbeddingSource {
  id: number;
  text: string;
  contentHash: string;
}

export interface VectorUpsert {
  bookId: number;
  vector: number[];
  contentHash: string;
  model: string;
  dimensions: number;
}

export interface KnnHit {
  bookId: number;
  score: number;
}

export interface VectorStorePort {
  upsert(items: VectorUpsert[]): Promise<void>;
  knn(
    vector: number[],
    opts: { limit: number; model: string; excludeBookId?: number; genreSlug?: string }
  ): Promise<KnnHit[]>;
  hashes(): Promise<Map<number, { contentHash: string; model: string; dimensions: number }>>;
  vectorOf(bookId: number): Promise<number[] | null>;
}

export interface AiRunInput {
  userId: number | null;
  feature: AiFeature;
  provider: TraceProviderName;
  model: string;
  tokensIn: number;
  tokensOut: number;
  tokensCachedRead: number;
  tokensCachedWrite: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  errorCode: string | null;
  requestId: string | null;
  tokensSpeechIn?: number;
  tokensSpeechOut?: number;
}

export interface TracePort {
  record(run: AiRunInput): Promise<number | null>;
}

export interface LookupPort {
  byIsbn(isbn: string): Promise<ExternalRecord | null>;
  byTitle(title: string, author?: string): Promise<ExternalRecord[]>;
}

export interface StoredExpansion {
  sourceHash: string;
  model: string;
  fr: string;
  ar: string;
}

export interface ExpansionStorePort {
  all(): Promise<Map<number, StoredExpansion>>;
  upsert(bookId: number, expansion: StoredExpansion): Promise<void>;
}

export interface StoredPendingAction {
  id: string;
  actorId: number;
  tool: string;
  input: unknown;
  summary: string;
  locale: 'en' | 'fr';
  expiresAt: string;
}

export interface PendingActionPort {
  create(action: StoredPendingAction): Promise<void>;
  decide(
    id: string,
    actorId: number,
    decision: PendingActionStatus
  ): Promise<StoredPendingAction | null>;
  finish(id: string, outcome: { ok: boolean; error?: string }): Promise<void>;
}

export interface Ports {
  catalog: CatalogPort;
  vectorStore: VectorStorePort;
  trace: TracePort;
  lookup: LookupPort;
  expansions: ExpansionStorePort;
  pendingActions: PendingActionPort;
}
