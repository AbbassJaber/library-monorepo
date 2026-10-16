import { describe, expect, it } from 'vitest';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';

describe('readiness against the real database', () => {
  it('answers /ready with 200 when the database is reachable', async () => {
    const res = await (await api().anonymous()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', database: 'up', embeddings: 'not-checked' });
  });

  it('starts every test from an empty database', async () => {
    expect(await testPrisma().user.count()).toBe(0);
    expect(await testPrisma().book.count()).toBe(0);
  });
});
