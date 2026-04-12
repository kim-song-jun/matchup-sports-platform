import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputStyles =
  'ds-input w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:bg-gray-900';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({
  className,
  ref,
  ...props
}: InputProps) {
  return <input ref={ref} className={cn(inputStyles, className)} {...props} />;
}
