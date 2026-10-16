import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCard } from '@/features/catalog/BookCard';
import { Shelf } from '@/components/Shelf';
import { isAiUnavailable } from '@/features/ai/api';
import { useLabels } from '@/i18n/useLabels';
import { useUiStore } from '@/stores/uiStore';
import { ForYourShelves } from './ForYourShelves';
import { useExplainedRecommendations } from './queries';

export const ExplainedRecommendations = () => {
  const { t } = useTranslation('shelf');
  const labels = useLabels();
  const locale = useUiStore(s => s.locale);
  const explained = useExplainedRecommendations(locale);

  if (explained.isPending)
    return <Shelf className="mt-12" title={labels.forYourShelves} books={undefined} pending />;

  const items = explained.data?.items ?? [];
  if (items.length === 0) {
    const unavailable =
      isAiUnavailable(explained.error) ||
      explained.isError ||
      explained.data?.reason === 'fallback';
    return <ForYourShelves note={unavailable ? t('explained.unavailable') : null} />;
  }

  return (
    <section aria-labelledby="explained-heading" className="mt-12">
      <h2 id="explained-heading" className="text-h2">
        {labels.forYourShelves}
      </h2>
      <p className="mt-1 mb-6 text-small text-fg-2">
        {t('explained.lede', { shelf: labels.shelf.toLowerCase() })}
      </p>
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <li
            key={item.book.id}
            className="grid grid-cols-[6.5rem_1fr] gap-4 rounded-panel border border-line bg-surface p-4"
          >
            <BookCard book={item.book} showMeta={false} />
            <div className="min-w-0">
              <p dir="auto" className="text-small leading-relaxed text-fg">
                {item.explanation}
              </p>
              <p className="mt-2 text-meta text-fg-2">
                {t('explained.because')}{' '}
                {item.citedBooks.map((cited, i) => (
                  <span key={cited.bookId}>
                    {i > 0 ? ', ' : ''}
                    <Link
                      to={routes.book(cited.bookId)}
                      dir="auto"
                      className="font-semibold text-link underline decoration-1 underline-offset-4"
                    >
                      {cited.title}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};
