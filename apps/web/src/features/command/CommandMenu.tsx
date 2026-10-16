import { Role, ReadingState } from '@library/contracts';
import type { BookSummary } from '@library/contracts';
import { UI_LOCALES } from '@library/domain-config';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Heart,
  History,
  House,
  Languages,
  LayoutGrid,
  MessageSquareText,
  Moon,
  Package,
  Phone,
  Plus,
  Sun,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { routes } from '@/app/routes';
import { BookCover } from '@/components/BookCover';
import { Dialog } from '@/components/ui';
import { useCanTalk } from '@/features/ai/useVoice';
import { useMe } from '@/features/auth/queries';
import { useStartCall } from '@/features/call/useStartCall';
import { booksListOptions } from '@/features/catalog/queries';
import { useAddToShelf, useUpdateReadingState } from '@/features/shelf/mutations';
import { useShelf } from '@/features/shelf/queries';
import { useLabels } from '@/i18n/useLabels';
import { useDebounce } from '@/lib/useDebounce';
import { useChatStore } from '@/stores/chatStore';
import { useCommandStore } from '@/stores/commandStore';
import { loadMotion, loadedMotion, prefersMotion } from '@/lib/motionPrefs';
import { THEMES, toast, useUiStore } from '@/stores/uiStore';

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_MIN_CHARS = 2;
const BOOK_RESULTS = 6;
const BOOK_VALUE = 'book:';
const ASK_VALUE = 'ask:';
const MENU_STATES: ReadingState[] = [ReadingState.enum.WANT_TO_READ, ReadingState.enum.READING];

const Item = ({
  icon: Icon,
  children,
  value,
  keywords,
  onSelect,
}: {
  icon: LucideIcon;
  children: ReactNode;
  value: string;
  keywords?: string[];
  onSelect: () => void;
}) => (
  <Command.Item
    value={value}
    {...(keywords ? { keywords } : {})}
    onSelect={onSelect}
    className="command-item"
  >
    <Icon className="size-4 shrink-0 text-fg-2" aria-hidden="true" />
    <span className="min-w-0 truncate">{children}</span>
  </Command.Item>
);

const CommandMenu = () => {
  const { t } = useTranslation();
  const labels = useLabels();
  const navigate = useNavigate();
  const me = useMe();
  const shelf = useShelf();
  const canTalk = useCanTalk();
  const startCall = useStartCall();
  const openWithDraft = useChatStore(s => s.openWithDraft);
  const open = useCommandStore(s => s.open);
  const setOpen = useCommandStore(s => s.setOpen);
  const theme = useUiStore(s => s.theme);
  const setTheme = useUiStore(s => s.setTheme);
  const locale = useUiStore(s => s.locale);
  const setLocale = useUiStore(s => s.setLocale);
  const add = useAddToShelf();
  const update = useUpdateReadingState();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const dialog = inputRef.current?.closest('dialog');
    if (!dialog || !prefersMotion()) return;
    const motion = loadedMotion();
    if (motion) {
      motion.openMenu(dialog);
      return;
    }
    dialog.style.opacity = '0';
    void loadMotion()
      .then(loaded => loaded.openMenu(dialog))
      .catch(() => {
        dialog.style.opacity = '';
      });
  }, [open]);
  const [book, setBook] = useState<BookSummary | null>(null);
  const [highlighted, setHighlighted] = useState('');
  const query = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const books = useQuery({
    ...booksListOptions({ q: query, pageSize: BOOK_RESULTS }),
    enabled: open && book === null && query.length >= SEARCH_MIN_CHARS,
  });

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
    setBook(null);
  }, [setOpen]);
  const requestClose = useCallback(() => {
    const dialog = inputRef.current?.closest('dialog');
    const motion = loadedMotion();
    if (dialog && motion) motion.closeMenu(dialog, close);
    else close();
  }, [close]);
  const run = (action: () => void, { instant = false }: { instant?: boolean } = {}) => {
    if (instant) close();
    else requestClose();
    action();
  };
  const go = (to: string) => run(() => void navigate(to));

  const onKeyDown = (event: KeyboardEvent) => {
    if (book && event.key === 'Backspace' && search === '') {
      event.preventDefault();
      setBook(null);
    }
  };

  const entryOf = (bookId: number) => shelf.data?.find(entry => entry.book.id === bookId);
  const shelve = (target: BookSummary, state: ReadingState) =>
    run(() => {
      const entry = entryOf(target.id);
      const done = () =>
        toast(
          t(entry ? 'command.moved' : 'command.added', {
            state: labels.states[state],
            title: target.title,
          }),
          'success'
        );
      if (entry) update.mutate({ bookId: target.id, state }, { onSuccess: done });
      else add.mutate({ book: target, state }, { onSuccess: done });
    });

  const user = me.data;
  const typed = search.trim();
  const isLibrarian = user?.role === Role.enum.LIBRARIAN;
  const results = books.data?.items ?? [];
  const firstBook = query.length >= SEARCH_MIN_CHARS ? results[0]?.id : undefined;
  const [highlightedFor, setHighlightedFor] = useState<number | undefined>(undefined);
  if (firstBook !== highlightedFor) {
    setHighlightedFor(firstBook);
    if (firstBook !== undefined) setHighlighted(`${BOOK_VALUE}${firstBook}`);
  }
  const searching = query.length >= SEARCH_MIN_CHARS && (books.isFetching || query !== typed);

  const pages: { to: string; label: string; icon: LucideIcon }[] = [
    { to: routes.home, label: t('nav.home'), icon: House },
    { to: routes.catalog, label: labels.catalog, icon: LayoutGrid },
    { to: routes.shelf, label: labels.shelf, icon: Bookmark },
    { to: routes.favorites, label: labels.favoriteGenres, icon: Heart },
    ...(isLibrarian
      ? [
          {
            to: routes.librarian.books,
            label: t('nav.manage', { what: labels.items.toLowerCase() }),
            icon: Package,
          },
          {
            to: routes.librarian.newBook,
            label: t('command.newItem', { item: labels.item.toLowerCase() }),
            icon: Plus,
          },
          {
            to: routes.librarian.genres,
            label: t('nav.manage', { what: labels.genres.toLowerCase() }),
            icon: Tag,
          },
          { to: routes.librarian.activity, label: t('nav.activity'), icon: History },
        ]
      : []),
  ];
  const nextTheme = theme === THEMES.dark ? THEMES.light : THEMES.dark;

  return (
    <Dialog
      open={open}
      title={t('command.title')}
      onClose={close}
      onRequestClose={requestClose}
      variant="command"
    >
      <Command
        label={t('command.title')}
        loop
        value={highlighted}
        onValueChange={setHighlighted}
        className="flex min-h-0 flex-1 flex-col"
        filter={(value, text, keywords) => {
          if (value.startsWith(BOOK_VALUE) || value.startsWith(ASK_VALUE)) return 1;
          const haystack = `${value} ${(keywords ?? []).join(' ')}`.toLowerCase();
          return haystack.includes(text.toLowerCase()) ? 1 : 0;
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          {book ? (
            <span className="inline-flex max-w-[45%] shrink-0 items-center gap-1 truncate rounded-full bg-surface-2 px-2.5 py-1 text-meta font-semibold text-fg">
              <span className="truncate" dir="auto">
                {book.title}
              </span>
            </span>
          ) : null}
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            onKeyDown={onKeyDown}
            placeholder={book ? t('command.bookPlaceholder') : t('command.placeholder')}
            className="h-14 min-w-0 flex-1 bg-transparent text-body text-fg placeholder:text-fg-3 focus:outline-none focus-visible:outline-none"
          />
        </div>
        <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-small text-fg-2">
            {searching ? t('command.searching') : t('command.empty')}
          </Command.Empty>

          {book ? (
            <Command.Group heading={t('command.groups.book')} className="command-group">
              <Item
                icon={BookOpen}
                value={t('command.open')}
                onSelect={() => go(routes.book(book.id))}
              >
                {t('command.open')}
              </Item>
              {MENU_STATES.filter(state => entryOf(book.id)?.state !== state).map(state => (
                <Item
                  key={state}
                  icon={Bookmark}
                  value={labels.states[state]}
                  onSelect={() => shelve(book, state)}
                >
                  {t(entryOf(book.id) ? 'command.moveTo' : 'command.addTo', {
                    state: labels.states[state],
                  })}
                </Item>
              ))}
              <Item icon={ArrowLeft} value={t('command.back')} onSelect={() => setBook(null)}>
                {t('command.back')}
              </Item>
            </Command.Group>
          ) : (
            <>
              {results.length > 0 && query.length >= SEARCH_MIN_CHARS ? (
                <Command.Group heading={labels.items} className="command-group">
                  {results.map(result => {
                    const state = entryOf(result.id)?.state;
                    return (
                      <Command.Item
                        key={result.id}
                        value={`${BOOK_VALUE}${result.id}`}
                        onSelect={() => {
                          setBook(result);
                          setSearch('');
                        }}
                        className="command-item"
                      >
                        <BookCover
                          title={result.title}
                          author={result.author}
                          coverUrl={result.coverUrl}
                          className="w-6 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold" dir="auto">
                            {result.title}
                          </span>
                          <span className="block truncate text-meta text-fg-2" dir="auto">
                            {result.author}
                          </span>
                        </span>
                        {state ? (
                          <span className="shrink-0 text-meta text-fg-2">
                            {labels.states[state]}
                          </span>
                        ) : null}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ) : null}

              <Command.Group heading={t('command.groups.pages')} className="command-group">
                {pages.map(page => (
                  <Item
                    key={page.to}
                    icon={page.icon}
                    value={page.label}
                    onSelect={() => go(page.to)}
                  >
                    {page.label}
                  </Item>
                ))}
              </Command.Group>

              <Command.Group heading={t('command.groups.actions')} className="command-group">
                {canTalk ? (
                  <Item
                    icon={Phone}
                    value={t('call.start')}
                    onSelect={() => run(startCall, { instant: true })}
                  >
                    {t('call.start')}
                  </Item>
                ) : null}
                <Item
                  icon={nextTheme === THEMES.light ? Sun : Moon}
                  value={t(`command.theme.${nextTheme}`)}
                  keywords={[t('command.keywords.theme')]}
                  onSelect={() => run(() => setTheme(nextTheme))}
                >
                  {t(`command.theme.${nextTheme}`)}
                </Item>
                {UI_LOCALES.filter(code => code !== locale).map(code => (
                  <Item
                    key={code}
                    icon={Languages}
                    value={t('command.language', { language: t(`language.${code}`) })}
                    keywords={[t('command.keywords.language')]}
                    onSelect={() => run(() => setLocale(code))}
                  >
                    {t('command.language', { language: t(`language.${code}`) })}
                  </Item>
                ))}
              </Command.Group>
              {typed ? (
                <Command.Group heading={t('command.groups.librarian')} className="command-group">
                  <Item
                    icon={MessageSquareText}
                    value={`${ASK_VALUE}${typed}`}
                    onSelect={() => run(() => openWithDraft(typed), { instant: true })}
                  >
                    {t('command.ask', { text: typed })}
                  </Item>
                </Command.Group>
              ) : null}
            </>
          )}
        </Command.List>
        <p
          aria-hidden="true"
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 font-mono text-[0.75rem] text-fg-3"
        >
          <span>
            <kbd className="command-kbd">↑↓</kbd> {t('command.hints.move')}
          </span>
          <span>
            <kbd className="command-kbd">↵</kbd> {t('command.hints.select')}
          </span>
          {book ? (
            <span>
              <kbd className="command-kbd">⌫</kbd> {t('command.hints.back')}
            </span>
          ) : null}
          <span>
            <kbd className="command-kbd">esc</kbd> {t('command.hints.close')}
          </span>
        </p>
      </Command>
    </Dialog>
  );
};

export default CommandMenu;
