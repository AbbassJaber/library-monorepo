export const routes = {
  home: '/',
  login: '/login',
  register: '/register',
  catalog: '/catalog',
  book: (id: number) => `/books/${id}`,
  shelf: '/shelf',
  favorites: '/favorites',
  librarian: {
    books: '/librarian/books',
    newBook: '/librarian/books/new',
    editBook: (id: number) => `/librarian/books/${id}/edit`,
    genres: '/librarian/genres',
    activity: '/librarian/activity',
  },
} as const;
