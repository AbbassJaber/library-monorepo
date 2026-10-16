import { Role } from '@library/contracts';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { loadNamespaces } from '@/i18n';
import type { Namespace } from '@/i18n';
import { RedirectIfAuthed, RequireAuth, RequireRole } from './guards';
import { routes } from './routes';

const NotFound = () => {
  const { t } = useTranslation();
  return (
    <div className="py-16 text-center">
      <h1 className="text-h1">{t('notFound.title')}</h1>
      <p className="mt-3 text-fg-2">{t('notFound.body')}</p>
    </div>
  );
};

const page = <M extends object>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType,
  ...namespaces: Namespace[]
) => {
  return async () => {
    const [module] = await Promise.all([load(), loadNamespaces(...namespaces)]);
    return { Component: pick(module) };
  };
};

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    HydrateFallback: () => null,
    children: [
      {
        index: true,
        lazy: page(
          () => import('@/features/home/HomePage'),
          m => m.HomePage,
          'home',
          'catalog',
          'shelf'
        ),
      },
      {
        Component: RedirectIfAuthed,
        children: [
          {
            path: routes.login,
            lazy: page(
              () => import('@/features/auth/LoginPage'),
              m => m.LoginPage,
              'auth'
            ),
          },
          {
            path: routes.register,
            lazy: page(
              () => import('@/features/auth/RegisterPage'),
              m => m.RegisterPage,
              'auth'
            ),
          },
        ],
      },
      {
        Component: RequireAuth,
        children: [
          {
            path: routes.catalog,
            lazy: page(
              () => import('@/features/catalog/CatalogPage'),
              m => m.CatalogPage,
              'catalog'
            ),
          },
          {
            path: '/books/:id',
            lazy: page(
              () => import('@/features/books/BookDetailPage'),
              m => m.BookDetailPage,
              'books',
              'shelf',
              'catalog'
            ),
          },
          {
            path: routes.shelf,
            lazy: page(
              () => import('@/features/shelf/ShelfPage'),
              m => m.ShelfPage,
              'shelf',
              'catalog'
            ),
          },
          {
            path: routes.favorites,
            lazy: page(
              () => import('@/features/favorites/FavoriteGenresPage'),
              m => m.FavoriteGenresPage,
              'favorites'
            ),
          },
          {
            element: <RequireRole requiredRole={Role.enum.LIBRARIAN} />,
            children: [
              {
                path: routes.librarian.books,
                lazy: page(
                  () => import('@/features/librarian/LibrarianBooksPage'),
                  m => m.LibrarianBooksPage,
                  'librarian',
                  'catalog',
                  'books'
                ),
              },
              {
                path: routes.librarian.newBook,
                lazy: page(
                  () => import('@/features/librarian/BookFormPage'),
                  m => m.BookFormPage,
                  'librarian'
                ),
              },
              {
                path: '/librarian/books/:id/edit',
                lazy: page(
                  () => import('@/features/librarian/BookFormPage'),
                  m => m.BookFormPage,
                  'librarian'
                ),
              },
              {
                path: routes.librarian.activity,
                lazy: page(
                  () => import('@/features/librarian/ActivityPage'),
                  m => m.ActivityPage,
                  'librarian',
                  'catalog'
                ),
              },
              {
                path: routes.librarian.genres,
                lazy: page(
                  () => import('@/features/librarian/GenresPage'),
                  m => m.GenresPage,
                  'librarian'
                ),
              },
            ],
          },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
]);
