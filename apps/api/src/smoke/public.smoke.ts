import { HEADERS } from '@library/contracts';
import { describe, expect, it } from 'vitest';
import { BASE_URL, data, http } from './smoke.setup.js';

describe('public surface', () => {
  it('answers liveness and readiness', async () => {
    expect((await http(`${BASE_URL}/health`)).status).toBe(200);
    const ready = await http<{ status: string; database: string; embeddings: string }>(
      `${BASE_URL}/ready`
    );
    expect(ready.status).toBe(200);
    expect(data(ready)).toEqual({ status: 'ready', database: 'up', embeddings: 'current' });
  });

  it('serves the OpenAPI document and Swagger UI', async () => {
    const doc = await fetch(`${BASE_URL}/api/docs.json`).then(
      r => r.json() as Promise<{ openapi: string; paths: Record<string, unknown> }>
    );
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/v1/books', '/api/v1/auth/login', '/api/v1/me/reading-list'])
    );
    expect((await fetch(`${BASE_URL}/api/docs/`)).status).toBe(200);
  });

  it('shows exactly six newest active books without authentication', async () => {
    const res = await http<Array<{ archivedAt: string | null }>>('/books/newest');
    expect(res.status).toBe(200);
    expect(data(res)).toHaveLength(6);
    expect(data(res).every(book => book.archivedAt === null)).toBe(true);
  });

  it('returns the error envelope with a request id for unknown routes', async () => {
    const res = await http('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.headers.get(HEADERS.requestId)).toBeTruthy();
  });
});
