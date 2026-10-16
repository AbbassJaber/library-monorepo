import type auth from '../locales/en/auth.json';
import type books from '../locales/en/books.json';
import type catalog from '../locales/en/catalog.json';
import type common from '../locales/en/common.json';
import type favorites from '../locales/en/favorites.json';
import type home from '../locales/en/home.json';
import type librarian from '../locales/en/librarian.json';
import type shelf from '../locales/en/shelf.json';

type Resources = {
  common: typeof common;
  auth: typeof auth;
  home: typeof home;
  catalog: typeof catalog;
  books: typeof books;
  shelf: typeof shelf;
  favorites: typeof favorites;
  librarian: typeof librarian;
};

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: Resources;
    returnNull: false;
  }
}
