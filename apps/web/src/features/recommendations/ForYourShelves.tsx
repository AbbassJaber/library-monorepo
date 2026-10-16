import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { Shelf } from '@/components/Shelf';
import { useFavorites } from '@/features/favorites/queries';
import { useLabels } from '@/i18n/useLabels';
import { useForYourShelves } from './queries';

export const ForYourShelves = ({ note }: { note?: string | null }) => {
  const { t } = useTranslation('shelf');
  const labels = useLabels();
  const favorites = useFavorites();
  const recs = useForYourShelves();
  const noFavorites = favorites.data !== undefined && favorites.data.length === 0;

  const books = recs.data?.map(item => item.book);
  return (
    <Shelf
      className="mt-12"
      title={labels.forYourShelves}
      subtitle={
        <Trans
          t={t}
          i18nKey="forYourShelves.lede"
          values={{
            favorites: labels.favoriteGenres.toLowerCase(),
            shelf: labels.shelf.toLowerCase(),
          }}
          components={{
            favorites: (
              <Link
                to={routes.favorites}
                className="font-semibold text-link underline underline-offset-4"
              />
            ),
          }}
        />
      }
      books={books}
      pending={recs.isPending}
      fallback={
        noFavorites ? (
          <p className="rounded-panel bg-surface px-6 py-8 text-center text-fg-2">
            {t('forYourShelves.noFavorites', { genres: labels.genres.toLowerCase() })}
          </p>
        ) : books && books.length === 0 ? (
          <p className="text-fg-2">
            {t('forYourShelves.exhausted', { shelf: labels.shelf.toLowerCase() })}
          </p>
        ) : null
      }
      notice={note ?? undefined}
    />
  );
};
