import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { routes } from '@/app/routes';
import { describeError } from '@/i18n/errors';
import { ErrorState, PageHeading, Skeleton } from '@/components/ui';
import { bookDetailOptions, useGenres } from '@/features/catalog/queries';
import { useLabels } from '@/i18n/useLabels';
import { toast } from '@/stores/uiStore';
import { BookForm } from './BookForm';
import { useCreateBook, useUpdateBook } from './mutations';

export const BookFormPage = () => {
  const { t } = useTranslation(['librarian', 'common']);
  const labels = useLabels();
  const { id: rawId } = useParams();
  const id = rawId === undefined ? undefined : Number(rawId);
  const editing = id !== undefined;
  const navigate = useNavigate();
  const genres = useGenres(true);
  const detail = useQuery({
    ...bookDetailOptions(id ?? 0),
    enabled: editing,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const create = useCreateBook();
  const update = useUpdateBook();

  if (genres.isError)
    return (
      <ErrorState message={describeError(genres.error)} onRetry={() => void genres.refetch()} />
    );
  if (editing && detail.isError)
    return (
      <ErrorState message={describeError(detail.error)} onRetry={() => void detail.refetch()} />
    );
  if (genres.isPending || (editing && detail.isPending))
    return <Skeleton className="h-96 max-w-3xl" />;

  return (
    <>
      <PageHeading
        title={t(editing ? 'form.editTitle' : 'form.addTitle', { item: labels.item.toLowerCase() })}
        lede={
          <Link
            to={routes.librarian.books}
            className="font-semibold text-link hover:underline hover:underline-offset-4"
          >
            {t('form.back', { items: labels.items.toLowerCase() })}
          </Link>
        }
      />
      <BookForm
        key={editing ? `edit-${id}-${detail.data?.version ?? 0}` : 'create'}
        genres={genres.data}
        {...(editing && detail.data ? { initial: detail.data } : {})}
        submitLabel={
          editing
            ? t('common:actions.saveChanges')
            : t('form.create', { item: labels.item.toLowerCase() })
        }
        onSubmit={async (body, version) => {
          if (editing && id !== undefined) {
            const saved = await update.mutateAsync({ id, body: { ...body, version } });
            toast(t('form.saved'), 'success');
            navigate(routes.book(saved.id));
          } else {
            const saved = await create.mutateAsync(body);
            toast(t('form.created', { item: labels.item }), 'success');
            navigate(routes.book(saved.id));
          }
        }}
      />
    </>
  );
};
