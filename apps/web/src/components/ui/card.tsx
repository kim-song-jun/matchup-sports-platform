import * as React from 'react';
import { cn } from '@/lib/utils';

const cardVariantClasses = {
  default: 'rounded-2xl border border-gray-100 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-gray-700 dark:bg-gray-800',
  surface:
    'rounded-2xl border border-gray-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-gray-700 dark:bg-gray-800',
  subtle: 'rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60',
} as const;

const cardPaddingClasses = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

type CardVariant = keyof typeof cardVariantClasses;
type CardPadding = keyof typeof cardPaddingClasses;

export function cardStyles({
  variant = 'default',
  padding = 'md',
  interactive = false,
}: {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}) {
  return cn(
    'ds-card',
    `ds-card-${variant}`,
    `ds-card-padding-${padding}`,
    cardVariantClasses[variant],
    cardPaddingClasses[padding],
    interactive &&
      'transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700',
  );
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}

export function Card({
  className,
  variant = 'default',
  padding = 'md',
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(cardStyles({ variant, padding, interactive }), className)}
      {...props}
    />
  );
}
