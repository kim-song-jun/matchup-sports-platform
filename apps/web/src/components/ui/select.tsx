import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputStyles } from '@/components/ui/input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({
  className,
  ref,
  ...props
}: SelectProps) {
  return <select ref={ref} className={cn(inputStyles, className)} {...props} />;
}
