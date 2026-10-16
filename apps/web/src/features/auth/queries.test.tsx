import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { useLogout, useMe } from './queries';

const Who = () => {
  const me = useMe();
  return <p>{me.data ? `signed in as ${me.data.displayName}` : 'signed out'}</p>;
};
const LogoutButton = () => {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => logout.mutate()}>
      Log out
    </button>
  );
};

describe('useLogout', () => {
  it('signs out every mounted useMe, not only the component that logged out', async () => {
    renderWithProviders(
      <>
        <Who />
        <LogoutButton />
      </>
    );
    expect(await screen.findByText('signed in as Demo Reader')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
  });
});
