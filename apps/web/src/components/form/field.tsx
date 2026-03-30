import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  id?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  hint?: string;
  error?: string;
}

export function Field({ label, id, required, children, className, hint, error }: FieldProps) {
  return (
    <div className={className ?? 'mb-5'}>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
