import type { DomainPrompts } from '../types.js';

export const prompts: DomainPrompts = {
  vocabulary:
    'The catalog is a public library of books. Each item has a title, an author, a publication year, ' +
    'a short synopsis, a rating from 0 to 5 and one to five genres from a fixed list. Readers keep a ' +
    'reading list with the states "want to read", "reading" and "finished", and choose up to five ' +
    'favourite genres.',
  searchHints:
    'People search by title or author (often with typos), by genre words in English, Arabic or French, ' +
    'by decade or year range ("from the 90s", "before 1950", "années 80", "التسعينات"), and by how to ' +
    'sort ("best rated", "newest", "alphabetical"). Anything that is not a genre, a year or a sort ' +
    'belongs in the free-text query.',
  describeItem: item =>
    [
      `Title: ${item.title}`,
      `Author: ${item.creator}`,
      item.year === null ? null : `Published: ${item.year}`,
      item.genres.length > 0 ? `Genres: ${item.genres.join(', ')}` : null,
      `Synopsis: ${item.summary}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
};
