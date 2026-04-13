import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputStyles } from '@/components/ui/input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputStyles, 'min-h-[112px]', className)} {...props} />
  ),
);

Textarea.displayName = 'Textarea';
