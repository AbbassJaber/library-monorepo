import { useTranslation } from 'react-i18next';
import type { PaginationMeta } from '@library/contracts';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/cn';

interface PaginatorProps {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}

const pageHref = (search: string, page: number): string => {
  const params = new URLSearchParams(search);
  if (page > 1) params.set('page', String(page));
  else params.delete('page');
  const text = params.toString();
  return text ? `?${text}` : '?';
};

export const Paginator = ({ meta, onPage }: PaginatorProps) => {
  const { t } = useTranslation('catalog');
  const location = useLocation();
  if (meta.totalPages <= 1) return null;
  const linkClass = (disabled: boolean) =>
    cn(
      'target inline-flex items-center rounded-full border border-line-strong px-5 text-small font-semibold text-fg hover:bg-fg/5',
      disabled && 'pointer-events-none opacity-40'
    );
  const go = (page: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    onPage(page);
  };
  return (
    <nav
      aria-label={t('pagination.label')}
      className="mt-8 flex items-center justify-between gap-4"
    >
      <Link
        to={pageHref(location.search, meta.page - 1)}
        onClick={go(meta.page - 1)}
        aria-disabled={meta.page <= 1}
        className={linkClass(meta.page <= 1)}
      >
        {t('pagination.previous')}
      </Link>
      <p className="text-small text-fg-2" aria-live="polite">
        {t('pagination.status', { page: meta.page, pages: meta.totalPages, count: meta.total })}
      </p>
      <Link
        to={pageHref(location.search, meta.page + 1)}
        onClick={go(meta.page + 1)}
        aria-disabled={meta.page >= meta.totalPages}
        className={linkClass(meta.page >= meta.totalPages)}
      >
        {t('pagination.next')}
      </Link>
    </nav>
  );
};
