import { useTranslation } from 'react-i18next';
import { ApiErrorCode, type Genre, type GenreInUseDetails } from '@library/contracts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { describeError } from '@/i18n/errors';
import { Badge, Button, Dialog, ErrorState, Input, PageHeading, Skeleton } from '@/components/ui';
import { useGenres } from '@/features/catalog/queries';
import { isApiError } from '@/lib/api';
import { useLabels } from '@/i18n/useLabels';
import { toast } from '@/stores/uiStore';
import { useArchiveGenre, useCreateGenre, useRenameGenre } from './mutations';

export const GenresPage = () => {
  const { t } = useTranslation(['librarian', 'common']);
  const labels = useLabels();
  const genres = useGenres(true);
  const create = useCreateGenre();
  const rename = useRenameGenre();
  const archive = useArchiveGenre();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [blocked, setBlocked] = useState<{ genre: Genre; details: GenreInUseDetails } | null>(null);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync(newName);
      setNewName('');
      toast(t('genres.created', { genre: labels.genre }), 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const onRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await rename.mutateAsync(editing);
      setEditing(null);
      toast(t('genres.renamed', { genre: labels.genre }), 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const onArchive = async (genre: Genre) => {
    try {
      await archive.mutateAsync({ id: genre.id, restore: genre.archivedAt !== null });
      toast(
        t(genre.archivedAt ? 'genres.restored' : 'genres.archived', { genre: labels.genre }),
        'success'
      );
    } catch (error) {
      if (isApiError(error, ApiErrorCode.enum.GENRE_IN_USE)) {
        setBlocked({ genre, details: error.details as GenreInUseDetails });
        return;
      }
      toast(describeError(error), 'error');
    }
  };

  return (
    <>
      <PageHeading
        title={t('common:nav.manage', { what: labels.genres.toLowerCase() })}
        lede={t('genres.lede', {
          genre: labels.genre.toLowerCase(),
          item: labels.item.toLowerCase(),
        })}
      />
      <form onSubmit={e => void onCreate(e)} className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-56">
          <label htmlFor="new-genre" className="mb-1.5 block text-label text-fg-2">
            {t('genres.new', { genre: labels.genre.toLowerCase() })}
          </label>
          <Input
            id="new-genre"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            required
            maxLength={60}
          />
        </div>
        <Button type="submit" loading={create.isPending}>
          {t('genres.add', { genre: labels.genre.toLowerCase() })}
        </Button>
      </form>
      {genres.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {genres.isError ? (
        <ErrorState message={describeError(genres.error)} onRetry={() => void genres.refetch()} />
      ) : null}
      {genres.data ? (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-fg-2">
                <th scope="col" className="px-4 py-3 text-label">
                  {t('genres.columns.name')}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {t('genres.columns.slug')}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {t('genres.columns.activeItems', { items: labels.items.toLowerCase() })}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {t('books.columns.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  <span className="sr-only">{t('books.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {genres.data.map(genre => (
                <tr
                  key={genre.id}
                  className="border-b border-line last:border-b-0 hover:bg-fg/[0.03]"
                  aria-label={genre.name}
                >
                  <td className="px-4 py-2.5">
                    {editing?.id === genre.id ? (
                      <form onSubmit={e => void onRename(e)} className="flex items-center gap-2">
                        <label htmlFor={`rename-${genre.id}`} className="sr-only">
                          {t('genres.newNameFor', { name: genre.name })}
                        </label>
                        <Input
                          id={`rename-${genre.id}`}
                          value={editing.name}
                          onChange={e => setEditing({ id: genre.id, name: e.target.value })}
                          className="w-56"
                        />
                        <Button type="submit" size="sm" loading={rename.isPending}>
                          {t('common:actions.save')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="quiet"
                          onClick={() => setEditing(null)}
                        >
                          {t('common:actions.cancel')}
                        </Button>
                      </form>
                    ) : (
                      <span className="font-semibold">{genre.name}</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-2.5 text-fg-2">{genre.slug}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`${routes.catalog}?genre=${genre.slug}`}
                      className="tabular font-semibold text-link underline-offset-4 hover:underline"
                    >
                      {genre.activeBookCount}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {genre.archivedAt ? (
                      <Badge tone="danger">{t('status.archived')}</Badge>
                    ) : (
                      <Badge tone="accent">{t('status.active')}</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {genre.archivedAt === null ? (
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => setEditing({ id: genre.id, name: genre.name })}
                        aria-label={t('genres.renameTitled', { name: genre.name })}
                      >
                        {t('genres.rename')}
                      </Button>
                    ) : null}
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => void onArchive(genre)}
                      aria-label={t(
                        genre.archivedAt ? 'actions.restoreTitled' : 'actions.archiveTitled',
                        { title: genre.name }
                      )}
                    >
                      {t(genre.archivedAt ? 'actions.restore' : 'actions.archive')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog
        open={blocked !== null}
        title={t('genres.blocked.title', { name: blocked?.genre.name ?? labels.genre })}
        onClose={() => setBlocked(null)}
        footer={<Button onClick={() => setBlocked(null)}>{t('common:actions.ok')}</Button>}
      >
        {blocked ? (
          <>
            <p>
              {t('genres.blocked.body', {
                genre: labels.genre.toLowerCase(),
                items: labels.items.toLowerCase(),
              })}
            </p>
            <ul className="mt-3 list-disc pl-5">
              {blocked.details.books.map(book => (
                <li key={book.id}>
                  <Link
                    to={routes.librarian.editBook(book.id)}
                    className="font-semibold text-link hover:underline hover:underline-offset-4"
                  >
                    {book.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Dialog>
    </>
  );
};
