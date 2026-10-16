import type { Resource } from 'i18next';
import { describe, expect, it } from 'vitest';
import { testResources } from '@/test/i18n';
import { NAMESPACES, i18n } from './index';

const keysOf = (value: unknown, prefix = ''): string[] =>
  value !== null && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) =>
        keysOf(child, prefix ? `${prefix}.${key}` : key)
      )
    : [prefix];

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*([a-zA-Z]+)/g)].map(match => match[1] ?? '').sort();

const leaves = (value: unknown, prefix = ''): Array<[string, string]> =>
  value !== null && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) =>
        leaves(child, prefix ? `${prefix}.${key}` : key)
      )
    : [[prefix, String(value)]];

describe('translation bundles', () => {
  const en = testResources['en'] as Record<string, unknown>;
  const fr = testResources['fr'] as Record<string, unknown>;

  it('exist for every declared namespace in both languages', () => {
    for (const ns of NAMESPACES) {
      expect(en[ns], `en/${ns}`).toBeDefined();
      expect(fr[ns], `fr/${ns}`).toBeDefined();
    }
  });

  it.each(NAMESPACES)('en and fr have identical key sets in "%s"', ns => {
    expect(keysOf(fr[ns]).sort()).toEqual(keysOf(en[ns]).sort());
  });

  it.each(NAMESPACES)('en and fr use the same interpolation variables in "%s"', ns => {
    const frLeaves = new Map(leaves(fr[ns]));
    for (const [key, text] of leaves(en[ns])) {
      expect(placeholders(frLeaves.get(key) ?? ''), `${ns}:${key}`).toEqual(placeholders(text));
    }
  });

  it('is loaded into the test instance for both languages', () => {
    const resources: Resource = testResources;
    expect(Object.keys(resources).sort()).toEqual(['en', 'fr']);
    expect(i18n.hasLoadedNamespace('librarian', { lng: 'fr' })).toBe(true);
  });

  it('rejects keys that are not in the English bundle at compile time', () => {
    // @ts-expect-error -- the key type is generated from the JSON, so this cannot typecheck
    expect(i18n.t('common:not.a.real.key')).toBe('not.a.real.key');
  });
});
