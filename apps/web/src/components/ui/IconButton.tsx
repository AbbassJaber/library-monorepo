import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
}

export const IconButton = ({
  label,
  icon,
  active = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    aria-pressed={rest['aria-pressed'] ?? (active ? true : undefined)}
    className={cn(
      'inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-transparent text-fg-2 transition-colors hover:bg-fg/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40',
      active && 'bg-surface-2 text-fg',
      className
    )}
    {...rest}
  >
    {icon}
  </button>
);
