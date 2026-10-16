import { externalRecord } from '@library/ai/testing';
import { describe, expect, it } from 'vitest';
import { createLookupAdapter } from './lookup.adapter.js';

describe('lookup adapter', () => {
  it('serves fixtures by ISBN and by title/author and caches repeated lookups', async () => {
    const records = [
      externalRecord(),
      externalRecord({ sourceId: 'OL2M', title: 'Dune Messiah', isbn: '9780441172696' }),
    ];
    let calls = 0;
    const adapter = createLookupAdapter({
      provider: 'fixture',
      timeoutMs: 1000,
      fixtures: new Proxy(records, {
        get(target, prop, receiver) {
          if (prop === 'find' || prop === 'filter') calls += 1;
          return Reflect.get(target, prop, receiver) as unknown;
        },
      }),
    });
    expect((await adapter.byIsbn('9780441013593'))?.title).toBe('Dune');
    expect((await adapter.byIsbn('9780441013593'))?.title).toBe('Dune');
    expect(await adapter.byIsbn('0000000000')).toBeNull();
    expect((await adapter.byTitle('dune', 'herbert')).map(r => r.title)).toEqual([
      'Dune',
      'Dune Messiah',
    ]);
    expect((await adapter.byTitle('dune', 'herbert')).length).toBe(2);
    expect((await adapter.byTitle('dune', 'nobody')).length).toBe(0);
    expect(calls).toBe(4);
  });

  it('aborts an Open Library call that exceeds the timeout and answers "no record"', async () => {
    let aborted = false;
    const started = Date.now();
    const adapter = createLookupAdapter({
      provider: 'openlibrary',
      baseUrl: 'https://openlibrary.test',
      timeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    });
    expect(await adapter.byIsbn('9780441013593')).toBeNull();
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('passes the configured base URL and the signal to the real provider', async () => {
    const seen: string[] = [];
    const adapter = createLookupAdapter({
      provider: 'openlibrary',
      baseUrl: 'https://openlibrary.test',
      timeoutMs: 1000,
      fetchImpl: async input => {
        seen.push(String(input));
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    expect(await adapter.byIsbn('9780441013593')).toBeNull();
    expect(seen[0]).toContain('https://openlibrary.test');
  });
});

describe('fixture lookup without explicit fixtures', () => {
  it('serves the recorded Open Library answers shared with the eval', async () => {
    const adapter = createLookupAdapter({ provider: 'fixture', timeoutMs: 1000 });
    const dune = await adapter.byIsbn('9780441172719');
    expect(dune).toMatchObject({ source: 'openlibrary', title: 'Dune', year: 1965 });
    expect((await adapter.byTitle('The Shining', 'Stephen King'))[0]?.authors).toContain(
      'Stephen King'
    );
  });
});
