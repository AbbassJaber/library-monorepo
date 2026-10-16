import { X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { Button, buttonBase, buttonSizes, buttonVariants } from './Button';
import type { ButtonVariant } from './Button';

export { Button } from './Button';
export { IconButton } from './IconButton';
export { Spinner } from './Spinner';
export { Field, Input, Select, Textarea, inputClass } from './Field';
export { Dialog } from './Dialog';

export const SkipLink = () => {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:font-semibold focus:text-accent-ink"
    >
      {t('nav.skipToContent')}
    </a>
  );
};

export const VisuallyHidden = ({ children }: { children: ReactNode }) => (
  <span className="sr-only">{children}</span>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={cn(
      'animate-pulse rounded-control-sm bg-surface-2 motion-reduce:animate-none',
      className
    )}
  />
);

export const Badge = ({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'strong' | 'danger' | 'accent';
  className?: string;
}) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-meta font-semibold',
      tone === 'neutral' && 'bg-surface-2 text-fg-2',
      tone === 'strong' && 'bg-pill text-pill-fg',
      tone === 'danger' && 'bg-danger-soft text-danger',
      tone === 'accent' && 'bg-accent-soft text-link',
      className
    )}
  >
    {children}
  </span>
);

export const Chip = ({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove?: () => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface pl-4 text-small',
        onRemove ? 'pr-1' : 'pr-3',
        className
      )}
    >
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('actions.remove', { label })}
          className="inline-flex size-9 items-center justify-center rounded-full hover:bg-fg/5"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
};

export const EmptyState = ({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="rounded-panel border border-line bg-surface px-6 py-10 text-center">
    <h2 className="text-h2">{title}</h2>
    {children ? <p className="mx-auto mt-2 max-w-prose text-fg-2">{children}</p> : null}
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </div>
);

export const ErrorState = ({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="rounded-panel border border-danger/40 bg-danger-soft px-6 py-8 text-center"
    >
      <h2 className="text-h2">{title ?? t('errors.title')}</h2>
      {message ? <p className="mt-2 text-fg-2">{message}</p> : null}
      {onRetry ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            {t('actions.tryAgain')}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export const PageHeading = ({
  title,
  lede,
  aside,
  className,
}: {
  title: string;
  lede?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) => (
  <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
    <div>
      <h1 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-h1">
        {title}
      </h1>
      {lede ? <p className="mt-2 max-w-prose text-fg-2">{lede}</p> : null}
    </div>
    {aside}
  </div>
);

export const LinkButton = ({
  to,
  children,
  className,
  variant = 'primary',
}: {
  to: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
}) => (
  <Link
    to={to}
    className={cn('target', buttonBase, buttonVariants[variant], buttonSizes.md, className)}
  >
    {children}
  </Link>
);

export const Card = ({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-panel border border-line bg-surface', className)} {...rest}>
    {children}
  </div>
);
