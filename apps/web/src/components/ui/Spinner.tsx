import { cn } from '@/lib/cn';

export const Spinner = ({ className, label }: { className?: string; label?: string }) => (
  <span
    role={label ? 'status' : undefined}
    aria-label={label}
    className={cn('inline-block', className)}
  >
    <svg
      viewBox="0 0 24 24"
      className="size-full animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  </span>
);
