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
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;

  const labelNode = (
    <span className={cn('text-sm font-semibold text-gray-700 dark:text-gray-300', labelClassName)}>
      {label}
      {required ? <span className="ml-1 text-red-400">*</span> : null}
    </span>
  );

  // Inject aria-describedby into the direct child Input element when an error is present.
  const enhancedChildren =
    errorId && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          'aria-describedby':
            (children as React.ReactElement<Record<string, unknown>>).props['aria-describedby'] ??
            errorId,
        })
      : children;

  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="ds-field-label block">
          {labelNode}
        </label>
      ) : (
        <div>{labelNode}</div>
      )}
      <div className={contentClassName}>{enhancedChildren}</div>
      {hint ? <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
