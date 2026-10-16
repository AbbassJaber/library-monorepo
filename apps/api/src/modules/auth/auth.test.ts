import { AUDIT_ACTIONS, AuditEntityType } from '@library/contracts';
import { COOKIES, LEGACY_TEST_ACTOR_HEADER } from '../../config/constants.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pruneExpiredTokens, hashRefreshToken } from '../../lib/tokens.js';
import { api, createTestApp, TEST_ORIGIN } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createLibrarian, createReader, TEST_PASSWORD } from '../../test/factories.js';

const cookieNames = (res: request.Response): string[] =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.map(c => c.split('=')[0] ?? '') ??
  [];

const register = { email: 'new@test.local', password: 'Password123!', displayName: 'New Reader' };

describe('POST /api/v1/auth/register', () => {
  it('register creates a READER and rejects a role field', async () => {
    const app = await createTestApp();
    const res = await request(app).post('/api/v1/auth/register').send(register);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: 'new@test.local',
      displayName: 'New Reader',
      role: 'READER',
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const withRole = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...register, email: 'x@test.local', role: 'LIBRARIAN' });
    expect(withRole.status).toBe(400);
    expect(withRole.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 409 EMAIL_TAKEN for an existing email, case-insensitively', async () => {
    await createReader().then(u =>
      testPrisma().user.update({ where: { id: u.id }, data: { email: 'taken@test.local' } })
    );
    const res = await request(await createTestApp())
      .post('/api/v1/auth/register')
      .send({ ...register, email: 'Taken@Test.local' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('writes a user.register audit row', async () => {
    await request(await createTestApp())
      .post('/api/v1/auth/register')
      .send(register);
    const row = await testPrisma().auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.userRegister },
    });
    expect(row).toMatchObject({ entityType: AuditEntityType.enum.user, source: 'HTTP' });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('login sets httpOnly cookies and never returns the password hash', async () => {
    const user = await createReader();
    const res = await request(await createTestApp())
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookieNames(res).sort()).toEqual([COOKIES.access, COOKIES.refresh]);
    for (const cookie of cookies) expect(cookie).toMatch(/HttpOnly/i);
    expect(cookies.find(c => c.startsWith(COOKIES.refresh))).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookies.find(c => c.startsWith(COOKIES.access))).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it('login without a browser Origin also returns the access token in the body', async () => {
    const user = await createReader();
    const res = await request(await createTestApp())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('answers 401 for a wrong password or unknown email with the same message', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'nope-nope-nope' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.local', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(cookieNames(wrong)).toEqual([]);
  });
});

describe('authenticate', () => {
  it('a Bearer token authenticates without cookies', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'READER',
    });
  });

  it('a cookie session authenticates browser requests', async () => {
    const user = await createReader();
    const agent = request.agent(await createTestApp());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: TEST_PASSWORD });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.id);
  });

  it('an x-test-actor header is ignored by the running app', async () => {
    const user = await createReader();
    const res = await request(await createTestApp())
      .get('/api/v1/auth/me')
      .set(LEGACY_TEST_ACTOR_HEADER, String(user.id));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered or expired access token', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const token: string = login.body.data.accessToken;
    const tampered = `${token.slice(0, -2)}xx`;
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`)).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt')).status
    ).toBe(401);
  });

  it('a disabled user gets 401 on every authenticated route', async () => {
    const user = await createReader();
    const client = await api().as(user);
    expect((await client.get('/api/v1/auth/me')).status).toBe(200);
    await testPrisma().user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect((await client.get('/api/v1/genres')).status).toBe(401);
  });

  it('readers get 403 on librarian routes and librarians pass requireRole', async () => {
    const reader = await api().as(await createReader());
    const librarian = await api().as(await createLibrarian());
    expect((await reader.post('/api/v1/genres').send({ name: 'Nope' })).status).toBe(403);
    expect((await librarian.post('/api/v1/genres').send({ name: 'Yes' })).status).toBe(201);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('refresh rotates the token and reusing the old one revokes the family', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const first: string = login.body.data.refreshToken;

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    const second: string = rotated.body.data.refreshToken;
    expect(second).not.toBe(first);
    expect(typeof rotated.body.data.accessToken).toBe('string');

    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first });
    expect(replay.status).toBe(401);
    const afterReplay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second });
    expect(afterReplay.status).toBe(401);
    const live = await testPrisma().refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('refreshes from the cookie for browser sessions', async () => {
    const user = await createReader();
    const agent = request.agent(await createTestApp());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: TEST_PASSWORD });
    const res = await agent.post('/api/v1/auth/refresh').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(cookieNames(res).sort()).toEqual([COOKIES.access, COOKIES.refresh]);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('answers 401 without a refresh token', async () => {
    const res = await request(await createTestApp())
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('a refresh token replayed after logout is rejected and its family is revoked', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const refreshToken: string = login.body.data.refreshToken;

    const logout = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    expect(
      await testPrisma().refreshToken.count({ where: { userId: user.id, revokedAt: null } })
    ).toBe(0);
  });

  it('logout without a valid access token still clears cookies', async () => {
    const res = await request(await createTestApp())
      .post('/api/v1/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(c => c.startsWith(`${COOKIES.access}=;`))).toBe(true);
    expect(cookies.some(c => c.startsWith(`${COOKIES.refresh}=;`))).toBe(true);
  });
});

describe('DELETE /api/v1/me', () => {
  it('DELETE /me disables the account and revokes its tokens', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const { accessToken, refreshToken } = login.body.data as {
      accessToken: string;
      refreshToken: string;
    };

    const res = await request(app)
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ disabled: true });

    const row = await testPrisma().user.findUnique({ where: { id: user.id } });
    expect(row?.disabledAt).not.toBeNull();
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`))
        .status
    ).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(
      401
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: TEST_PASSWORD })
      ).status
    ).toBe(401);
  });
});

describe('origin check', () => {
  it('a POST with a foreign Origin is refused', async () => {
    const user = await createReader();
    const agent = request.agent(await createTestApp());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: TEST_PASSWORD });
    const res = await agent.post('/api/v1/auth/refresh').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET requests and Bearer requests are not subject to the origin check', async () => {
    const user = await createReader();
    const app = await createTestApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ refreshToken: login.body.data.refreshToken });
    expect(res.status).toBe(200);
  });
});

describe('pruneExpiredTokens', () => {
  it('expired and revoked refresh tokens are pruned, fresh revoked ones are kept for reuse detection', async () => {
    const user = await createReader();
    const now = new Date('2026-06-01T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    await testPrisma().refreshToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: hashRefreshToken('expired'),
          familyId: 'f1',
          expiresAt: new Date(now.getTime() - 1000),
        },
        {
          userId: user.id,
          tokenHash: hashRefreshToken('old-revoked'),
          familyId: 'f2',
          expiresAt: new Date(now.getTime() + 5 * day),
          revokedAt: new Date(now.getTime() - 2 * day),
        },
        {
          userId: user.id,
          tokenHash: hashRefreshToken('fresh-revoked'),
          familyId: 'f3',
          expiresAt: new Date(now.getTime() + 5 * day),
          revokedAt: new Date(now.getTime() - 60_000),
        },
        {
          userId: user.id,
          tokenHash: hashRefreshToken('live'),
          familyId: 'f4',
          expiresAt: new Date(now.getTime() + 5 * day),
        },
      ],
    });

    const removed = await pruneExpiredTokens(testPrisma(), now);

    expect(removed).toBe(2);
    const left = (await testPrisma().refreshToken.findMany({ orderBy: { id: 'asc' } })).map(
      t => t.familyId
    );
    expect(left).toEqual(['f3', 'f4']);
  });
});
