import { describe, expect, it } from 'vitest';
import { openLibrary } from './lookup.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = (handler: (url: string) => Response): typeof fetch =>
  (async (input: string | URL | Request) => handler(String(input))) as typeof fetch;

const duneDoc = {
  key: '/works/OL893415W',
  title: 'Dune',
  author_name: ['Frank Herbert'],
  first_publish_year: 1965,
  isbn: ['0441172717', '9780441172719', '9780340960196'],
  cover_i: 12345,
  subject: ['Science fiction', 'Deserts'],
};

describe('openLibrary.byIsbn', () => {
  it('finds the work by ISBN: first-publication year, the ISBN asked for, the work description', async () => {
    const urls: string[] = [];
    const fetch = fakeFetch(url => {
      urls.push(url);
      if (url.includes('/search.json?')) return jsonResponse({ numFound: 1, docs: [duneDoc] });
      if (url.endsWith('/works/OL893415W.json'))
        return jsonResponse({ description: { type: '/type/text', value: 'Desert planet.' } });
      return jsonResponse({}, 404);
    });

    const record = await openLibrary.byIsbn('978-0-340-96019-6', { fetch });

    expect(urls[0]).toContain('isbn=9780340960196');
    expect(record).toEqual({
      source: 'openlibrary',
      sourceId: '/works/OL893415W',
      title: 'Dune',
      authors: ['Frank Herbert'],
      year: 1965,
      isbn: '9780340960196',
      coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
      description: 'Desert planet.',
      subjects: ['Science fiction', 'Deserts'],
    });
  });

  it('keeps the record when the work has no description or its request fails', async () => {
    const fetch = fakeFetch(url =>
      url.includes('/search.json?') ? jsonResponse({ docs: [duneDoc] }) : jsonResponse({}, 500)
    );
    expect(await openLibrary.byIsbn('9780441172719', { fetch })).toMatchObject({
      title: 'Dune',
      description: null,
    });
  });

  it('refuses a search hit whose work does not list the ISBN (loose index matches)', async () => {
    const fetch = fakeFetch(url =>
      url.includes('/search.json?')
        ? jsonResponse({ docs: [{ ...duneDoc, key: '/works/OL9W', title: 'Something else' }] })
        : jsonResponse({}, 404)
    );
    expect(await openLibrary.byIsbn('9780000000002', { fetch })).toBeNull();
    const dune = fakeFetch(url =>
      url.includes('/search.json?') ? jsonResponse({ docs: [duneDoc] }) : jsonResponse({}, 404)
    );
    expect(await openLibrary.byIsbn('0340960191', { fetch: dune })).toMatchObject({
      title: 'Dune',
    });
    const ranked = fakeFetch(url =>
      url.includes('/search.json?')
        ? jsonResponse({
            docs: [{ key: '/works/OL9W', title: 'Other', isbn: ['9781111111111'] }, duneDoc],
          })
        : jsonResponse({}, 404)
    );
    expect(await openLibrary.byIsbn('9780441172719', { fetch: ranked })).toMatchObject({
      sourceId: '/works/OL893415W',
    });
  });

  it('returns null when the ISBN is unknown or the request fails', async () => {
    expect(
      await openLibrary.byIsbn('9780000000000', {
        fetch: fakeFetch(() => jsonResponse({ numFound: 0, docs: [] })),
      })
    ).toBeNull();
    expect(
      await openLibrary.byIsbn('9780000000000', { fetch: fakeFetch(() => jsonResponse({}, 500)) })
    ).toBeNull();
  });
});

describe('openLibrary.byTitle', () => {
  it('maps search docs, preferring a 13-digit isbn and building the cover url', async () => {
    const fetch = fakeFetch(url => {
      if (url.endsWith('/works/OL893415W.json'))
        return jsonResponse({ description: 'Desert planet.' });
      expect(url).toContain('/search.json?');
      expect(url).toContain('title=Dune');
      expect(url).toContain('author=Herbert');
      return jsonResponse({
        docs: [
          {
            key: '/works/OL893415W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            first_publish_year: 1965,
            isbn: ['0441172717', '9780441172719'],
            cover_i: 12345,
            subject: ['Science fiction'],
          },
          { key: '/works/OL2W', title: 'Dune Messiah', author_name: ['Frank Herbert'] },
        ],
      });
    });

    const records = await openLibrary.byTitle('Dune', 'Herbert', { fetch });

    expect(records).toHaveLength(2);
    expect(records[0]?.description).toBe('Desert planet.');
    expect(records[1]?.description).toBeNull();
    expect(records[0]).toMatchObject({
      sourceId: '/works/OL893415W',
      isbn: '9780441172719',
      coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
      year: 1965,
    });
  });

  it('returns an empty list on failure', async () => {
    expect(
      await openLibrary.byTitle('x', undefined, { fetch: fakeFetch(() => jsonResponse({}, 503)) })
    ).toEqual([]);
  });
});
