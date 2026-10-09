'use client';

import { useId } from 'react';

export const ADMIN_VISIBILITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '전체' },
  { value: 'public', label: '공개' },
  { value: 'hidden', label: '숨김' },
];

/** 대회·리그 어드민 목록 공용 공개 여부 필터. 값은 서버 `visibility` 파라미터 그대로다. */
export function AdminVisibilityFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="whitespace-nowrap text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)]">
        공개 여부
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        {ADMIN_VISIBILITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
