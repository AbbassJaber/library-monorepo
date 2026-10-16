import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { BookDetailPage } from '@/features/books/BookDetailPage';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { FavoriteGenresPage } from '@/features/favorites/FavoriteGenresPage';
import { HomePage } from '@/features/home/HomePage';
import { BookFormPage } from '@/features/librarian/BookFormPage';
import { GenresPage } from '@/features/librarian/GenresPage';
import { LibrarianBooksPage } from '@/features/librarian/LibrarianBooksPage';
import { ShelfPage } from '@/features/shelf/ShelfPage';
import { setLocale } from '@/i18n';
import { useLocaleSync } from '@/i18n/useLocaleSync';
import { useUiStore } from '@/stores/uiStore';
import { librarian } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { UI_LOCALE } from '@library/domain-config';

describe('pages in French', () => {
  beforeEach(async () => {
    await setLocale(UI_LOCALE.fr);
  });

  it('home', async () => {
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Accueil' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nouveautés' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pour vos étagères' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Demandez au bibliothécaire' })
    ).toBeInTheDocument();
  });

  it('login and register', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Se connecter à Stacks' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mot de passe/)).toBeInTheDocument();
    renderWithProviders(<RegisterPage />);
    expect(screen.getByRole('heading', { name: 'Créer un compte lecteur' })).toBeInTheDocument();
  });

  it('catalog', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
      </Routes>,
      { route: '/catalog' }
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByLabelText('Chercher par titre ou auteur')).toBeInTheDocument();
    expect(await screen.findByRole('feed', { name: 'Livres' })).toBeInTheDocument();
  });

  it('book detail', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/books/:id" element={<BookDetailPage />} />
      </Routes>,
      { route: '/books/3' }
    );
    expect(
      (await screen.findAllByRole('heading', { name: 'Fiche de prêt' })).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Ajouter à ma liste de lecture' })
    ).toBeInTheDocument();
  });

  it('shelf', async () => {
    renderWithProviders(<ShelfPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Liste de lecture' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /En cours/ })).toBeInTheDocument();
  });

  it('favourite genres', async () => {
    renderWithProviders(<FavoriteGenresPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Genres favoris' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer les favoris' })).toBeInTheDocument();
  });

  it('librarian books, book form and genres', async () => {
    server.use(http.get(`${API}/auth/me`, () => ok(librarian)));
    renderWithProviders(<LibrarianBooksPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gérer les livres' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Auteur' })).toBeInTheDocument();

    renderWithProviders(
      <Routes>
        <Route path="/librarian/books/new" element={<BookFormPage />} />
      </Routes>,
      { route: '/librarian/books/new' }
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ajouter un livre' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Résumé/)).toBeInTheDocument();

    renderWithProviders(<GenresPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gérer les genres' })
    ).toBeInTheDocument();
  });

  it('validates forms with Zod messages in French', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/E-mail/), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('adresse e-mail invalide')).toBeInTheDocument();
  });
});

describe('language switcher', () => {
  it('changes the UI language, <html lang> and the persisted preference', async () => {
    const WithLocaleSync = ({ children }: { children: ReactNode }) => {
      useLocaleSync();
      return children;
    };
    renderWithProviders(
      <>
        <Sidebar />
        <TopBar />
      </>,
      { wrapper: node => <WithLocaleSync>{node}</WithLocaleSync> }
    );
    await userEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    expect(screen.getByRole('button', { name: 'Log out', hidden: true })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr');
    expect(await screen.findByRole('link', { name: 'Catalogue' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(useUiStore.getState().locale).toBe('fr');
  });
});

describe('For your shelves', () => {
  it('renders the favourites link with its text in both languages', async () => {
    const { ForYourShelves } = await import('@/features/recommendations/ForYourShelves');
    renderWithProviders(<ForYourShelves />);
    expect(await screen.findByRole('link', { name: 'favorite genres' })).toHaveAttribute(
      'href',
      '/favorites'
    );
    await setLocale(UI_LOCALE.fr);
    expect(await screen.findByRole('link', { name: 'genres favoris' })).toBeInTheDocument();
  });
});
