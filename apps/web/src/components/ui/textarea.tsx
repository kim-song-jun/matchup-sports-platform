import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputStyles } from '@/components/ui/input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return <textarea ref={ref} className={cn(inputStyles, 'min-h-[112px]', className)} {...props} />;
}
