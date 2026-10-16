import { books } from './books/index.js';
import type { DomainConfig } from './types.js';

export * from './types.js';
export { books, bookGenres, openLibrary } from './books/index.js';
export { movies } from './movies/index.js';
export { LOOKUP_SOURCE, OPEN_LIBRARY_COVERS_ORIGIN } from './books/lookup.js';
export type { LookupSource } from './books/lookup.js';

export const domain: DomainConfig = books;
