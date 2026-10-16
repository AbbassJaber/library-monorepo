import { ReadingState, type BookSummary, type ReadingListEntry } from '@library/contracts';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, MessageSquareText, Phone } from 'lucide-react';
import { useId, useLayoutEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { Shelf } from '@/components/Shelf';
import { Button, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { useCanTalk } from '@/features/ai/useVoice';
import { useStartCall } from '@/features/call/useStartCall';
import { useMe } from '@/features/auth/queries';
import { useSimilarBooks } from '@/features/books/SimilarBooks';
import { newestOptions } from '@/features/catalog/queries';
import { useFavorites } from '@/features/favorites/queries';
import {
  forYourShelvesOptions,
  useExplainedRecommendations,
} from '@/features/recommendations/queries';
import { useAddToShelf, useUpdateReadingState } from '@/features/shelf/mutations';
import { StateSelect } from '@/features/shelf/ShelfControls';
import { useShelf, useShelfStateOf } from '@/features/shelf/queries';
import { describeError } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { coverVars } from '@/lib/cover';
import { isRtl } from '@/lib/format';
import { riseHeadlineOnce } from '@/lib/motionPrefs';
import { COVER_SCOPE_ATTR, recordBookOpen } from '@/stores/bookOpenStore';
import { useChatStore } from '@/stores/chatStore';
import { useUiStore } from '@/stores/uiStore';

const HERO_SIMILAR_COUNT = 4;
const CITED_TITLES_MAX = 3;
const PROMPTS = ['s1', 's2', 's3'] as const;

type HeroKind = 'reading' | 'recommended' | 'newest';

const useBookMeta = (book: BookSummary): string => {
  const format = useFormat();
  return [book.author, format.year(book.publishedYear), book.genres[0]?.name]
    .filter(Boolean)
    .join(' · ');
};

const ReaderHero = ({
  book,
  kind,
  entry,
}: {
  book: BookSummary;
  kind: HeroKind;
  entry: ReadingListEntry | undefined;
}) => {
  const { t } = useTranslation(['home', 'catalog']);
  const labels = useLabels();
  const meta = useBookMeta(book);
  const add = useAddToShelf();
  const update = useUpdateReadingState();
  const openWithDraft = useChatStore(s => s.openWithDraft);
  const similar = useSimilarBooks(book.id)?.slice(0, HERO_SIMILAR_COUNT) ?? [];
  const headingId = useId();
  const similarId = useId();
  const kindLabel = {
    reading: t('hero.continueReading'),
    recommended: t('hero.recommended'),
    newest: t('hero.newest'),
  }[kind];
  const canFinish =
    entry !== undefined && entry.state !== ReadingState.enum.FINISHED && entry.available;

  return (
    <section
      aria-labelledby={headingId}
      className="cover-stage rounded-panel p-6 sm:p-10"
      style={coverVars(book.title)}
      {...{ [COVER_SCOPE_ATTR]: '' }}
    >
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
          <BookCover
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            size="hero"
            archived={book.archivedAt !== null}
            className="w-[140px] shrink-0 sm:w-[200px]"
          />
          <div className="min-w-0">
            <p className="text-label text-fg-2">{kindLabel}</p>
            <h2
              id={headingId}
              dir={isRtl(book.title) ? 'rtl' : 'ltr'}
              className="mt-2 text-[2.75rem] leading-none font-extrabold tracking-[-0.035em] [overflow-wrap:anywhere] [text-wrap:balance] sm:text-display"
            >
              <Link
                to={routes.book(book.id)}
                onClick={event => recordBookOpen(event, book.id)}
                className="rounded-control hover:underline hover:decoration-2 hover:underline-offset-8"
              >
                {book.title}
              </Link>
            </h2>
            <p className="mt-4 text-body text-fg-2" dir="auto">
              {meta}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {canFinish ? (
                <Button
                  variant="inverse"
                  loading={update.isPending}
                  disabled={entry.id < 0}
                  onClick={() =>
                    update.mutate({ bookId: book.id, state: ReadingState.enum.FINISHED })
                  }
                >
                  {t('hero.markFinished')}
                </Button>
              ) : null}
              {entry === undefined ? (
                <Button
                  variant="inverse"
                  loading={add.isPending}
                  onClick={() => add.mutate({ book })}
                >
                  {labels.addToShelf}
                </Button>
              ) : (
                <StateSelect
                  book={book}
                  entry={entry}
                  label={t('hero.stateLabel', { title: book.title })}
                />
              )}
              <Button
                variant="secondary"
                className="border-fg/25"
                onClick={() =>
                  openWithDraft(t('hero.askPrompt', { title: book.title, author: book.author }), {
                    bookId: book.id,
                    title: book.title,
                  })
                }
              >
                {t('hero.askAbout')}
              </Button>
            </div>
          </div>
        </div>
        {similar.length > 0 ? (
          <div className="min-w-0 xl:w-[20rem] xl:shrink-0">
            <h3 id={similarId} className="text-label text-fg-2">
              {labels.similar}
            </h3>
            <ul aria-labelledby={similarId} className="mt-3 grid max-w-[22rem] grid-cols-4 gap-3">
              {similar.map(({ book: like }) => (
                <li key={like.id}>
                  <Link
                    to={routes.book(like.id)}
                    onClick={event => recordBookOpen(event, like.id)}
                    aria-label={t('catalog:card.titleBy', {
                      title: like.title,
                      author: like.author,
                    })}
                    className="block rounded-cover"
                  >
                    <BookCover title={like.title} author={like.author} coverUrl={like.coverUrl} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
};

const HeroSkeleton = () => (
  <div aria-hidden="true" className="rounded-panel bg-surface p-6 sm:p-10">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
      <Skeleton className="aspect-[2/3] w-[140px] rounded-cover sm:w-[200px]" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-14 w-3/4" />
        <Skeleton className="mt-4 h-4 w-1/2" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

const Orb = () => (
  <div
    aria-hidden="true"
    className="flex size-28 shrink-0 items-center justify-center rounded-full bg-accent/15"
  >
    <div className="flex size-20 items-center justify-center rounded-full bg-accent/30">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink">
        <AudioLines className="size-7" />
      </div>
    </div>
  </div>
);

const LibrarianCard = () => {
  const { t } = useTranslation(['home', 'common']);
  const canTalk = useCanTalk();
  const startCall = useStartCall();
  const setOpen = useChatStore(s => s.setOpen);
  const openWithDraft = useChatStore(s => s.openWithDraft);
  const headingId = useId();
  const examplesId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-6 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8"
    >
      <Orb />
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-h2">
          {t('librarian.title')}
        </h2>
        <p className="mt-2 max-w-prose text-fg-2">{t('librarian.body')}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {canTalk ? (
            <Button
              icon={<Phone className="size-[1.1rem]" aria-hidden="true" />}
              onClick={startCall}
            >
              {t('common:call.start')}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            icon={<MessageSquareText className="size-[1.1rem]" aria-hidden="true" />}
            onClick={() => setOpen(true)}
          >
            {t('librarian.type')}
          </Button>
        </div>
        <p id={examplesId} className="mt-6 text-label text-fg-3">
          {t('librarian.examples')}
        </p>
        <ul aria-labelledby={examplesId} className="mt-2 flex flex-wrap gap-2">
          {PROMPTS.map(key => (
            <li key={key}>
              <button
                type="button"
                onClick={() => openWithDraft(t(`common:chat.suggestions.${key}`))}
                className="min-h-11 rounded-full border border-line bg-bg px-4 text-left text-small text-fg hover:border-line-strong"
              >
                {t(`common:chat.suggestions.${key}`)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const citedTitles = (
  items: Array<{ citedBooks: Array<{ bookId: number; title: string }> }>,
  locale: string
): string | null => {
  const titles = [
    ...new Map(items.flatMap(item => item.citedBooks).map(b => [b.bookId, b.title])).values(),
  ].slice(0, CITED_TITLES_MAX);
  if (titles.length === 0) return null;
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(titles);
};

const ReaderHome = () => {
  const { t } = useTranslation(['home', 'common']);
  const labels = useLabels();
  const locale = useUiStore(s => s.locale);
  const shelf = useShelf();
  const stateOf = useShelfStateOf();
  const favorites = useFavorites();
  const explained = useExplainedRecommendations(locale);
  const explainedItems = explained.data?.items ?? [];
  const needPlain = explained.isError || (explained.isSuccess && explainedItems.length === 0);
  const plain = useQuery({ ...forYourShelvesOptions, enabled: needPlain });
  const newest = useQuery(newestOptions);

  const recommendations: BookSummary[] | undefined =
    explainedItems.length > 0
      ? explainedItems.map(item => item.book)
      : plain.data?.map(item => item.book);
  const recsPending = explained.isPending || (needPlain && plain.isPending);

  const reading = shelf.data?.find(
    entry => entry.state === ReadingState.enum.READING && entry.available
  );
  let hero: { book: BookSummary; kind: HeroKind } | null | undefined;
  if (shelf.isPending) hero = undefined;
  else if (reading) hero = { book: reading.book, kind: 'reading' };
  else if (recsPending) hero = undefined;
  else if (recommendations?.[0]) hero = { book: recommendations[0], kind: 'recommended' };
  else if (newest.isPending) hero = undefined;
  else hero = newest.data?.[0] ? { book: newest.data[0], kind: 'newest' } : null;
  const heroEntry = hero ? shelf.data?.find(entry => entry.book.id === hero.book.id) : undefined;

  const forYouBooks = recommendations?.filter(book => book.id !== hero?.book.id);
  const cited = citedTitles(explainedItems, locale);
  const shelfName = labels.shelf.toLowerCase();
  const noFavorites = needPlain && favorites.data !== undefined && favorites.data.length === 0;
  const forYouFallback = noFavorites ? (
    <p className="text-fg-2">
      <Trans
        t={t}
        i18nKey="forYou.noFavorites"
        components={{
          favorites: (
            <Link to={routes.favorites} className="text-link underline underline-offset-4" />
          ),
        }}
      />
    </p>
  ) : forYouBooks && forYouBooks.length === 0 ? (
    <p className="text-fg-2">{t('forYou.exhausted', { shelf: shelfName })}</p>
  ) : needPlain && plain.isError ? (
    <ErrorState message={describeError(plain.error)} onRetry={() => void plain.refetch()} />
  ) : null;

  return (
    <div className="flex flex-col gap-12 sm:gap-14">
      <h1 className="sr-only">{t('title')}</h1>
      {hero === undefined ? <HeroSkeleton /> : null}
      {hero ? <ReaderHero book={hero.book} kind={hero.kind} entry={heroEntry} /> : null}

      <Shelf
        title={labels.forYourShelves}
        subtitle={
          cited
            ? t('forYou.because', { titles: cited, shelf: shelfName })
            : needPlain
              ? t('forYou.plain', { shelf: shelfName })
              : null
        }
        seeAll={{ to: routes.shelf }}
        books={forYouBooks}
        stateOf={stateOf}
        pending={recsPending}
        fallback={forYouFallback}
      />

      <LibrarianCard />

      <Shelf
        title={labels.newest}
        subtitle={t('newest.subtitle')}
        seeAll={{ to: `${routes.catalog}?sort=newest` }}
        books={newest.data}
        stateOf={stateOf}
        pending={newest.isPending}
        fallback={
          newest.isError ? (
            <ErrorState
              message={describeError(newest.error)}
              onRetry={() => void newest.refetch()}
            />
          ) : null
        }
      />
    </div>
  );
};

const WelcomeHome = () => {
  const { t } = useTranslation(['home', 'common']);
  const labels = useLabels();
  const newest = useQuery(newestOptions);
  const featured = newest.data?.[0];
  const featuredId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(
    () => (headingRef.current ? riseHeadlineOnce(headingRef.current) : undefined),
    []
  );
  return (
    <div className="flex flex-col gap-12 sm:gap-14">
      <section
        aria-labelledby={featuredId}
        className="cover-stage flex flex-col-reverse gap-8 rounded-panel p-6 sm:p-10 md:flex-row md:items-center md:justify-between"
        style={featured ? coverVars(featured.title) : undefined}
      >
        <div className="max-w-xl">
          <h1
            ref={headingRef}
            id={featuredId}
            className="text-[2rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-h1"
          >
            {t('welcome.title')}
          </h1>
          <p className="mt-4 max-w-prose text-body text-fg-2">{t('welcome.lede')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton to={routes.login} variant="inverse">
              {t('common:auth.logIn')}
            </LinkButton>
            <LinkButton to={routes.register} variant="secondary" className="border-fg/25">
              {t('welcome.createAccount')}
            </LinkButton>
          </div>
        </div>
        {featured ? (
          <Link
            to={routes.book(featured.id)}
            onClick={event => recordBookOpen(event, featured.id)}
            className="group flex shrink-0 items-end gap-5 rounded-control"
          >
            <BookCover
              title={featured.title}
              author={featured.author}
              coverUrl={featured.coverUrl}
              size="hero"
              className="w-[120px] sm:w-[160px]"
            />
            <span className="max-w-[12rem] pb-1">
              <span className="block text-label text-fg-2">{t('hero.newest')}</span>
              <span
                className="mt-1 block text-body font-semibold text-fg group-hover:underline"
                dir="auto"
              >
                {featured.title}
              </span>
              <span className="block text-small text-fg-2" dir="auto">
                {featured.author}
              </span>
            </span>
          </Link>
        ) : newest.isPending ? (
          <Skeleton className="aspect-[2/3] w-[120px] rounded-cover sm:w-[160px]" />
        ) : null}
      </section>

      <Shelf
        title={labels.newest}
        subtitle={t('newest.subtitle')}
        books={newest.data}
        pending={newest.isPending}
        fallback={
          newest.isError ? (
            <ErrorState
              message={describeError(newest.error)}
              onRetry={() => void newest.refetch()}
            />
          ) : null
        }
      />
    </div>
  );
};

export const HomePage = () => {
  const me = useMe();
  if (me.isPending) return <HeroSkeleton />;
  return me.data ? <ReaderHome /> : <WelcomeHome />;
};
