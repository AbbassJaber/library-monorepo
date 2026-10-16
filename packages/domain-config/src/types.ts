export type ReadingStateKey = 'WANT_TO_READ' | 'READING' | 'FINISHED';
export type AliasLanguage = 'en' | 'ar' | 'fr';
export const CONTENT_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const UI_LOCALE = { en: 'en', fr: 'fr' } as const;
export type UiLocale = (typeof UI_LOCALE)[keyof typeof UI_LOCALE];
export const UI_LOCALES = [UI_LOCALE.en, UI_LOCALE.fr] as const;

export interface DomainLabels {
  item: string;
  items: string;
  creator: string;
  year: string;
  summary: string;
  externalId: string;
  genre: string;
  genres: string;
  shelf: string;
  states: Record<ReadingStateKey, string>;
  forYourShelves: string;
  similar: string;
  catalog: string;
  favoriteGenres: string;
  addToShelf: string;
  removeFromShelf: string;
  archivedNotice: string;
  newest: string;
}

export interface DomainFields {
  creator: { maxLength: number };
  year: { min: number; max: () => number };
  summary: { maxLength: number };
  externalId: {
    pattern: RegExp;
    normalize: (value: string) => string;
    example: string;
  };
}

export interface GenreDefinition {
  name: string;
  slug: string;
  aliases: Record<AliasLanguage, string[]>;
}

export interface ExternalRecord {
  source: string;
  sourceId: string;
  title: string;
  authors: string[];
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
  description: string | null;
  subjects: string[];
}

export interface LookupDeps {
  fetch: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
}

export interface LookupProvider {
  name: string;
  byIsbn(isbn: string, deps: LookupDeps): Promise<ExternalRecord | null>;
  byTitle(title: string, author: string | undefined, deps: LookupDeps): Promise<ExternalRecord[]>;
}

export interface ItemForPrompt {
  title: string;
  creator: string;
  year: number | null;
  summary: string;
  genres: string[];
}

export interface DomainPrompts {
  vocabulary: string;
  searchHints: string;
  describeItem: (item: ItemForPrompt) => string;
}

export interface DomainConfig {
  key: string;
  labels: Record<UiLocale, DomainLabels>;
  fields: DomainFields;
  genres: GenreDefinition[];
  prompts: DomainPrompts;
  lookup: LookupProvider;
  cover: { palette: CoverColors[] };
}

export type CoverColors = readonly [bg: string, text: string, accent: string, stage: string];
