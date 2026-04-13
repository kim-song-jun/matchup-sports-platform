import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputStyles } from '@/components/ui/input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(inputStyles, className)} {...props} />
));

Select.displayName = 'Select';
