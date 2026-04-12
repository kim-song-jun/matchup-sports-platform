import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelClassName?: string;
  contentClassName?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className,
  labelClassName,
  contentClassName,
  children,
  ...props
}: FormFieldProps) {
  const labelNode = (
    <span className={cn('text-sm font-semibold text-gray-700 dark:text-gray-300', labelClassName)}>
      {label}
      {required ? <span className="ml-1 text-red-400">*</span> : null}
    </span>
  );

  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="ds-field-label block">
          {labelNode}
        </label>
      ) : (
        <div>{labelNode}</div>
      )}
      <div className={contentClassName}>{children}</div>
      {hint ? <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
      {error ? <p className="text-xs text-red-500 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
