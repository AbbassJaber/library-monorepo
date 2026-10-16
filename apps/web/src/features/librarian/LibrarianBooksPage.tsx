import { useTranslation } from 'react-i18next';
import { apiPaths, BookStatus } from '@library/contracts';
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { describeError } from '@/i18n/errors';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton,
} from '@/components/ui';
import { Paginator } from '@/features/catalog/Paginator';
import { booksListOptions } from '@/features/catalog/queries';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { useDebounce } from '@/lib/useDebounce';
import { toast } from '@/stores/uiStore';
import { useArchiveBook } from './mutations';

export const LibrarianBooksPage = () => {
  const { t } = useTranslation(['librarian', 'common', 'books', 'catalog']);
  const labels = useLabels();
  const format = useFormat();
  const [status, setStatus] = useState<BookStatus>(BookStatus.enum.active);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounce(q, 350);
  const query = {
    status,
    page,
    pageSize: 24,
    sort: 'title' as const,
    ...(debouncedQ.length >= 2 ? { q: debouncedQ } : {}),
  };
  const books = useQuery({ ...booksListOptions(query), placeholderData: keepPreviousData });
  const archive = useArchiveBook();

  const toggleArchive = async (id: number, version: number, restore: boolean) => {
    try {
      await archive.mutateAsync({ id, version, restore });
      toast(t(restore ? 'books.restored' : 'books.archived', { item: labels.item }), 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <>
      <PageHeading
        title={t('common:nav.manage', { what: labels.items.toLowerCase() })}
        aside={
          <LinkButton to={routes.librarian.newBook}>
            {t('books.add', { item: labels.item.toLowerCase() })}
          </LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="lib-q" className="mb-1.5 block text-label text-fg-2">
            {t('books.search')}
          </label>
          <Input
            id="lib-q"
            type="search"
            dir="auto"
            value={q}
            onChange={e => (setQ(e.target.value), setPage(1))}
          />
        </div>
        <div>
          <label htmlFor="lib-status" className="mb-1.5 block text-label text-fg-2">
            {t('books.show')}
          </label>
          <Select
            id="lib-status"
            value={status}
            onChange={e => (setStatus(e.target.value as BookStatus), setPage(1))}
          >
            <option value="active">{t('status.active')}</option>
            <option value="archived">{t('status.archived')}</option>
            <option value="all">{t('status.all')}</option>
          </Select>
        </div>
      </div>
      {books.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {books.isError ? (
        <ErrorState message={describeError(books.error)} onRetry={() => void books.refetch()} />
      ) : null}
      {books.data ? (
        <div
          className="overflow-x-auto rounded-panel border border-line bg-surface"
          aria-busy={books.isPlaceholderData}
        >
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-fg-2">
                <th scope="col" className="px-4 py-3 text-label">
                  {t('books.columns.title')}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {labels.creator}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {labels.year}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {t('books:rating')}
                </th>
                <th scope="col" className="px-4 py-3 text-label">
                  {labels.genres}
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
              {books.data.items.map(book => (
                <tr
                  key={book.id}
                  className="border-b border-line last:border-b-0 hover:bg-fg/[0.03] align-top"
                  aria-label={t('catalog:card.titleBy', { title: book.title, author: book.author })}
                >
                  <td className="px-4 py-2.5" dir="auto">
                    <Link
                      to={routes.book(book.id)}
                      className="font-semibold text-fg underline-offset-4 hover:underline"
                    >
                      {book.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5" dir="auto">
                    {book.author}
                  </td>
                  <td className="tabular px-4 py-2.5">{format.year(book.publishedYear)}</td>
                  <td className="tabular px-4 py-2.5">{format.rating(book.rating)}</td>
                  <td className="px-4 py-2.5 text-fg-2">
                    {book.genres.map(g => g.name).join(', ')}
                  </td>
                  <td className="px-4 py-2.5">
                    {book.archivedAt ? (
                      <Badge tone="danger">{t('status.archived')}</Badge>
                    ) : (
                      <Badge tone="accent">{t('status.active')}</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <Link
                      to={routes.librarian.editBook(book.id)}
                      className="target mr-2 inline-flex items-center rounded-control px-2 underline-offset-4 hover:underline"
                    >
                      {t('common:actions.edit')}
                    </Link>
                    <ArchiveButton
                      bookId={book.id}
                      title={book.title}
                      archived={book.archivedAt !== null}
                      onToggle={toggleArchive}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {books.data.items.length === 0 ? (
            <p className="py-8 text-center text-fg-2">
              {t('books.noMatch', { items: labels.items.toLowerCase() })}
            </p>
          ) : null}
          <Paginator meta={books.data.meta} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
};

const ArchiveButton = ({
  bookId,
  title,
  archived,
  onToggle,
}: {
  bookId: number;
  title: string;
  archived: boolean;
  onToggle: (id: number, version: number, restore: boolean) => Promise<void>;
}) => {
  const { t } = useTranslation('librarian');
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="quiet"
      size="sm"
      loading={busy}
      aria-label={t(archived ? 'actions.restoreTitled' : 'actions.archiveTitled', { title })}
      onClick={async () => {
        setBusy(true);
        try {
          const { api } = await import('@/lib/api');
          const current = (await api.get<{ version: number }>(apiPaths.books.detail(bookId))).data;
          await onToggle(bookId, current.version, archived);
        } finally {
          setBusy(false);
        }
      }}
    >
      {t(archived ? 'actions.restore' : 'actions.archive')}
    </Button>
  );
};
