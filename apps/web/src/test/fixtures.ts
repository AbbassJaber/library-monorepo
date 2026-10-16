import {
  ReadingState,
  Role,
  AiProviderName,
  ForcedToolChoiceMode,
  EmbeddingProviderName,
  type AiStatus,
  type Book,
  type BookSummary,
  type Genre,
  type ReadingListEntry,
  type UserPublic,
  EmbeddingExpansion,
  AiTier,
  VoiceMode,
} from '@library/contracts';

export const genres: Genre[] = [
  {
    id: 1,
    name: 'Fantasy',
    slug: 'fantasy',
    archivedAt: null,
    activeBookCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Science Fiction',
    slug: 'science-fiction',
    archivedAt: null,
    activeBookCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Poetry',
    slug: 'poetry',
    archivedAt: null,
    activeBookCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const summary = (id: number, overrides: Partial<BookSummary> = {}): BookSummary => ({
  id,
  title: `Book ${id}`,
  author: `Author ${id}`,
  publishedYear: 1900 + id,
  rating: 4,
  coverUrl: null,
  language: 'en',
  genres: [{ id: 1, name: 'Fantasy', slug: 'fantasy' }],
  archivedAt: null,
  createdAt: `2026-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  ...overrides,
});

export const book = (id: number, overrides: Partial<Book> = {}): Book => ({
  ...summary(id),
  synopsis: `Synopsis of book ${id}.`,
  isbn: null,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const entry = (
  id: number,
  bookId: number,
  overrides: Partial<ReadingListEntry> = {}
): ReadingListEntry => ({
  id,
  state: ReadingState.enum.WANT_TO_READ,
  book: summary(bookId),
  available: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const reader: UserPublic = {
  id: 1,
  email: 'reader@test.local',
  displayName: 'Demo Reader',
  role: Role.enum.READER,
};
export const librarian: UserPublic = {
  id: 2,
  email: 'librarian@test.local',
  displayName: 'Demo Librarian',
  role: Role.enum.LIBRARIAN,
};

export const aiStatus: AiStatus = {
  provider: AiProviderName.enum.mock,
  models: { small: 'mock-small', strong: 'mock-strong' },
  cachingSupported: false,
  forcedToolChoice: ForcedToolChoiceMode.enum.forced,
  tiers: {
    small: {
      provider: AiProviderName.enum.mock,
      model: 'mock-small',
      cachingSupported: false,
      forcedToolChoice: ForcedToolChoiceMode.enum.forced,
    },
    strong: {
      provider: AiProviderName.enum.mock,
      model: 'mock-strong',
      cachingSupported: false,
      forcedToolChoice: ForcedToolChoiceMode.enum.forced,
    },
  },
  embeddings: {
    provider: EmbeddingProviderName.enum.mock,
    model: 'mock-embedding',
    dimensions: 384,
    expansion: EmbeddingExpansion.enum.off,
  },
  features: {
    NL_SEARCH: true,
    HYBRID_SEARCH: true,
    RERANK: false,
    SIMILAR: true,
    AUTOFILL: true,
    RECOMMEND: false,
    AGENT_CHAT: false,
    EMBEDDING: true,
    JUDGE: false,
    EXPANSION: false,
    VOICE: false,
  },
  search: { minSimilarity: 0 },
  chat: { tier: AiTier.enum.small },
  voiceMode: VoiceMode.enum.off,
};
