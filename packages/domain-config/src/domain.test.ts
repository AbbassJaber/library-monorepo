import { describe, expect, it } from 'vitest';
import { books } from './books/index.js';
import { movies } from './movies/index.js';
import { domain } from './index.js';
import { UI_LOCALES } from './types.js';
import type { DomainConfig, UiLocale } from './types.js';

const domains: DomainConfig[] = [books, movies];

describe('active domain', () => {
  it('is the books domain', () => {
    expect(domain.key).toBe('books');
    expect(domain.labels.en.item).toBe('Book');
    expect(domain.labels.en.creator).toBe('Author');
    expect(domain.labels.fr.item).toBe('Livre');
  });
});

describe.each(domains)('domain "$key"', config => {
  it('has twelve genres with unique lowercase slugs', () => {
    expect(config.genres).toHaveLength(12);
    const slugs = config.genres.map(genre => genre.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('gives every genre at least one alias in English, Arabic and French', () => {
    for (const genre of config.genres) {
      expect(genre.aliases.en.length, genre.slug).toBeGreaterThan(0);
      expect(genre.aliases.ar.length, genre.slug).toBeGreaterThan(0);
      expect(genre.aliases.fr.length, genre.slug).toBeGreaterThan(0);
    }
  });

  it('labels every reading state in every UI language', () => {
    for (const locale of UI_LOCALES) {
      expect(Object.keys(config.labels[locale].states).sort()).toEqual([
        'FINISHED',
        'READING',
        'WANT_TO_READ',
      ]);
    }
  });

  it('has the same label keys in every UI language', () => {
    const keys = (locale: UiLocale) => Object.keys(config.labels[locale]).sort();
    for (const locale of UI_LOCALES) expect(keys(locale)).toEqual(keys('en'));
  });

  it('normalises and validates the external id', () => {
    const { externalId } = config.fields;
    const normalised = externalId.normalize(externalId.example);
    expect(externalId.pattern.test(normalised)).toBe(true);
  });

  it('describes an item as plain text containing its title and creator', () => {
    const text = config.prompts.describeItem({
      title: 'Sample',
      creator: 'Someone',
      year: 1999,
      summary: 'A summary.',
      genres: ['x'],
    });
    expect(text).toContain('Sample');
    expect(text).toContain('Someone');
  });
});

describe('books genre aliases', () => {
  it('map common Arabic and French words to the expected slugs', () => {
    const find = (word: string) =>
      books.genres.find(genre =>
        (['en', 'ar', 'fr'] as const).some(lang => genre.aliases[lang].includes(word))
      )?.slug;
    expect(find('خيال علمي')).toBe('science-fiction');
    expect(find('policier')).toBe('mystery');
    expect(find('شعر')).toBe('poetry');
    expect(find('jeunesse')).toBe('children');
  });
});
