export const API_ROOT = '/api';

export const API_VERSIONS = { v1: 'v1' } as const;
export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

export const apiPrefix = (version: ApiVersion) => `${API_ROOT}/${version}` as const;

export const API_PREFIX = apiPrefix(API_VERSIONS.v1);

export const API_RESOURCES = {
  auth: '/auth',
  me: '/me',
  books: '/books',
  genres: '/genres',
  readingList: '/me/reading-list',
  favoriteGenres: '/me/favorite-genres',
  recommendations: '/me/recommendations',
  auditLogs: '/audit-logs',
  ai: '/ai',
} as const;

export const SERVICE_PATHS = {
  health: '/health',
  ready: '/ready',
  docs: '/api/docs',
  docsJson: '/api/docs.json',
} as const;

export const apiPaths = {
  auth: {
    register: `${API_RESOURCES.auth}/register`,
    login: `${API_RESOURCES.auth}/login`,
    refresh: `${API_RESOURCES.auth}/refresh`,
    logout: `${API_RESOURCES.auth}/logout`,
    me: `${API_RESOURCES.auth}/me`,
  },
  me: API_RESOURCES.me,
  books: {
    list: API_RESOURCES.books,
    newest: `${API_RESOURCES.books}/newest`,
    detail: (id: number | string) => `${API_RESOURCES.books}/${id}`,
    archive: (id: number | string) => `${API_RESOURCES.books}/${id}/archive`,
    restore: (id: number | string) => `${API_RESOURCES.books}/${id}/restore`,
    similar: (id: number | string) => `${API_RESOURCES.books}/${id}/similar`,
  },
  genres: {
    list: API_RESOURCES.genres,
    detail: (id: number | string) => `${API_RESOURCES.genres}/${id}`,
    archive: (id: number | string) => `${API_RESOURCES.genres}/${id}/archive`,
    restore: (id: number | string) => `${API_RESOURCES.genres}/${id}/restore`,
  },
  readingList: {
    list: API_RESOURCES.readingList,
    entry: (bookId: number | string) => `${API_RESOURCES.readingList}/${bookId}`,
    batch: `${API_RESOURCES.readingList}/batch`,
  },
  favoriteGenres: API_RESOURCES.favoriteGenres,
  recommendations: API_RESOURCES.recommendations,
  auditLogs: API_RESOURCES.auditLogs,
  ai: {
    status: `${API_RESOURCES.ai}/status`,
    runs: `${API_RESOURCES.ai}/runs`,
    parseSearch: `${API_RESOURCES.ai}/search/parse`,
    autofill: `${API_RESOURCES.ai}/books/autofill`,
    search: `${API_RESOURCES.ai}/search`,
    chat: `${API_RESOURCES.ai}/chat`,
    recommendations: `${API_RESOURCES.ai}/recommendations`,
    confirmAction: `${API_RESOURCES.ai}/actions/confirm`,
    cancelAction: `${API_RESOURCES.ai}/actions/cancel`,
    voice: `${API_RESOURCES.ai}/voice`,
  },
} as const;

export const AUDIT_ACTIONS = {
  bookCreate: 'book.create',
  bookUpdate: 'book.update',
  bookArchive: 'book.archive',
  bookRestore: 'book.restore',
  genreCreate: 'genre.create',
  genreRename: 'genre.rename',
  genreArchive: 'genre.archive',
  genreRestore: 'genre.restore',
  shelfAdd: 'shelf.add',
  shelfUpdate: 'shelf.update',
  shelfRemove: 'shelf.remove',
  favoritesSet: 'favorites.set',
  userRegister: 'user.register',
  userDisable: 'user.disable',
  seedRun: 'seed.run',
} as const;
export type AuditActionValue = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const VALIDATION_CODES = {
  isbnInvalid: 'isbn.invalid',
  yearFuture: 'year.future',
  ratingDecimals: 'rating.decimals',
  yearRange: 'query.yearRange',
  genreSlug: 'genre.slug',
  favoritesDuplicate: 'favorites.duplicate',
  batchDuplicate: 'batch.duplicate',
  autofillIsbnOrTitle: 'autofill.isbnOrTitle',
} as const;
export type ValidationCode = (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];

export const HEADERS = {
  requestId: 'x-request-id',
  authorization: 'authorization',
  origin: 'origin',
} as const;
