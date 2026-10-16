import type { Resource } from 'i18next';
import enAuth from '@/locales/en/auth.json';
import enBooks from '@/locales/en/books.json';
import enCatalog from '@/locales/en/catalog.json';
import enCommon from '@/locales/en/common.json';
import enFavorites from '@/locales/en/favorites.json';
import enHome from '@/locales/en/home.json';
import enLibrarian from '@/locales/en/librarian.json';
import enShelf from '@/locales/en/shelf.json';
import frAuth from '@/locales/fr/auth.json';
import frBooks from '@/locales/fr/books.json';
import frCatalog from '@/locales/fr/catalog.json';
import frCommon from '@/locales/fr/common.json';
import frFavorites from '@/locales/fr/favorites.json';
import frHome from '@/locales/fr/home.json';
import frLibrarian from '@/locales/fr/librarian.json';
import frShelf from '@/locales/fr/shelf.json';

export const testResources: Resource = {
  en: {
    common: enCommon,
    auth: enAuth,
    home: enHome,
    catalog: enCatalog,
    books: enBooks,
    shelf: enShelf,
    favorites: enFavorites,
    librarian: enLibrarian,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    home: frHome,
    catalog: frCatalog,
    books: frBooks,
    shelf: frShelf,
    favorites: frFavorites,
    librarian: frLibrarian,
  },
};
