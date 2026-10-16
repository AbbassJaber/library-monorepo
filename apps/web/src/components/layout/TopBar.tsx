import { Role } from '@library/contracts';
import { LogOut, Menu, Phone, Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { routes } from '@/app/routes';
import { Button, Dialog, IconButton, LinkButton } from '@/components/ui';
import { ChatLauncher } from '@/features/ai/ChatLauncher';
import { useAiStatus } from '@/features/ai/queries';
import { useCanTalk } from '@/features/ai/useVoice';
import { useLogout, useMe } from '@/features/auth/queries';
import { useStartCall } from '@/features/call/useStartCall';
import { catalogSearchHref } from '@/features/catalog/useCatalogParams';
import { cn } from '@/lib/cn';
import { SHORTCUTS, isApplePlatform, shortcutLabel } from '@/lib/shortcuts';
import { useCommandStore } from '@/stores/commandStore';
import { MainNav, Wordmark } from './MainNav';
import { LanguageSwitcher, ThemeToggle } from './Preferences';

const MENU_OFFSET_PX = 8;

const SearchField = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAiStatus();
  const byMeaning = status.data?.features.HYBRID_SEARCH === true;
  const [text, setText] = useState('');
  const inputId = useId();
  const openCommandMenu = useCommandStore(s => s.setOpen);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const q = text.trim();
    if (q) void navigate(catalogSearchHref(q, byMeaning));
  };

  return (
    <form role="search" onSubmit={onSubmit} className={cn('relative min-w-0', className)}>
      <label htmlFor={inputId} className="sr-only">
        {t('search.label')}
      </label>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-fg-3"
        aria-hidden="true"
      />
      <input
        id={inputId}
        type="search"
        dir="auto"
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder={byMeaning ? t('search.placeholder') : t('search.placeholderPlain')}
        className="h-12 w-full rounded-control-lg border border-line bg-input pl-10 pr-16 text-small text-fg placeholder:text-fg-3 hover:border-line-strong"
      />
      <button
        type="button"
        onClick={() => openCommandMenu(true)}
        aria-label={t('command.openMenu')}
        aria-keyshortcuts={isApplePlatform() ? 'Meta+K' : 'Control+K'}
        className="absolute right-1 top-1/2 hidden min-h-11 -translate-y-1/2 items-center rounded-control px-2 text-fg-3 hover:text-fg sm:inline-flex"
      >
        <kbd className="rounded-[6px] border border-line-strong px-1.5 py-0.5 text-[0.7rem]">
          {shortcutLabel(SHORTCUTS.commandMenu)}
        </kbd>
      </button>
    </form>
  );
};

const CallButton = () => {
  const { t } = useTranslation();
  const startCall = useStartCall();
  return (
    <Button
      onClick={startCall}
      icon={<Phone className="size-[1.1rem]" aria-hidden="true" />}
      className="size-11 px-0 xl:w-auto xl:px-5"
    >
      <span className="sr-only xl:not-sr-only">{t('call.start')}</span>
    </Button>
  );
};

const AccountMenu = () => {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = me.data;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== 'open') return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      menu.style.top = `${rect.bottom + MENU_OFFSET_PX}px`;
      menu.style.right = `${window.innerWidth - rect.right}px`;
    };
    menu.addEventListener('beforetoggle', place);
    return () => menu.removeEventListener('beforetoggle', place);
  }, []);

  if (!user) return null;
  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={menuId}
        aria-label={t('account.label', { name: user.displayName })}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-small font-semibold text-fg hover:bg-fg/10"
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        className="fixed left-auto w-64 rounded-control-lg border border-line bg-surface-2 p-2 shadow-pop"
      >
        <div className="px-3 pb-2 pt-1.5">
          <p className="truncate font-semibold text-fg" dir="auto">
            {user.displayName}
          </p>
          <p className="truncate text-meta text-fg-3">{user.email}</p>
          <p className="mt-1 text-meta text-fg-2">
            {user.role === Role.enum.LIBRARIAN ? t('account.librarian') : t('account.reader')}
          </p>
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-control px-3 text-left text-small font-medium text-fg hover:bg-fg/5"
          onClick={() => {
            menuRef.current?.hidePopover?.();
            logout.mutate(undefined, { onSettled: () => void navigate(routes.home) });
          }}
        >
          <LogOut className="size-4 text-fg-2" aria-hidden="true" />
          {t('auth.logOut')}
        </button>
      </div>
    </>
  );
};

const MobileMenu = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <IconButton
        label={t('nav.openMenu')}
        icon={<Menu className="size-5" aria-hidden="true" />}
        onClick={() => setOpen(true)}
        className="lg:hidden"
        aria-haspopup="dialog"
      />
      <Dialog open={open} title={t('nav.menu')} onClose={close} variant="sheet">
        <MainNav onNavigate={close} />
        <div className="mt-auto flex flex-col gap-2 px-2 pt-6">
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="flex-1" />
            <ThemeToggle />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export const TopBar = () => {
  const { t } = useTranslation();
  const me = useMe();
  const canTalk = useCanTalk();
  const user = me.data ?? null;
  return (
    <header className="border-b border-line lg:border-b-0">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8 lg:gap-3 lg:py-5">
        <MobileMenu />
        <Wordmark className="lg:hidden" />
        {user ? (
          <SearchField className="order-last basis-full md:order-none md:flex-1 md:basis-auto" />
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {canTalk ? <CallButton /> : null}
              <ChatLauncher />
              <AccountMenu />
            </>
          ) : (
            <>
              <LinkButton to={routes.login} variant="quiet">
                {t('auth.logIn')}
              </LinkButton>
              <LinkButton
                to={routes.register}
                variant="secondary"
                className="hidden sm:inline-flex"
              >
                {t('auth.register')}
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
