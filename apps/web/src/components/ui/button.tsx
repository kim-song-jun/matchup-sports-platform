import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariantClasses = {
  primary:
    'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700',
  secondary:
    'bg-gray-900 text-white hover:bg-gray-800 active:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100',
  outline:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
  subtle:
    'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700',
  danger:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  dangerSoft:
    'border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50',
} as const;

const buttonSizeClasses = {
  sm: 'min-h-[44px] rounded-xl px-3.5 py-2 text-sm font-semibold',
  md: 'min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold',
  lg: 'min-h-[48px] rounded-2xl px-5 py-3.5 text-base font-bold',
} as const;

type ButtonVariant = keyof typeof buttonVariantClasses;
type ButtonSize = keyof typeof buttonSizeClasses;

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return cn(
    'ds-button inline-flex items-center justify-center gap-2 text-center transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:pointer-events-none disabled:opacity-50',
    `ds-button-${variant}`,
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    fullWidth && 'w-full',
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}
