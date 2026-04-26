import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type FilterChipSize = 'sm' | 'md';
export type FilterChipVariant = 'neutral' | 'tonal';

export interface FilterChipProps {
  active: boolean;
  children: ReactNode;
  count?: number;
  size?: FilterChipSize;
  variant?: FilterChipVariant;
  onClick?: () => void;
  ariaLabel?: string;
  asLink?: { href: string };
  className?: string;
}

const sizeClasses: Record<FilterChipSize, string> = {
  sm: 'min-h-[30px] px-3 text-sm',
  md: 'min-h-[36px] px-3.5 text-sm',
};

const variantInactiveClasses: Record<FilterChipVariant, string> = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  tonal: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
};

const variantActiveClasses: Record<FilterChipVariant, string> = {
  neutral: 'bg-blue-500 text-white dark:bg-blue-500',
  tonal: 'bg-blue-500 text-white',
};

function chipClasses({
  size = 'md',
  variant = 'neutral',
  active,
  className,
}: {
  size?: FilterChipSize;
  variant?: FilterChipVariant;
  active: boolean;
  className?: string;
}) {
  return cn(
    'inline-flex items-center justify-center rounded-full font-medium',
    'transition-transform duration-150 active:scale-[0.98]',
    'cursor-pointer select-none',
    sizeClasses[size],
    active ? variantActiveClasses[variant] : variantInactiveClasses[variant],
    className,
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs text-white"
    >
      {count}
    </span>
  );
}

export function FilterChip({
  active,
  children,
  count,
  size = 'md',
  variant = 'neutral',
  onClick,
  ariaLabel,
  asLink,
  className,
}: FilterChipProps) {
  const classes = chipClasses({ size, variant, active, className });
  const showBadge = typeof count === 'number' && count > 0;

  const content = (
    <>
      {children}
      {showBadge && <CountBadge count={count} />}
    </>
  );

  if (asLink) {
    return (
      <Link
        href={asLink.href}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={classes}
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      className={classes}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {content}
    </button>
  );
}
