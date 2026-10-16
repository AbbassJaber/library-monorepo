import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'inverse' | 'secondary' | 'quiet' | 'danger';
type Size = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border border-transparent',
  inverse: 'bg-fg text-bg hover:opacity-90 border border-transparent',
  secondary: 'bg-transparent text-fg border border-line-strong hover:bg-fg/5',
  quiet: 'bg-transparent text-fg border border-transparent hover:bg-fg/5',
  danger: 'bg-transparent text-danger border border-danger hover:bg-danger-soft',
};

export const buttonSizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-small',
  sm: 'min-h-11 px-4 text-small',
};

export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? <Spinner className="size-4" /> : icon}
    {children}
  </button>
);
