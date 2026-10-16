import { BooksQuery, PAGE_SIZE_DEFAULT } from '@library/contracts';
import type { BooksQuery as BooksQueryType } from '@library/contracts';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { routes } from '@/app/routes';

export type CatalogParams = Omit<BooksQueryType, 'status'>;

export const MODE_PARAM = 'mode';
export const SEMANTIC_MODE = 'semantic';

export const catalogSearchHref = (q: string, byMeaning: boolean): string => {
  const params = new URLSearchParams({ q });
  if (byMeaning) params.set(MODE_PARAM, SEMANTIC_MODE);
  return `${routes.catalog}?${params.toString()}`;
};
type Patch = Partial<{ [K in keyof CatalogParams]: CatalogParams[K] | undefined }>;

const FILTER_KEYS: Array<keyof CatalogParams> = [
  'q',
  'genre',
  'yearFrom',
  'yearTo',
  'language',
  'sort',
  'pageSize',
];

const LIST_KEYS = new Set<string>(['genre', 'language'] satisfies Array<keyof CatalogParams>);

export const useCatalogParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<CatalogParams>(() => {
    const raw: Record<string, string | string[]> = {};
    for (const key of searchParams.keys()) {
      const values = searchParams.getAll(key);
      raw[key] = LIST_KEYS.has(key) ? values : (values[0] ?? '');
    }
    const parsed = BooksQuery.safeParse(raw);
    const base = parsed.success ? parsed.data : BooksQuery.parse({});
    const { status: _status, ...rest } = base;
    return rest;
  }, [searchParams]);

  const setParams = useCallback(
    (patch: Patch) => {
      const next: Partial<Record<keyof CatalogParams | typeof MODE_PARAM, string | string[]>> = {};
      const merged = { ...params, ...patch };
      const filterChanged = FILTER_KEYS.some(key => key in patch);
      if (merged.q) next['q'] = merged.q;
      if (merged.genre && merged.genre.length > 0) next['genre'] = merged.genre;
      if (merged.yearFrom !== undefined) next['yearFrom'] = String(merged.yearFrom);
      if (merged.yearTo !== undefined) next['yearTo'] = String(merged.yearTo);
      if (merged.language && merged.language.length > 0) next['language'] = merged.language;
      if (merged.sort) next['sort'] = merged.sort;
      if (merged.pageSize !== undefined && merged.pageSize !== PAGE_SIZE_DEFAULT)
        next['pageSize'] = String(merged.pageSize);
      const page = filterChanged ? 1 : merged.page;
      if (page !== undefined && page > 1) next['page'] = String(page);
      if (searchParams.get(MODE_PARAM) === SEMANTIC_MODE) next[MODE_PARAM] = SEMANTIC_MODE;
      const out = new URLSearchParams();
      for (const [key, value] of Object.entries(next) as Array<[string, string | string[]]>) {
        if (Array.isArray(value)) value.forEach(v => out.append(key, v));
        else out.set(key, value);
      }
      setSearchParams(out, { replace: false });
    },
    [params, searchParams, setSearchParams]
  );

  const semantic = searchParams.get(MODE_PARAM) === SEMANTIC_MODE;
  const setSemantic = useCallback(
    (on: boolean) => {
      const out = new URLSearchParams(searchParams);
      if (on) out.set(MODE_PARAM, SEMANTIC_MODE);
      else out.delete(MODE_PARAM);
      out.delete('page');
      setSearchParams(out);
    },
    [searchParams, setSearchParams]
  );

  const clear = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams]);

  const hasFilters = Boolean(
    params.q ||
    (params.genre && params.genre.length > 0) ||
    params.yearFrom !== undefined ||
    params.yearTo !== undefined ||
    (params.language && params.language.length > 0)
  );

  return { params, setParams, clear, hasFilters, semantic, setSemantic };
};
