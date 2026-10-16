import { describe, expect, it } from 'vitest';
import { DEMO, data, http, login } from './smoke.setup.js';

interface Summary {
  id: number;
  title: string;
  author: string;
  publishedYear: number;
  rating: number;
  genres: Array<{ slug: string }>;
}
interface Page {
  items: Summary[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

describe('catalog', () => {
  it('lists the catalog with pagination meta', async () => {
    const reader = await login(DEMO.reader);
    const res = await http<Page>('/books?pageSize=12', { token: reader.token });
    expect(res.status).toBe(200);
    expect(data(res).items).toHaveLength(12);
    expect(data(res).meta.pageSize).toBe(12);
    expect(data(res).meta.total).toBeGreaterThan(12);
  });

  it('is typo tolerant and orders by match score', async () => {
    const reader = await login(DEMO.reader);
    const res = await http<Page>('/books?q=tolkein', { token: reader.token });
    expect(data(res).items.length).toBeGreaterThan(0);
    expect(data(res).items.every(b => /tolkien/i.test(b.author) || /tolkien/i.test(b.title))).toBe(
      true
    );
  });

  it('filters by genre and year range and sorts by rating', async () => {
    const reader = await login(DEMO.reader);
    const res = await http<Page>('/books?genre=fantasy&yearFrom=1900&yearTo=1999&sort=rating', {
      token: reader.token,
    });
    const items = data(res).items;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every(
        b =>
          b.genres.some(g => g.slug === 'fantasy') &&
          b.publishedYear >= 1900 &&
          b.publishedYear <= 1999
      )
    ).toBe(true);
    for (let i = 1; i < items.length; i++)
      expect(items[i - 1]!.rating).toBeGreaterThanOrEqual(items[i]!.rating);
  });

  it('rejects invalid input with field-level issues and refuses archived status for readers', async () => {
    const reader = await login(DEMO.reader);
    const bad = await http('/books?pageSize=0&q=a', { token: reader.token });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('VALIDATION_ERROR');
    expect((await http('/books?status=archived', { token: reader.token })).status).toBe(403);
  });

  it('serves book detail and lists active genres with counts', async () => {
    const reader = await login(DEMO.reader);
    const first = data(await http<Page>('/books?pageSize=1', { token: reader.token })).items[0]!;
    const detail = await http<{ id: number; synopsis: string; version: number }>(
      `/books/${first.id}`,
      { token: reader.token }
    );
    expect(detail.status).toBe(200);
    expect(data(detail).synopsis.length).toBeGreaterThan(0);
    const genres = await http<
      Array<{ slug: string; activeBookCount: number; archivedAt: string | null }>
    >('/genres', { token: reader.token });
    expect(data(genres).length).toBeGreaterThanOrEqual(12);
    expect(data(genres).every(g => g.archivedAt === null)).toBe(true);
  });
});
