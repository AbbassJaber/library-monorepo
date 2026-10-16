import { AiMeta, apiPaths, ApiErrorCode } from '@library/contracts';
import type {
  AiStatus,
  AutofillBody,
  BookDraft,
  HybridSearchQuery,
  HybridSearchResponse,
  ParseSearchBody,
  ParsedSearch,
  SimilarBooksResponse,
} from '@library/contracts';
import { api, isApiError } from '@/lib/api';
import type { Envelope } from '@/lib/api';

export const aiMetaOf = (envelope: Envelope<unknown>): AiMeta | null => {
  const parsed = AiMeta.safeParse((envelope.meta as { ai?: unknown } | undefined)?.ai);
  return parsed.success ? parsed.data : null;
};

export const fetchAiStatus = (signal?: AbortSignal): Promise<AiStatus> =>
  api.get<AiStatus>(apiPaths.ai.status, signal).then(r => r.data);

export const isAiUnavailable = (error: unknown): boolean =>
  isApiError(error, ApiErrorCode.enum.AI_UNAVAILABLE);

export const parseSearch = (text: string) =>
  api.post<ParsedSearch>(apiPaths.ai.parseSearch, { text } satisfies ParseSearchBody);

export interface AutofillMeta {
  ai: AiMeta | null;
  lookupHit: boolean;
  aiUnavailable: boolean;
}

export const autofillBook = async (
  body: AutofillBody
): Promise<{ draft: BookDraft; meta: AutofillMeta }> => {
  const envelope = await api.post<BookDraft>(apiPaths.ai.autofill, body);
  const meta = (envelope.meta ?? {}) as Partial<AutofillMeta>;
  return {
    draft: envelope.data,
    meta: {
      ai: aiMetaOf(envelope),
      lookupHit: meta.lookupHit === true,
      aiUnavailable: meta.aiUnavailable === true,
    },
  };
};

export const hybridSearch = (query: HybridSearchQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
  if (query.genre) params.set('genre', query.genre);
  return api.get<HybridSearchResponse>(`${apiPaths.ai.search}?${params.toString()}`, signal);
};

export const fetchSimilarBooks = (bookId: number, signal?: AbortSignal) =>
  api.get<SimilarBooksResponse>(apiPaths.books.similar(bookId), signal).then(r => r.data);
