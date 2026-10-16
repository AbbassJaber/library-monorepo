import { z } from 'zod';
import { VALIDATION_CODES } from './constants.js';
import {
  BOOK_LANGUAGES_PER_QUERY_MAX,
  Book,
  BookLanguage,
  BookSummary,
  BooksQuery,
  CreateBookBody,
  GENRES_PER_BOOK_MAX,
  Isbn,
} from './books.js';
import { Id, ReadingState, emptyToUndefined } from './common.js';
import { Genre, GenreSlug } from './genres.js';
import {
  AddToShelfBody,
  ReadingListBatchBody,
  ReadingListBatchResponse,
  ReadingListEntry,
} from './shelf.js';

export const AiProviderName = z.enum(['bedrock', 'anthropic', 'kimi', 'openai-compatible', 'mock']);
export type AiProviderName = z.infer<typeof AiProviderName>;

export const EmbeddingProviderName = z.enum(['bedrock', 'local', 'mock']);
export type EmbeddingProviderName = z.infer<typeof EmbeddingProviderName>;

export const VoiceProviderName = z.enum(['nova-sonic', 'mock']);
export type VoiceProviderName = z.infer<typeof VoiceProviderName>;

export const VoiceProviderSetting = z.enum(['off', ...VoiceProviderName.options]);
export type VoiceProviderSetting = z.infer<typeof VoiceProviderSetting>;

export const TraceProviderName = z.enum([
  ...new Set([
    ...AiProviderName.options,
    ...EmbeddingProviderName.options,
    ...VoiceProviderName.options,
  ]),
] as [string, ...string[]]);
export type TraceProviderName = AiProviderName | EmbeddingProviderName | VoiceProviderName;

export const AiFeature = z.enum([
  'NL_SEARCH',
  'HYBRID_SEARCH',
  'RERANK',
  'SIMILAR',
  'AUTOFILL',
  'RECOMMEND',
  'AGENT_CHAT',
  'EMBEDDING',
  'JUDGE',
  'EXPANSION',
  'VOICE',
]);
export type AiFeature = z.infer<typeof AiFeature>;

export const EXPANSION_SUMMARY_MAX = 400;

export const ExpansionModelOutput = z.strictObject({
  fr: z.string().trim().min(1).max(EXPANSION_SUMMARY_MAX),
  ar: z.string().trim().min(1).max(EXPANSION_SUMMARY_MAX),
});
export type ExpansionModelOutput = z.infer<typeof ExpansionModelOutput>;

export const ForcedToolChoiceMode = z.enum(['forced', 'auto-with-instruction']);

export const AiTier = z.enum(['small', 'strong']);
export type AiTier = z.infer<typeof AiTier>;

export const EmbeddingExpansion = z.enum(['off', 'fr-ar']);
export type EmbeddingExpansion = z.infer<typeof EmbeddingExpansion>;

export const VoiceMode = z.enum(['browser', 'server', 'off']);
export type VoiceMode = z.infer<typeof VoiceMode>;

export const AiTierStatus = z.object({
  provider: AiProviderName,
  model: z.string(),
  cachingSupported: z.boolean(),
  forcedToolChoice: ForcedToolChoiceMode,
});
export type AiTierStatus = z.infer<typeof AiTierStatus>;

export const AiStatus = z
  .object({
    provider: AiProviderName,
    models: z.object({ small: z.string().nullable(), strong: z.string().nullable() }),
    cachingSupported: z.boolean(),
    forcedToolChoice: ForcedToolChoiceMode,
    tiers: z.object({ small: AiTierStatus, strong: AiTierStatus }),
    embeddings: z.object({
      provider: EmbeddingProviderName,
      model: z.string().nullable(),
      dimensions: z.number().int().positive().nullable(),
      expansion: EmbeddingExpansion.default(EmbeddingExpansion.enum.off),
    }),
    features: z.record(AiFeature, z.boolean()),
    search: z.object({ minSimilarity: z.number().min(0).max(1) }),
    chat: z.object({ tier: AiTier }).default({ tier: AiTier.enum.small }),
    voiceMode: VoiceMode,
  })
  .meta({ id: 'AiStatus' });
export type AiStatus = z.infer<typeof AiStatus>;

export const AiMeta = z
  .object({
    runId: Id.nullable(),
    feature: AiFeature,
    provider: TraceProviderName,
    model: z.string(),
    tokensIn: z.number().int().min(0),
    tokensOut: z.number().int().min(0),
    tokensCachedRead: z.number().int().min(0),
    tokensCachedWrite: z.number().int().min(0),
    costUsd: z.number().min(0),
    latencyMs: z.number().int().min(0),
    fallbackUsed: z.boolean(),
  })
  .meta({ id: 'AiMeta' });
export type AiMeta = z.infer<typeof AiMeta>;

export const AiRunSummary = AiMeta.omit({ runId: true })
  .extend({
    id: Id,
    userId: Id.nullable(),
    success: z.boolean(),
    errorCode: z.string().nullable(),
    tokensSpeechIn: z.number().int().min(0).default(0),
    tokensSpeechOut: z.number().int().min(0).default(0),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AiRunSummary' });
export type AiRunSummary = z.infer<typeof AiRunSummary>;

export const AiRunsResponse = z.object({
  items: z.array(AiRunSummary),
  totals: z.object({
    runs: z.number().int().min(0),
    costUsd: z.number().min(0),
    failures: z.number().int().min(0),
  }),
});
export type AiRunsResponse = z.infer<typeof AiRunsResponse>;

export const ParseSearchBody = z
  .strictObject({ text: z.string().trim().min(1).max(300) })
  .meta({ id: 'ParseSearchBody' });
export type ParseSearchBody = z.infer<typeof ParseSearchBody>;

export const QueryChip = z.object({
  key: z.enum(['q', 'genre', 'yearFrom', 'yearTo', 'sort']),
  label: z.string(),
  value: z.string(),
});
export type QueryChip = z.infer<typeof QueryChip>;

export const ParsedSearch = z
  .object({
    query: BooksQuery,
    chips: z.array(QueryChip),
    confidence: z.number().min(0).max(1),
    unparsed: z.string().optional(),
  })
  .meta({ id: 'ParsedSearch' });
export type ParsedSearch = z.infer<typeof ParsedSearch>;

export const NlSearchModelOutput = z.strictObject({
  q: z.string().max(200).nullable(),
  genres: z.array(GenreSlug).max(5),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  sort: z.enum(['newest', 'title', 'rating']).nullable(),
  confidence: z.number().min(0).max(1),
});
export type NlSearchModelOutput = z.infer<typeof NlSearchModelOutput>;

export const HybridSearchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).default(10)),
  genre: z.preprocess(emptyToUndefined, GenreSlug.optional()),
  rerank: z.preprocess(
    emptyToUndefined,
    z
      .enum(['true', 'false'])
      .transform(value => value === 'true')
      .optional()
  ),
});
export type HybridSearchQuery = z.infer<typeof HybridSearchQuery>;

export const RERANK_CANDIDATES_MAX = 20;

export const RerankModelOutput = z.strictObject({
  order: z.array(Id).max(RERANK_CANDIDATES_MAX),
});
export type RerankModelOutput = z.infer<typeof RerankModelOutput>;

export const MatchReason = z.enum(['title', 'author', 'spelling', 'meaning']);
export type MatchReason = z.infer<typeof MatchReason>;

export const SearchMatch = z
  .object({
    semanticRank: z.number().int().positive().nullable(),
    fusedRank: z.number().int().positive(),
    rerankedRank: z.number().int().positive().nullable(),
    matchedOn: z.array(MatchReason),
  })
  .meta({ id: 'SearchMatch' });
export type SearchMatch = z.infer<typeof SearchMatch>;

export const ScoredBook = z.object({
  book: BookSummary,
  scores: z.object({
    lexical: z.number().nullable(),
    semantic: z.number().nullable(),
    fused: z.number(),
  }),
  match: SearchMatch.optional(),
});
export type ScoredBook = z.infer<typeof ScoredBook>;

export const HybridSearchResponse = z.object({
  items: z.array(ScoredBook),
  reranked: z.boolean(),
});
export type HybridSearchResponse = z.infer<typeof HybridSearchResponse>;

export const SimilarBooksResponse = z.array(ScoredBook).max(10);
export type SimilarBooksResponse = z.infer<typeof SimilarBooksResponse>;

export const AutofillBody = z
  .strictObject({
    isbn: Isbn.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    author: z.string().trim().min(1).max(120).optional(),
  })
  .refine(body => body.isbn !== undefined || body.title !== undefined, {
    message: VALIDATION_CODES.autofillIsbnOrTitle,
  })
  .meta({ id: 'AutofillBody' });
export type AutofillBody = z.infer<typeof AutofillBody>;

export const FieldSource = z.enum(['lookup', 'input', 'model', 'empty']);
export type FieldSource = z.infer<typeof FieldSource>;

const drafted = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), source: FieldSource, confidence: z.number().min(0).max(1) });

export const BookDraft = z
  .object({
    title: drafted(CreateBookBody.shape.title),
    author: drafted(CreateBookBody.shape.author),
    publishedYear: drafted(z.number().int()).extend({
      conflict: z
        .object({ value: z.number().int(), confidence: z.number().min(0).max(1) })
        .nullable()
        .default(null),
    }),
    synopsis: drafted(z.string().max(4000)),
    isbn: drafted(Isbn),
    coverUrl: drafted(z.url()),
    genreIds: drafted(z.array(Id).max(5)),
    lookupSource: z.string().nullable(),
  })
  .meta({ id: 'BookDraft' });
export type BookDraft = z.infer<typeof BookDraft>;

export const AUTOFILL_SYNOPSIS_MAX = 1200;

const Confidence = z.number().min(0).max(1);

export const AutofillModelOutput = z.strictObject({
  author: z.string().trim().min(1).max(120).nullable(),
  publishedYear: z.number().int().nullable(),
  synopsis: z.string().trim().min(1).max(AUTOFILL_SYNOPSIS_MAX).nullable(),
  genres: z.array(GenreSlug).max(GENRES_PER_BOOK_MAX),
  yearCheck: z.number().int().nullable(),
  confidence: z.strictObject({
    author: Confidence,
    publishedYear: Confidence,
    synopsis: Confidence,
    genres: Confidence,
    yearCheck: Confidence,
  }),
});
export type AutofillModelOutput = z.infer<typeof AutofillModelOutput>;

export const Citation = z.object({ bookId: Id, title: z.string() });
export type Citation = z.infer<typeof Citation>;

export const ChatToolCall = z.object({
  name: z.string(),
  input: z.unknown(),
  ok: z.boolean(),
});

export const ChatMessage = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
    citations: z.array(Citation).optional(),
    toolCalls: z.array(ChatToolCall).optional(),
  })
  .meta({ id: 'ChatMessage' });
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatLocale = z.enum(['en', 'fr']);
export type ChatLocale = z.infer<typeof ChatLocale>;

export const CHAT_HISTORY_MAX = 20;

export const ChatContext = z.strictObject({ bookId: Id }).meta({ id: 'ChatContext' });
export type ChatContext = z.infer<typeof ChatContext>;

export const ChatBody = z
  .strictObject({
    messages: z
      .array(ChatMessage.pick({ role: true, content: true }))
      .min(1)
      .max(CHAT_HISTORY_MAX),
    locale: ChatLocale.default(ChatLocale.enum.en),
    context: ChatContext.optional(),
  })
  .meta({ id: 'ChatBody' });
export type ChatBody = z.infer<typeof ChatBody>;

export const PendingAction = z
  .object({
    id: z.string(),
    tool: z.string(),
    input: z.unknown(),
    summary: z.string(),
    token: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'PendingAction' });
export type PendingAction = z.infer<typeof PendingAction>;

export const ChatResponse = z
  .object({
    message: ChatMessage,
    pendingAction: PendingAction.optional(),
    runIds: z.array(Id),
  })
  .meta({ id: 'ChatResponse' });
export type ChatResponse = z.infer<typeof ChatResponse>;

export const ConfirmActionBody = z
  .strictObject({ token: z.string().min(1).max(4000) })
  .meta({ id: 'ConfirmActionBody' });
export type ConfirmActionBody = z.infer<typeof ConfirmActionBody>;

export const PendingActionStatus = z.enum(['confirmed', 'cancelled']);
export type PendingActionStatus = z.infer<typeof PendingActionStatus>;

export const ConfirmActionResponse = z
  .object({
    status: PendingActionStatus,
    actionId: z.string(),
    tool: z.string(),
    summary: z.string(),
    result: z.unknown().optional(),
    message: ChatMessage,
  })
  .meta({ id: 'ConfirmActionResponse' });
export type ConfirmActionResponse = z.infer<typeof ConfirmActionResponse>;

export const ToolName = z.enum([
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
export type ToolName = z.infer<typeof ToolName>;

export const SearchBooksInput = z.object({
  q: z.string().trim().min(2).max(200).optional(),
  genre: z.array(GenreSlug).max(5).optional(),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  language: z.array(BookLanguage).min(1).max(BOOK_LANGUAGES_PER_QUERY_MAX).optional(),
  sort: z.enum(['newest', 'title', 'rating']).optional(),
  limit: z.number().int().min(1).max(10).default(6),
});
export type SearchBooksInput = z.infer<typeof SearchBooksInput>;
export const SearchBooksOutput = z.array(BookSummary);
export type SearchBooksOutput = z.infer<typeof SearchBooksOutput>;

export const GetBookInput = z.object({ bookId: Id });
export type GetBookInput = z.infer<typeof GetBookInput>;
export const GetBookOutput = Book;
export type GetBookOutput = z.infer<typeof GetBookOutput>;

export const ListGenresInput = z.object({});
export type ListGenresInput = z.infer<typeof ListGenresInput>;
export const ListGenresOutput = z.array(Genre);
export type ListGenresOutput = z.infer<typeof ListGenresOutput>;

export const AddToReadingListInput = AddToShelfBody;
export type AddToReadingListInput = z.infer<typeof AddToReadingListInput>;
export const AddToReadingListOutput = ReadingListEntry;
export type AddToReadingListOutput = z.infer<typeof AddToReadingListOutput>;

export const UpdateReadingStateInput = z.object({ bookId: Id, state: ReadingState });
export type UpdateReadingStateInput = z.infer<typeof UpdateReadingStateInput>;
export const UpdateReadingStateOutput = ReadingListEntry;
export type UpdateReadingStateOutput = z.infer<typeof UpdateReadingStateOutput>;

export const RemoveFromReadingListInput = z.strictObject({ bookId: Id });
export type RemoveFromReadingListInput = z.infer<typeof RemoveFromReadingListInput>;
export const RemoveFromReadingListOutput = z.object({ bookId: Id, removed: z.literal(true) });
export type RemoveFromReadingListOutput = z.infer<typeof RemoveFromReadingListOutput>;

export const GetReadingListInput = z.object({});
export type GetReadingListInput = z.infer<typeof GetReadingListInput>;
export const GetReadingListOutput = z.array(ReadingListEntry);
export type GetReadingListOutput = z.infer<typeof GetReadingListOutput>;

export const ChangeReadingListInput = ReadingListBatchBody;
export type ChangeReadingListInput = z.infer<typeof ChangeReadingListInput>;
export const ChangeReadingListOutput = ReadingListBatchResponse;
export type ChangeReadingListOutput = z.infer<typeof ChangeReadingListOutput>;

export const DraftBookInput = AutofillBody;
export type DraftBookInput = z.infer<typeof DraftBookInput>;
export const DraftBookOutput = BookDraft;
export type DraftBookOutput = z.infer<typeof DraftBookOutput>;
