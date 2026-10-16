import { Role } from '@library/contracts';
import { Bookmark, Heart, History, House, LayoutGrid, Package, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { routes } from '@/app/routes';
import { useMe } from '@/features/auth/queries';
import { useLabels } from '@/i18n/useLabels';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/domain';

const Mark = () => (
  <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
    <rect x="3" y="4" width="4" height="16" rx="1" fill="currentColor" />
    <rect x="9" y="4" width="4" height="16" rx="1" fill="currentColor" />
    <rect
      x="15.5"
      y="4.2"
      width="4"
      height="16"
      rx="1"
      fill="var(--accent)"
      transform="rotate(-14 17.5 12.2)"
    />
  </svg>
);

export const Wordmark = ({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: (() => void) | undefined;
}) => (
  <Link
    to={routes.home}
    onClick={onNavigate}
    className={cn(
      'target inline-flex items-center gap-2 rounded-control px-2 text-[1.2rem] font-bold tracking-[-0.02em] text-fg',
      className
    )}
  >
    <Mark />
    {APP_NAME}
  </Link>
);

const NavItem = ({
  to,
  icon: Icon,
  children,
  end = false,
  onNavigate,
}: {
  to: string;
  icon: LucideIcon;
  children: string;
  end?: boolean;
  onNavigate?: (() => void) | undefined;
}) => (
  <li>
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'target flex items-center gap-3 rounded-control px-3 text-small transition-colors',
          isActive
            ? 'bg-surface-2 font-semibold text-fg'
            : 'font-medium text-fg-2 hover:bg-fg/5 hover:text-fg'
        )
      }
    >
      <Icon className="size-[1.15rem] shrink-0" aria-hidden="true" />
      {children}
    </NavLink>
  </li>
);

export const MainNav = ({
  onNavigate,
  withWordmark = false,
}: {
  onNavigate?: () => void;
  withWordmark?: boolean;
}) => {
  const { t } = useTranslation();
  const labels = useLabels();
  const me = useMe();
  const user = me.data ?? null;
  const librarianId = useId();
  return (
    <nav aria-label={t('nav.main')} className="flex flex-col">
      {withWordmark ? <Wordmark className="mb-5" onNavigate={onNavigate} /> : null}
      <ul className="flex flex-col gap-1">
        <NavItem to={routes.home} icon={House} end onNavigate={onNavigate}>
          {t('nav.home')}
        </NavItem>
        {user ? (
          <>
            <NavItem to={routes.catalog} icon={LayoutGrid} onNavigate={onNavigate}>
              {labels.catalog}
            </NavItem>
            <NavItem to={routes.shelf} icon={Bookmark} onNavigate={onNavigate}>
              {labels.shelf}
            </NavItem>
            <NavItem to={routes.favorites} icon={Heart} onNavigate={onNavigate}>
              {labels.favoriteGenres}
            </NavItem>
          </>
        ) : null}
      </ul>
      {user?.role === Role.enum.LIBRARIAN ? (
        <div role="group" aria-labelledby={librarianId} className="mt-6">
          <p id={librarianId} className="mb-1 px-3 text-meta font-semibold text-fg-3">
            {t('nav.librarian')}
          </p>
          <ul className="flex flex-col gap-1">
            <NavItem to={routes.librarian.books} icon={Package} onNavigate={onNavigate}>
              {t('nav.manage', { what: labels.items.toLowerCase() })}
            </NavItem>
            <NavItem to={routes.librarian.genres} icon={Tag} onNavigate={onNavigate}>
              {t('nav.manage', { what: labels.genres.toLowerCase() })}
            </NavItem>
            <NavItem to={routes.librarian.activity} icon={History} onNavigate={onNavigate}>
              {t('nav.activity')}
            </NavItem>
          </ul>
        </div>
      ) : null}
    </nav>
  );
};
