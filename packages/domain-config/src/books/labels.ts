import type { DomainLabels, UiLocale } from '../types.js';

const en: DomainLabels = {
  item: 'Book',
  items: 'Books',
  creator: 'Author',
  year: 'Published',
  summary: 'Synopsis',
  externalId: 'ISBN',
  genre: 'Genre',
  genres: 'Genres',
  shelf: 'Reading list',
  states: {
    WANT_TO_READ: 'Want to read',
    READING: 'Reading',
    FINISHED: 'Finished',
  },
  forYourShelves: 'For your shelves',
  similar: 'Books like this',
  catalog: 'Catalog',
  favoriteGenres: 'Favorite genres',
  addToShelf: 'Add to reading list',
  removeFromShelf: 'Remove from reading list',
  archivedNotice: 'Archived / unavailable',
  newest: 'New in the catalog',
};

const fr: DomainLabels = {
  item: 'Livre',
  items: 'Livres',
  creator: 'Auteur',
  year: 'Publication',
  summary: 'Résumé',
  externalId: 'ISBN',
  genre: 'Genre',
  genres: 'Genres',
  shelf: 'Liste de lecture',
  states: {
    WANT_TO_READ: 'À lire',
    READING: 'En cours',
    FINISHED: 'Terminé',
  },
  forYourShelves: 'Pour vos étagères',
  similar: 'Livres semblables',
  catalog: 'Catalogue',
  favoriteGenres: 'Genres favoris',
  addToShelf: 'Ajouter à ma liste de lecture',
  removeFromShelf: 'Retirer de ma liste de lecture',
  archivedNotice: 'Archivé / indisponible',
  newest: 'Nouveautés',
};

export const labels: Record<UiLocale, DomainLabels> = { en, fr };
