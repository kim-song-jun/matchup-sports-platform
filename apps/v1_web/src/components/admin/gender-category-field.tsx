'use client';

import { useId, type ReactNode } from 'react';
import type { V1TournamentGenderCategory } from '@/types/api';

export const GENDER_CATEGORY_OPTIONS = [
  ['mixed', '혼성'],
  ['male', '남성부'],
  ['female', '여성부'],
] as const satisfies ReadonlyArray<readonly [V1TournamentGenderCategory, string]>;

export function genderCategoryLabel(value: V1TournamentGenderCategory): string {
  return GENDER_CATEGORY_OPTIONS.find(([option]) => option === value)?.[1] ?? value;
}

/**
 * 대회·리그 생성(수정)이 같이 쓰는 성별 카테고리 선택. `''` 은 아직 안 고른 상태다 —
 * 리그 생성은 기본값 없이 고르게 해서 빈 값을 '다음' 을 막는 데 쓴다.
 */
export function GenderCategoryField({
  value,
  onChange,
  hint,
  disabled,
}: {
  value: V1TournamentGenderCategory | '';
  onChange: (value: V1TournamentGenderCategory) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const groupName = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">성별 카테고리</legend>
      {hint ? <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-caption)]">{hint}</p> : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {GENDER_CATEGORY_OPTIONS.map(([option, label]) => (
          <label
            key={option}
            className={[
              'grid min-h-[52px] place-items-center rounded-xl border text-[length:var(--font-size-body-sm)] font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500',
              disabled
                ? value === option
                  ? 'cursor-not-allowed border-[var(--border-strong)] bg-[var(--grey100)] text-[var(--text-body)]'
                  : 'cursor-not-allowed border-[var(--border)] bg-[var(--grey100)] font-medium text-[var(--text-caption)]'
                : value === option
                  ? 'cursor-pointer border-blue-500 bg-[var(--blue50)] text-[var(--blue700)]'
                  : 'cursor-pointer border-[var(--border)] text-[var(--text-body)]',
            ].join(' ')}
          >
            <input
              type="radio"
              name={groupName}
              checked={value === option}
              onChange={() => onChange(option)}
              disabled={disabled}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
