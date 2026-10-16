import { describe, expect, it } from 'vitest';
import { BooksQuery } from '@library/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { api } from '../../test/client.js';
import { testPrisma } from '../../test/db.js';
import { createBook, createGenre, createLibrarian, createReader } from '../../test/factories.js';
import { applySearchSettings, buildSearchSql } from './books.search.js';

const titles = (res: { body: { data: { items: Array<{ title: string }> } } }) =>
  res.body.data.items.map(b => b.title);

describe('GET /api/v1/books — search', () => {
  it('finds "Tolkein" (typo) as Tolkien', async () => {
    const reader = await createReader();
    await createBook({ title: 'The Hobbit', author: 'J. R. R. Tolkien' });
    await createBook({ title: 'Dune', author: 'Frank Herbert' });

    const res = await (await api().as(reader)).get('/api/v1/books?q=Tolkein');

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['The Hobbit']);
    expect(res.body.data.meta).toEqual({ page: 1, pageSize: 24, total: 1, totalPages: 1 });
  });

  it('finds by author and by a partial title, case-insensitively', async () => {
    const reader = await createReader();
    await createBook({ title: 'Dune', author: 'Frank Herbert' });
    await createBook({ title: 'Neuromancer', author: 'William Gibson' });
    const client = await api().as(reader);

    expect(titles(await client.get('/api/v1/books?q=herbert'))).toEqual(['Dune']);
    expect(titles(await client.get('/api/v1/books?q=NEUROM'))).toEqual(['Neuromancer']);
  });

  it('q ordering is by match score when sort is omitted, and by the requested sort otherwise', async () => {
    const reader = await createReader();
    await createBook({
      title: 'A Study of Tolkien',
      author: 'J. R. R. Tolkien',
      createdAt: new Date('2026-02-01'),
    });
    await createBook({
      title: "Tolkein's Ghost",
      author: 'Anonymous',
      createdAt: new Date('2026-01-01'),
    });
    const client = await api().as(reader);

    expect(titles(await client.get('/api/v1/books?q=tolkein'))).toEqual([
      "Tolkein's Ghost",
      'A Study of Tolkien',
    ]);
    expect(titles(await client.get('/api/v1/books?q=tolkein&sort=title'))).toEqual([
      'A Study of Tolkien',
      "Tolkein's Ghost",
    ]);
    expect(titles(await client.get('/api/v1/books?q=tolkein&sort=newest'))).toEqual([
      'A Study of Tolkien',
      "Tolkein's Ghost",
    ]);
  });

  it('filters by genre slug (any of several) and by year range, hiding archived genres', async () => {
    const reader = await createReader();
    const fantasy = await createGenre({ name: 'Fantasy' });
    const scifi = await createGenre({ name: 'Science Fiction' });
    const gone = await createGenre({ name: 'Gone', archivedAt: new Date() });
    await createBook({ title: 'Old Fantasy', genreIds: [fantasy.id], publishedYear: 1937 });
    await createBook({ title: 'New Fantasy', genreIds: [fantasy.id], publishedYear: 2007 });
    await createBook({ title: 'Space', genreIds: [scifi.id], publishedYear: 1965 });
    await createBook({ title: 'Ghost Genre', genreIds: [gone.id], publishedYear: 1990 });
    const client = await api().as(reader);

    expect(titles(await client.get('/api/v1/books?genre=fantasy&sort=title'))).toEqual([
      'New Fantasy',
      'Old Fantasy',
    ]);
    expect(
      titles(await client.get('/api/v1/books?genre=fantasy&genre=science-fiction&sort=title'))
    ).toEqual(['New Fantasy', 'Old Fantasy', 'Space']);
    expect(
      titles(
        await client.get('/api/v1/books?genre=fantasy,science-fiction&yearFrom=1950&yearTo=1970')
      )
    ).toEqual(['Space']);
    expect(titles(await client.get('/api/v1/books?yearFrom=2000'))).toEqual(['New Fantasy']);
    expect(titles(await client.get('/api/v1/books?genre=gone'))).toEqual([]);
  });

  it('sorts by title, newest and rating with a stable id tiebreak', async () => {
    const reader = await createReader();
    await createBook({ title: 'Beta', rating: 3.5, createdAt: new Date('2026-01-01') });
    await createBook({ title: 'Alpha', rating: 4.5, createdAt: new Date('2026-01-02') });
    await createBook({ title: 'Gamma', rating: 4.5, createdAt: new Date('2026-01-03') });
    const client = await api().as(reader);

    expect(titles(await client.get('/api/v1/books?sort=title'))).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(titles(await client.get('/api/v1/books?sort=newest'))).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
    expect(titles(await client.get('/api/v1/books'))).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(titles(await client.get('/api/v1/books?sort=rating'))).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
  });

  it('paginates with keep-able meta and an empty page beyond the end', async () => {
    const reader = await createReader();
    for (let i = 0; i < 5; i++)
      await createBook({ title: `Book ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1 + i)) });
    const client = await api().as(reader);

    const page2 = await client.get('/api/v1/books?pageSize=2&page=2');
    expect(titles(page2)).toEqual(['Book 2', 'Book 1']);
    expect(page2.body.data.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });

    const beyond = await client.get('/api/v1/books?pageSize=2&page=9');
    expect(beyond.status).toBe(200);
    expect(titles(beyond)).toEqual([]);
    expect(beyond.body.data.meta).toEqual({ page: 9, pageSize: 2, total: 5, totalPages: 3 });
  });

  it('excludes archived books for readers', async () => {
    const reader = await createReader();
    await createBook({ title: 'Live' });
    await createBook({ title: 'Archived', archivedAt: new Date() });
    expect(titles(await (await api().as(reader)).get('/api/v1/books'))).toEqual(['Live']);
  });

  it('readers cannot request archived status; librarians can', async () => {
    const reader = await api().as(await createReader());
    const librarian = await api().as(await createLibrarian());
    await createBook({ title: 'Live' });
    await createBook({ title: 'Archived', archivedAt: new Date() });

    const refused = await reader.get('/api/v1/books?status=archived');
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
    expect(titles(await librarian.get('/api/v1/books?status=archived'))).toEqual(['Archived']);
    expect(titles(await librarian.get('/api/v1/books?status=all&sort=title'))).toEqual([
      'Archived',
      'Live',
    ]);
  });

  it('requires authentication', async () => {
    expect((await (await api().anonymous()).get('/api/v1/books')).status).toBe(401);
  });
});

describe('GET /api/v1/books — invalid input never becomes a 500', () => {
  const issuePaths = (res: { body: { error: { details: { issues: Array<{ path: string }> } } } }) =>
    res.body.error.details.issues.map(issue => issue.path);

  it('caps pageSize at 48', async () => {
    const client = await api().as(await createReader());
    const res = await client.get('/api/v1/books?pageSize=49');
    expect(res.status).toBe(400);
    expect(issuePaths(res)).toContain('query.pageSize');
  });

  it.each([
    ['pageSize=0', 'query.pageSize'],
    ['page=-1', 'query.page'],
    ['yearFrom=2000&yearTo=1990', 'query.yearFrom'],
    ['q=a', 'query.q'],
    [`q=${'a'.repeat(500)}`, 'query.q'],
  ])('%s → 400 VALIDATION_ERROR with a field-level issue', async (queryString, path) => {
    const client = await api().as(await createReader());
    const res = await client.get(`/api/v1/books?${queryString}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(issuePaths(res)).toContain(path);
  });
});

describe('search SQL', () => {
  it('uses the trigram GIN indexes for a q query (EXPLAIN)', async () => {
    const prisma = testPrisma();
    const titles =
      "'The Hobbit','Dune','Pride and Prejudice','Crime and Punishment','Norwegian Wood','Things Fall Apart','Wolf Hall','A Brief History of Time','Le Petit Prince','Les Misérables','زقاق المدق','موسم الهجرة إلى الشمال'";
    const authors =
      "'J. R. R. Tolkien','Frank Herbert','Jane Austen','Fyodor Dostoevsky','Haruki Murakami','Chinua Achebe','Hilary Mantel','Stephen Hawking','Antoine de Saint-Exupéry','Victor Hugo','نجيب محفوظ','الطيب صالح'";
    await prisma.$executeRawUnsafe(`
      INSERT INTO books (title, author, "publishedYear", synopsis, "updatedAt")
      SELECT (ARRAY[${titles}])[1 + g % 12] || ' vol ' || (g / 12), (ARRAY[${authors}])[1 + (g * 7) % 12],
             1900 + (g % 120), 's', now()
      FROM generate_series(1, 3000) AS g`);
    await prisma.$executeRawUnsafe('ANALYZE books');

    const query = BooksQuery.parse({ q: 'tolkein' });
    const plan = await prisma.$transaction(async tx => {
      await applySearchSettings(tx, query);
      const rows = await tx.$queryRaw<Array<{ 'QUERY PLAN': string }>>(
        Prisma.sql`EXPLAIN ${buildSearchSql(query)}`
      );
      return rows.map(row => row['QUERY PLAN']).join('\n');
    });

    expect(plan).toContain('Bitmap Index Scan on books_title_idx');
    expect(plan).toContain('Bitmap Index Scan on books_author_idx');
    expect(plan).not.toContain('Seq Scan on books');
  });
});
