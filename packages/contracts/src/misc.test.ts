import { describe, expect, it } from 'vitest';
import { AuditAction, AuditQuery } from './audit.js';
import { AUDIT_ACTIONS, API_PREFIX, API_VERSIONS, apiPaths, apiPrefix } from './constants.js';
import * as contracts from './index.js';
import { componentIds } from './openapi-meta.js';
import {
  ExplainedRecommendation,
  RecommendModelOutput,
  ForYourShelvesResponse,
} from './recommendations.js';
import { AddToShelfBody, UpdateReadingStateBody } from './shelf.js';

describe('audit', () => {
  it('derives the action enum from AUDIT_ACTIONS', () => {
    expect(AuditAction.options.sort()).toEqual(Object.values(AUDIT_ACTIONS).sort());
    expect(AuditAction.safeParse('not-an-action').success).toBe(false);
  });

  it('treats an empty entityType filter as absent', () => {
    expect(AuditQuery.parse({ entityType: '' })).toMatchObject({ page: 1, pageSize: 24 });
    expect(AuditQuery.parse({ entityType: 'genre' }).entityType).toEqual(['genre']);
    expect(AuditQuery.parse({ entityType: 'book,genre' }).entityType).toEqual(['book', 'genre']);
    expect(AuditQuery.parse({ entityType: ['book', 'genre'] }).entityType).toEqual([
      'book',
      'genre',
    ]);
    expect(AuditQuery.safeParse({ entityType: 'planet' }).success).toBe(false);
  });
});

describe('shelf', () => {
  it('defaults a new entry to WANT_TO_READ and rejects unknown keys', () => {
    expect(AddToShelfBody.parse({ bookId: 4 })).toEqual({ bookId: 4, state: 'WANT_TO_READ' });
    expect(AddToShelfBody.safeParse({ bookId: 4, note: 'x' }).success).toBe(false);
    expect(UpdateReadingStateBody.safeParse({ state: 'FINISHED' }).success).toBe(true);
  });
});

describe('recommendations', () => {
  const book = {
    id: 1,
    title: 'T',
    author: 'A',
    publishedYear: 2000,
    rating: 4,
    coverUrl: null,
    language: 'en',
    genres: [{ id: 1, name: 'Fantasy', slug: 'fantasy' }],
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('caps "For your shelves" at six and needs a matched genre', () => {
    const item = { book, matchedGenres: [{ id: 1, name: 'Fantasy', slug: 'fantasy' }] };
    expect(ForYourShelvesResponse.safeParse(Array.from({ length: 7 }, () => item)).success).toBe(
      false
    );
    expect(ForYourShelvesResponse.safeParse([{ book, matchedGenres: [] }]).success).toBe(false);
  });

  it('an explained recommendation must cite at least one shelf entry, with its book', () => {
    const cited = [{ bookId: 1, title: 'The Hobbit' }];
    expect(
      ExplainedRecommendation.safeParse({
        book,
        explanation: 'Because',
        citedEntryIds: [],
        citedBooks: cited,
      }).success
    ).toBe(false);
    expect(
      ExplainedRecommendation.safeParse({
        book,
        explanation: 'Because',
        citedEntryIds: [9],
        citedBooks: cited,
      }).success
    ).toBe(true);
    expect(
      ExplainedRecommendation.safeParse({
        book,
        explanation: 'Because',
        citedEntryIds: [9],
        citedBooks: [],
      }).success
    ).toBe(false);
  });

  it('the model output is strict and capped: six picks, three citations, 300 characters', () => {
    const pick = { bookId: 2, explanation: 'x', citedEntryIds: [1] };
    expect(RecommendModelOutput.safeParse({ recommendations: [pick] }).success).toBe(true);
    expect(RecommendModelOutput.safeParse({ recommendations: Array(7).fill(pick) }).success).toBe(
      false
    );
    expect(
      RecommendModelOutput.safeParse({
        recommendations: [{ ...pick, citedEntryIds: [1, 2, 3, 4] }],
      }).success
    ).toBe(false);
    expect(
      RecommendModelOutput.safeParse({
        recommendations: [{ ...pick, explanation: 'x'.repeat(301) }],
      }).success
    ).toBe(false);
    expect(
      RecommendModelOutput.safeParse({ recommendations: [{ ...pick, extra: true }] }).success
    ).toBe(false);
  });
});

describe('constants', () => {
  it('builds client paths under the shared prefix', () => {
    expect(API_PREFIX).toBe('/api/v1');
    expect(apiPrefix(API_VERSIONS.v1)).toBe(API_PREFIX);
    expect(apiPaths.books.detail(7)).toBe('/books/7');
    expect(apiPaths.books.archive(7)).toBe('/books/7/archive');
    expect(apiPaths.books.restore(7)).toBe('/books/7/restore');
    expect(apiPaths.genres.detail(2)).toBe('/genres/2');
    expect(apiPaths.genres.archive(2)).toBe('/genres/2/archive');
    expect(apiPaths.genres.restore(2)).toBe('/genres/2/restore');
    expect(apiPaths.readingList.entry(3)).toBe('/me/reading-list/3');
  });
});

describe('package surface', () => {
  it('registers every `.meta({ id })` schema for OpenAPI once the package is imported', () => {
    expect(contracts.Book).toBeDefined();
    const ids = componentIds();
    expect(ids).toEqual(expect.arrayContaining(['Book', 'BookSummary', 'Genre', 'AuthResponse']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
