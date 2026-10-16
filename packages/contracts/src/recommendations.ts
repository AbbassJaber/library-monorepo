import { z } from 'zod';
import { BookSummary } from './books.js';
import { Id } from './common.js';
import { GenreRef } from './genres.js';
import { ChatLocale } from './ai.js';

export const FOR_YOUR_SHELVES_MAX = 6;

export const ForYourShelvesItem = z
  .object({
    book: BookSummary,
    matchedGenres: z.array(GenreRef).min(1),
  })
  .meta({ id: 'ForYourShelvesItem' });
export type ForYourShelvesItem = z.infer<typeof ForYourShelvesItem>;

export const ForYourShelvesResponse = z.array(ForYourShelvesItem).max(FOR_YOUR_SHELVES_MAX);
export type ForYourShelvesResponse = z.infer<typeof ForYourShelvesResponse>;

export const RECOMMEND_EXPLANATION_MAX = 300;
export const RECOMMEND_CITED_MAX = 3;

export const ExplainedRecommendation = z
  .object({
    book: BookSummary,
    explanation: z.string().min(1).max(600),
    citedEntryIds: z.array(Id).min(1),
    citedBooks: z.array(z.object({ bookId: Id, title: z.string() })).min(1),
  })
  .meta({ id: 'ExplainedRecommendation' });
export type ExplainedRecommendation = z.infer<typeof ExplainedRecommendation>;

export const ExplainedRecommendationsResponse = z
  .array(ExplainedRecommendation)
  .max(FOR_YOUR_SHELVES_MAX);
export type ExplainedRecommendationsResponse = z.infer<typeof ExplainedRecommendationsResponse>;

export const RecommendModelOutput = z.strictObject({
  recommendations: z
    .array(
      z.strictObject({
        bookId: Id,
        explanation: z.string().min(1).max(RECOMMEND_EXPLANATION_MAX),
        citedEntryIds: z.array(Id).min(1).max(RECOMMEND_CITED_MAX),
      })
    )
    .max(FOR_YOUR_SHELVES_MAX),
});
export type RecommendModelOutput = z.infer<typeof RecommendModelOutput>;

export const ExplainedRecommendationsQuery = z.object({
  locale: z.enum(['en', 'fr']).default(ChatLocale.enum.en),
});
export type ExplainedRecommendationsQuery = z.infer<typeof ExplainedRecommendationsQuery>;
