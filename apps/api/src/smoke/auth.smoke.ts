import { describe, expect, it } from 'vitest';
import { LEGACY_TEST_ACTOR_HEADER } from '../config/constants.js';
import { DEMO, RUN_ID, cleanup, data, http, login } from './smoke.setup.js';
import { Role } from '@library/contracts';

describe('auth flow (Bearer)', () => {
  it('register → me → refresh → replay refused → logout → refresh refused', async () => {
    const email = `smoke-auth-${RUN_ID}@example.test`;
    const registered = await http<{
      user: { role: string };
      accessToken: string;
      refreshToken: string;
    }>('/auth/register', {
      method: 'POST',
      body: { email, password: DEMO.reader.password, displayName: `Smoke auth ${RUN_ID}` },
    });
    expect(registered.status).toBe(201);
    const session = data(registered);
    expect(session.user.role).toBe('READER');
    cleanup.account({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: { id: 0, email, role: Role.enum.READER },
    });

    const me = await http<{ email: string }>('/auth/me', { token: session.accessToken });
    expect(me.status).toBe(200);
    expect(data(me).email).toBe(email);

    const rotated = await http<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
    expect(rotated.status).toBe(200);
    const replay = await http('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
    expect(replay.status).toBe(401);

    const fresh = await http<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password: DEMO.reader.password },
    });
    const loggedOut = await http('/auth/logout', {
      method: 'POST',
      body: { refreshToken: data(fresh).refreshToken },
    });
    expect(loggedOut.status).toBe(200);
    expect(
      (
        await http('/auth/refresh', {
          method: 'POST',
          body: { refreshToken: data(fresh).refreshToken },
        })
      ).status
    ).toBe(401);
  });

  it('rejects a registration that tries to choose a role', async () => {
    const res = await http('/auth/register', {
      method: 'POST',
      body: {
        email: `smoke-role-${RUN_ID}@example.test`,
        password: DEMO.reader.password,
        displayName: 'x',
        role: 'LIBRARIAN',
      },
    });
    expect(res.status).toBe(400);
  });

  it('demo accounts log in with their seeded roles', async () => {
    expect((await login(DEMO.reader)).user.role).toBe('READER');
    expect((await login(DEMO.librarian)).user.role).toBe('LIBRARIAN');
  });

  it('refuses unauthenticated and wrong-role access', async () => {
    expect((await http('/genres')).status).toBe(401);
    expect((await http('/auth/me', { headers: { [LEGACY_TEST_ACTOR_HEADER]: '2' } })).status).toBe(
      401
    );
    const reader = await login(DEMO.reader);
    expect(
      (await http('/genres', { method: 'POST', body: { name: 'nope' }, token: reader.token }))
        .status
    ).toBe(403);
  });
});
