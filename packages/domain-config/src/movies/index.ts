import type { DomainConfig, GenreDefinition } from '../types.js';

const genre = (
  name: string,
  slug: string,
  en: string[],
  ar: string[],
  fr: string[]
): GenreDefinition => ({
  name,
  slug,
  aliases: { en, ar, fr },
});

export const movies: DomainConfig = {
  key: 'movies',
  labels: {
    en: {
      item: 'Film',
      items: 'Films',
      creator: 'Director',
      year: 'Released',
      summary: 'Plot summary',
      externalId: 'IMDb id',
      genre: 'Genre',
      genres: 'Genres',
      shelf: 'Watchlist',
      states: { WANT_TO_READ: 'Want to watch', READING: 'Watching', FINISHED: 'Watched' },
      forYourShelves: 'For your watchlist',
      similar: 'Films like this',
      catalog: 'Catalog',
      favoriteGenres: 'Favorite genres',
      addToShelf: 'Add to watchlist',
      removeFromShelf: 'Remove from watchlist',
      archivedNotice: 'Archived / unavailable',
      newest: 'New arrivals',
    },
    fr: {
      item: 'Film',
      items: 'Films',
      creator: 'Réalisateur',
      year: 'Sortie',
      summary: 'Synopsis',
      externalId: 'Identifiant IMDb',
      genre: 'Genre',
      genres: 'Genres',
      shelf: 'À voir',
      states: { WANT_TO_READ: 'À voir', READING: 'En cours', FINISHED: 'Vu' },
      forYourShelves: 'Pour votre liste',
      similar: 'Films semblables',
      catalog: 'Catalogue',
      favoriteGenres: 'Genres favoris',
      addToShelf: 'Ajouter à ma liste',
      removeFromShelf: 'Retirer de ma liste',
      archivedNotice: 'Archivé / indisponible',
      newest: 'Nouveautés',
    },
  },
  fields: {
    creator: { maxLength: 120 },
    year: { min: 1888, max: () => new Date().getFullYear() + 1 },
    summary: { maxLength: 4000 },
    externalId: {
      pattern: /^tt\d{7,8}$/,
      normalize: value => value.trim().toLowerCase(),
      example: 'tt0133093',
    },
  },
  genres: [
    genre('Action', 'action', ['action'], ['أكشن', 'حركة'], ['action']),
    genre('Adventure', 'adventure', ['adventure'], ['مغامرة'], ['aventure']),
    genre('Animation', 'animation', ['animation', 'animated'], ['رسوم متحركة'], ['animation']),
    genre('Comedy', 'comedy', ['comedy', 'funny'], ['كوميديا'], ['comédie']),
    genre('Crime', 'crime', ['crime', 'heist'], ['جريمة'], ['policier']),
    genre('Documentary', 'documentary', ['documentary'], ['وثائقي'], ['documentaire']),
    genre('Drama', 'drama', ['drama'], ['دراما'], ['drame']),
    genre('Horror', 'horror', ['horror', 'scary'], ['رعب'], ['horreur']),
    genre('Romance', 'romance', ['romance', 'romantic'], ['رومانسي'], ['romance']),
    genre(
      'Science Fiction',
      'science-fiction',
      ['science fiction', 'sci-fi'],
      ['خيال علمي'],
      ['science-fiction']
    ),
    genre('Thriller', 'thriller', ['thriller', 'suspense'], ['إثارة'], ['thriller']),
    genre('Western', 'western', ['western', 'cowboy'], ['غرب أمريكي'], ['western']),
  ],
  prompts: {
    vocabulary:
      'The catalog is a film library. Each item has a title, a director, a release year, a plot summary, ' +
      'a rating from 0 to 5 and one to five genres from a fixed list. Viewers keep a watchlist.',
    searchHints:
      'People search by title or director, by genre words, by decade or year range and by how to sort.',
    describeItem: item =>
      [
        `Title: ${item.title}`,
        `Director: ${item.creator}`,
        item.year === null ? null : `Released: ${item.year}`,
        item.genres.length > 0 ? `Genres: ${item.genres.join(', ')}` : null,
        `Plot: ${item.summary}`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
  },
  lookup: {
    name: 'stub',
    byIsbn: async () => null,
    byTitle: async () => [],
  },
  cover: {
    palette: [
      ['#111827', '#FFFFFF', '#F59E0B', '#142347'],
      ['#7F1D1D', '#FFFFFF', '#FCA5A5', '#0F2A35'],
      ['#1E3A8A', '#FFFFFF', '#93C5FD', '#3A1410'],
      ['#065F46', '#FFFFFF', '#6EE7B7', '#2B1538'],
      ['#4C1D95', '#FFFFFF', '#C4B5FD', '#0F2A35'],
      ['#78350F', '#FFFFFF', '#FCD34D', '#142347'],
    ],
  },
};
