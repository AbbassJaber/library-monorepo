import { BookSort, type Genre } from '@library/contracts';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select } from '@/components/ui';
import { useLabels } from '@/i18n/useLabels';

export interface SearchDraft {
  q?: string | undefined;
  genre?: string[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
  sort?: BookSort | undefined;
}

type ChipKey = keyof SearchDraft;
interface ChipView {
  id: string;
  key: ChipKey;
  label: string;
  slug?: string;
}

const SORTS: BookSort[] = [BookSort.enum.newest, BookSort.enum.title, BookSort.enum.rating];

const yearOrUndefined = (value: string): number | undefined => {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : undefined;
};

export const QueryChips = ({
  draft,
  genres,
  onChange,
}: {
  draft: SearchDraft;
  genres: Array<Pick<Genre, 'slug' | 'name'>>;
  onChange: (next: SearchDraft) => void;
}) => {
  const { t } = useTranslation(['catalog', 'common']);
  const labels = useLabels();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const genreName = (slug: string) => genres.find(g => g.slug === slug)?.name ?? slug;

  const chips: ChipView[] = [
    ...(draft.q ? [{ id: 'q', key: 'q' as const, label: t('ai.chip.q', { value: draft.q }) }] : []),
    ...(draft.genre ?? []).map(slug => ({
      id: `genre:${slug}`,
      key: 'genre' as const,
      label: genreName(slug),
      slug,
    })),
    ...(draft.yearFrom !== undefined
      ? [
          {
            id: 'yearFrom',
            key: 'yearFrom' as const,
            label: t('filters.chipFrom', { year: draft.yearFrom }),
          },
        ]
      : []),
    ...(draft.yearTo !== undefined
      ? [
          {
            id: 'yearTo',
            key: 'yearTo' as const,
            label: t('filters.chipTo', { year: draft.yearTo }),
          },
        ]
      : []),
    ...(draft.sort
      ? [
          {
            id: 'sort',
            key: 'sort' as const,
            label: t('ai.chip.sort', { label: t(`sort.${draft.sort}`) }),
          },
        ]
      : []),
  ];

  const remove = (chip: ChipView) => {
    if (chip.key === 'genre') {
      const rest = (draft.genre ?? []).filter(slug => slug !== chip.slug);
      onChange({ ...draft, genre: rest.length > 0 ? rest : undefined });
    } else onChange({ ...draft, [chip.key]: undefined });
  };

  const startEdit = (chip: ChipView) => {
    setEditing(chip.id);
    setValue(
      chip.key === 'genre'
        ? (chip.slug ?? '')
        : chip.key === 'q'
          ? (draft.q ?? '')
          : chip.key === 'sort'
            ? (draft.sort ?? BookSort.enum.newest)
            : String(draft[chip.key] ?? '')
    );
  };

  const save = (chip: ChipView) => (event: FormEvent) => {
    event.preventDefault();
    if (chip.key === 'q')
      onChange({ ...draft, q: value.trim().length >= 2 ? value.trim() : undefined });
    else if (chip.key === 'sort') onChange({ ...draft, sort: value as BookSort });
    else if (chip.key === 'genre')
      onChange({
        ...draft,
        genre: [...new Set((draft.genre ?? []).map(slug => (slug === chip.slug ? value : slug)))],
      });
    else onChange({ ...draft, [chip.key]: yearOrUndefined(value) });
    setEditing(null);
  };

  const editor = (chip: ChipView) => {
    const id = `ai-chip-${chip.id}`;
    const label =
      chip.key === 'q'
        ? t('ai.edit.q')
        : chip.key === 'genre'
          ? labels.genre
          : chip.key === 'yearFrom'
            ? t('filters.fromYear')
            : chip.key === 'yearTo'
              ? t('filters.toYear')
              : t('filters.sort');
    return (
      <form onSubmit={save(chip)} className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {chip.key === 'sort' ? (
          <Select id={id} value={value} onChange={e => setValue(e.target.value)} className="w-40">
            {SORTS.map(sort => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </Select>
        ) : chip.key === 'genre' ? (
          <Select id={id} value={value} onChange={e => setValue(e.target.value)} className="w-48">
            {genres.map(genre => (
              <option key={genre.slug} value={genre.slug}>
                {genre.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            dir="auto"
            inputMode={chip.key === 'q' ? 'text' : 'numeric'}
            value={value}
            onChange={e => setValue(e.target.value)}
            className={chip.key === 'q' ? 'w-56' : 'w-28'}
          />
        )}
        <Button type="submit" size="sm">
          {t('common:actions.save')}
        </Button>
        <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(null)}>
          {t('common:actions.cancel')}
        </Button>
      </form>
    );
  };

  if (chips.length === 0) return <p className="text-small text-fg-2">{t('ai.nothing')}</p>;
  return (
    <div role="group" aria-label={t('ai.understood')} className="flex flex-wrap items-center gap-2">
      {chips.map(chip =>
        editing === chip.id ? (
          <div key={chip.id}>{editor(chip)}</div>
        ) : (
          <span
            key={chip.id}
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface-2 text-small"
          >
            <button
              type="button"
              dir="auto"
              onClick={() => startEdit(chip)}
              aria-label={t('ai.edit.chip', { label: chip.label })}
              className="target inline-flex items-center rounded-l-full pl-4 pr-2 hover:bg-fg/10"
            >
              {chip.label}
            </button>
            <button
              type="button"
              onClick={() => remove(chip)}
              aria-label={t('common:actions.remove', { label: chip.label })}
              className="inline-flex size-11 items-center justify-center rounded-r-full hover:bg-fg/10"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        )
      )}
    </div>
  );
};
