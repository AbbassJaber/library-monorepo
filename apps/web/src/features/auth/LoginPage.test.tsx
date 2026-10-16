import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { RedirectIfAuthed } from '@/app/guards';
import { qk } from '@/lib/queryKeys';
import { reader } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('validates with the contract before sending anything', async () => {
    let sent = 0;
    server.use(
      http.post(`${API}/auth/login`, () => {
        sent += 1;
        return ok({ user: reader });
      })
    );
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(sent).toBe(0);
  });

  it('returns to the page the reader was sent away from, through the RedirectIfAuthed layout', async () => {
    server.use(http.get(`${API}/auth/me`, () => error(401, 'UNAUTHENTICATED')));
    renderWithProviders(
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route path="/shelf" element={<h1>Shelf page</h1>} />
        <Route path="/catalog" element={<h1>Catalog page</h1>} />
      </Routes>,
      { route: { pathname: '/login', state: { from: '/shelf' } } }
    );
    await userEvent.type(await screen.findByLabelText(/email/i), 'reader@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Shelf page')).toBeInTheDocument();
  });

  it('logs in, stores the session in the cache and navigates to the catalog', async () => {
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/catalog" element={<h1>Catalog page</h1>} />
      </Routes>,
      { route: '/login' }
    );
    await userEvent.type(screen.getByLabelText(/email/i), 'reader@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Catalog page')).toBeInTheDocument();
    expect(queryClient.getQueryData(qk.auth.me)).toEqual(reader);
  });

  it('shows the server message for wrong credentials', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        error(401, 'UNAUTHENTICATED', 'Invalid email or password')
      )
    );
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'reader@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password')
    );
  });
});
