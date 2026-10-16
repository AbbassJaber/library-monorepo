import { useTranslation } from 'react-i18next';
import { ChevronDown, LayoutGrid, Rows3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Chip, IconButton, Input, Select } from '@/components/ui';
import { CONTENT_LANGUAGES } from '@library/domain-config';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { useDebounce } from '@/lib/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useGenres } from './queries';
import type { CatalogParams } from './useCatalogParams';

interface FilterBarProps {
  params: CatalogParams;
  onChange: (patch: Partial<CatalogParams>) => void;
  onClear: () => void;
  hasFilters: boolean;
}

const yearOrUndefined = (value: string): number | undefined => {
  const n = Number(value);
  return value.trim() === '' || !Number.isInteger(n) || n < 1000 || n > 9999 ? undefined : n;
};

export const FilterBar = ({ params, onChange, onClear, hasFilters }: FilterBarProps) => {
  const { t } = useTranslation('catalog');
  const labels = useLabels();
  const format = useFormat();
  const genres = useGenres();
  const viewMode = useUiStore(s => s.catalogViewMode);
  const setViewMode = useUiStore(s => s.setCatalogViewMode);

  const [q, setQ] = useState(params.q ?? '');
  const [prevQ, setPrevQ] = useState(params.q);
  if (params.q !== prevQ) {
    setPrevQ(params.q);
    setQ(params.q ?? '');
  }
  const debouncedQ = useDebounce(q, 350);
  useEffect(() => {
    const next = debouncedQ.trim();
    const current = params.q ?? '';
    if (next === current) return;
    if (next.length >= 2 || next.length === 0)
      onChange({ q: next.length === 0 ? undefined : next });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced value
  }, [debouncedQ]);

  const [yearFrom, setYearFrom] = useState(params.yearFrom?.toString() ?? '');
  const [yearTo, setYearTo] = useState(params.yearTo?.toString() ?? '');
  const [prevYears, setPrevYears] = useState([params.yearFrom, params.yearTo] as const);
  if (params.yearFrom !== prevYears[0] || params.yearTo !== prevYears[1]) {
    setPrevYears([params.yearFrom, params.yearTo]);
    setYearFrom(params.yearFrom?.toString() ?? '');
    setYearTo(params.yearTo?.toString() ?? '');
  }
  const debouncedFrom = useDebounce(yearFrom, 400);
  const debouncedTo = useDebounce(yearTo, 400);
  useEffect(() => {
    const value = yearOrUndefined(debouncedFrom);
    if (value !== params.yearFrom && (debouncedFrom === '' || value !== undefined))
      onChange({ yearFrom: value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFrom]);
  useEffect(() => {
    const value = yearOrUndefined(debouncedTo);
    if (value !== params.yearTo && (debouncedTo === '' || value !== undefined))
      onChange({ yearTo: value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTo]);

  const selected = new Set(params.genre ?? []);
  const toggleGenre = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ genre: next.size > 0 ? [...next] : undefined });
  };
  const genreName = (slug: string) => genres.data?.find(g => g.slug === slug)?.name ?? slug;

  const labelClass = 'mb-1.5 block text-label text-fg-2';
  return (
    <div className="mb-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full sm:min-w-56 sm:flex-1 sm:basis-auto">
          <label htmlFor="catalog-q" className={labelClass}>
            {t('filters.search')}
          </label>
          <Input
            id="catalog-q"
            type="search"
            dir="auto"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            autoComplete="off"
          />
        </div>
        <details className="relative">
          <summary className="target inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong px-4 text-small font-semibold text-fg hover:bg-fg/5 [&::-webkit-details-marker]:hidden">
            {labels.genres}
            {selected.size > 0 ? (
              <span className="tabular rounded-full bg-accent px-1.5 text-meta text-accent-ink">
                {selected.size}
              </span>
            ) : null}
            <ChevronDown className="size-4 text-fg-2" aria-hidden="true" />
          </summary>
          <fieldset className="absolute left-0 z-20 mt-2 max-h-80 w-64 overflow-auto rounded-control-lg border border-line bg-surface-2 p-2 shadow-pop">
            <legend className="sr-only">
              {t('filters.byGenre', { genre: labels.genre.toLowerCase() })}
            </legend>
            {(genres.data ?? []).map(genre => (
              <label
                key={genre.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-small hover:bg-fg/5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(genre.slug)}
                  onChange={() => toggleGenre(genre.slug)}
                  className="size-4 accent-accent"
                />
                <span className="flex-1">{genre.name}</span>
                <span className="tabular text-meta text-fg-3">{genre.activeBookCount}</span>
              </label>
            ))}
          </fieldset>
        </details>
        <div>
          <label htmlFor="catalog-year-from" className={labelClass}>
            {t('filters.fromYear')}
          </label>
          <Input
            id="catalog-year-from"
            inputMode="numeric"
            className="tabular w-24"
            value={yearFrom}
            onChange={e => setYearFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="catalog-year-to" className={labelClass}>
            {t('filters.toYear')}
          </label>
          <Input
            id="catalog-year-to"
            inputMode="numeric"
            className="tabular w-24"
            value={yearTo}
            onChange={e => setYearTo(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="catalog-language" className={labelClass}>
            {t('filters.language')}
          </label>
          <Select
            id="catalog-language"
            value={params.language?.[0] ?? ''}
            onChange={e => onChange({ language: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">{t('filters.anyLanguage')}</option>
            {CONTENT_LANGUAGES.map(code => (
              <option key={code} value={code}>
                {format.language(code)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="catalog-sort" className={labelClass}>
            {t('filters.sort')}
          </label>
          <Select
            id="catalog-sort"
            value={params.sort ?? ''}
            onChange={e =>
              onChange({
                sort: e.target.value === '' ? undefined : (e.target.value as CatalogParams['sort']),
              })
            }
          >
            <option value="">{params.q ? t('sort.bestMatch') : t('sort.newest')}</option>
            <option value="newest">{t('sort.newest')}</option>
            <option value="title">{t('sort.title')}</option>
            <option value="rating">{t('sort.rating')}</option>
          </Select>
        </div>
        <div
          className="flex items-center gap-1 self-end rounded-control-lg border border-line p-0.5"
          role="group"
          aria-label={t('view.label')}
        >
          <IconButton
            label={t('view.pages')}
            icon={<LayoutGrid className="size-5" aria-hidden="true" />}
            active={viewMode === 'pages'}
            onClick={() => setViewMode('pages')}
          />
          <IconButton
            label={t('view.scroll')}
            icon={<Rows3 className="size-5" aria-hidden="true" />}
            active={viewMode === 'scroll'}
            onClick={() => setViewMode('scroll')}
          />
        </div>
      </div>
      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('filters.active')}>
          {params.q ? (
            <Chip label={`“${params.q}”`} onRemove={() => onChange({ q: undefined })} />
          ) : null}
          {(params.genre ?? []).map(slug => (
            <Chip key={slug} label={genreName(slug)} onRemove={() => toggleGenre(slug)} />
          ))}
          {(params.language ?? []).map(code => (
            <Chip
              key={code}
              label={format.language(code)}
              onRemove={() =>
                onChange({ language: params.language?.filter(other => other !== code) })
              }
            />
          ))}
          {params.yearFrom !== undefined ? (
            <Chip
              label={t('filters.chipFrom', { year: params.yearFrom })}
              onRemove={() => onChange({ yearFrom: undefined })}
            />
          ) : null}
          {params.yearTo !== undefined ? (
            <Chip
              label={t('filters.chipTo', { year: params.yearTo })}
              onRemove={() => onChange({ yearTo: undefined })}
            />
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 px-2 text-small font-semibold text-link hover:underline hover:underline-offset-4"
          >
            {t('filters.clear')}
          </button>
        </div>
      ) : null}
    </div>
  );
};
