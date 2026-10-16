import { useTranslation } from 'react-i18next';
import { describeError } from '@/i18n/errors';
import { FAVORITE_GENRES_MAX } from '@library/contracts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, ErrorState, IconButton, PageHeading, Skeleton } from '@/components/ui';
import { useGenres } from '@/features/catalog/queries';
import { useLabels } from '@/i18n/useLabels';
import { toast } from '@/stores/uiStore';
import { useFavorites, useSetFavorites } from './queries';

export const FavoriteGenresPage = () => {
  const { t } = useTranslation(['favorites', 'common']);
  const labels = useLabels();
  const genres = useGenres();
  const favorites = useFavorites();
  const save = useSetFavorites();
  const serverIds = useMemo(() => favorites.data?.map(f => f.genre.id) ?? [], [favorites.data]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const dirty = draft !== null;
  const selected = draft ?? serverIds;
  const setSelected = (update: (current: number[]) => number[]) => setDraft(update(selected));
  const setDirty = (value: boolean) => {
    if (!value) setDraft(null);
  };

  const nameOf = (id: number) => genres.data?.find(g => g.id === id)?.name ?? `#${id}`;
  const toggle = (id: number) => {
    setDirty(true);
    setSelected(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );
  };
  const move = (index: number, delta: -1 | 1) => {
    setDirty(true);
    setSelected(current => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };
  const full = selected.length >= FAVORITE_GENRES_MAX;

  const onSave = async () => {
    try {
      await save.mutateAsync(selected);
      setDirty(false);
      toast(t('saved'), 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <>
      <PageHeading
        title={labels.favoriteGenres}
        lede={t('lede', { max: FAVORITE_GENRES_MAX, forYourShelves: labels.forYourShelves })}
      />
      {genres.isError ? (
        <ErrorState message={describeError(genres.error)} onRetry={() => void genres.refetch()} />
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <fieldset>
            <legend className="mb-3 text-h2">
              {t('all', { genres: labels.genres.toLowerCase() })}
            </legend>
            <p className="mb-3 text-small text-fg-2" aria-live="polite">
              {t('chosen', { count: selected.length, max: FAVORITE_GENRES_MAX })}
            </p>
            {genres.isPending ? <Skeleton className="h-64 w-full" /> : null}
            <div className="flex flex-col gap-0.5">
              {(genres.data ?? []).map(genre => {
                const checked = selected.includes(genre.id);
                return (
                  <label
                    key={genre.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-body hover:bg-fg/5 has-[:checked]:bg-surface-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-accent"
                      aria-label={genre.name}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(genre.id)}
                    />
                    <span className="flex-1">{genre.name}</span>
                    <span className="tabular text-meta text-fg-2">
                      {t('bookCount', {
                        count: genre.activeBookCount ?? 0,
                        items: labels.items.toLowerCase(),
                      })}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-3 text-h2">{t('ordered.title')}</h2>
          {selected.length === 0 ? (
            <p className="rounded-control-lg bg-surface-2 px-4 py-6 text-small text-fg-2">
              {t('ordered.empty', { genre: labels.genre.toLowerCase() })}
            </p>
          ) : (
            <ol aria-label={t('ordered.listLabel')} className="flex flex-col gap-1">
              {selected.map((id, index) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-control-lg bg-surface-2 py-1 pl-4 pr-1"
                >
                  <span className="tabular w-5 text-small text-fg-3">{index + 1}</span>
                  <span className="flex-1">{nameOf(id)}</span>
                  <IconButton
                    label={t('ordered.moveUp', { name: nameOf(id) })}
                    icon={<ArrowUp className="size-4" aria-hidden="true" />}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <IconButton
                    label={t('ordered.moveDown', { name: nameOf(id) })}
                    icon={<ArrowDown className="size-4" aria-hidden="true" />}
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                  />
                </li>
              ))}
            </ol>
          )}
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void onSave()} loading={save.isPending} disabled={!dirty}>
              {t('save')}
            </Button>
            {dirty ? (
              <Button variant="quiet" onClick={() => setDirty(false)}>
                {t('common:actions.discard')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};
