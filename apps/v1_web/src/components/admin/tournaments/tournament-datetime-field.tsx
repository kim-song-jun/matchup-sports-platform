'use client';

type TournamentDatetimeFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
  min?: string;
};

export function TournamentDatetimeField({
  id,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  hint,
  error,
  min,
}: TournamentDatetimeFieldProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[var(--font-size-label)] font-semibold text-[var(--text-body)]"
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-[var(--red500)]">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : null}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        className={[
          'h-[44px] w-full rounded-xl border bg-white px-3 text-[var(--font-size-label)] text-[var(--text-strong)]',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50',
          error
            ? 'border-[var(--red500)] focus:border-[var(--red500)]'
            : 'border-[var(--border)] focus:border-blue-500',
        ].join(' ')}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-[var(--font-size-caption)] text-[var(--red500)]"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-[var(--font-size-caption)] text-[var(--text-caption)]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
