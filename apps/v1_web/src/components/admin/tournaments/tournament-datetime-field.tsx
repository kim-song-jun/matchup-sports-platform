'use client';

import { KST_OFFSET_MS } from '@/lib/kst-calendar';

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
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]"
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-[var(--red700)]">*</span>
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
          'h-[44px] w-full rounded-xl border bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)]',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50',
          error
            ? 'border-[var(--red700)] focus:border-[var(--red700)]'
            : 'border-[var(--border)] focus:border-blue-500',
        ].join(' ')}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          data-error-focus={id}
          className="text-[length:var(--font-size-caption)] text-[var(--red700)]"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// datetime-local 값은 오프셋 없는 벽시계 문자열이다. 대회 일정은 전부 KST 기준이라
// 브라우저 시간대와 무관하게 KST 로 읽고 쓴다(서버로 가는 값은 ISO UTC).
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const parsed = new Date(`${withSeconds}+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}
