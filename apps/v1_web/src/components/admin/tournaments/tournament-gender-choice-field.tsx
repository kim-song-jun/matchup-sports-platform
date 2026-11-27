'use client';

import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { V1TournamentGenderCategory } from '@/types/api';

/** `'none'` 은 구분 없음 — 서버에는 성별 카테고리를 보내지 않는다. */
export type GenderChoice = V1TournamentGenderCategory | 'none';

export const GENDER_CHOICE_OPTIONS: ReadonlyArray<readonly [GenderChoice, string]> = [
  ['none', '구분 없음'],
  ['male', '남성부'],
  ['female', '여성부'],
  ['mixed', '혼성'],
];

interface TournamentGenderChoiceFieldProps {
  readonly value: GenderChoice;
  readonly onChange: (value: GenderChoice) => void;
  /** 이 칸에 「기본」 표시를 붙인다. */
  readonly defaultValue: GenderChoice;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
  /** 선택 칸 아래에 그릴 내용 — 혼성일 때 펼칠 인원 칸처럼 호출부가 정한다. */
  readonly children?: ReactNode;
}

/**
 * 대회 만들기·대회 정보가 같이 쓰는 성별 4칸 선택. 리그 생성의 `GenderCategoryField` 는 「구분 없음」 이 없어 따로 둔다.
 */
export function TournamentGenderChoiceField({
  value,
  onChange,
  defaultValue,
  disabled,
  hint,
  children,
}: TournamentGenderChoiceFieldProps) {
  const groupName = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">성별</legend>
      {hint ? <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-caption)]">{hint}</p> : null}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GENDER_CHOICE_OPTIONS.map(([option, label]) => {
          const selected = value === option;
          const badgeId = `${groupName}-${option}-default`;
          return (
            <label
              key={option}
              className={[
                'flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl border px-2 text-[length:var(--font-size-body-sm)] font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500',
                disabled
                  ? selected
                    ? 'cursor-not-allowed border-[var(--border-strong)] bg-[var(--grey100)] text-[var(--text-body)]'
                    : 'cursor-not-allowed border-[var(--border)] bg-[var(--grey100)] font-medium text-[var(--text-caption)]'
                  : selected
                    ? 'cursor-pointer border-blue-500 bg-[var(--blue50)] text-[var(--blue700)]'
                    : 'cursor-pointer border-[var(--border)] text-[var(--text-body)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name={groupName}
                checked={selected}
                onChange={() => onChange(option)}
                disabled={disabled}
                aria-describedby={option === defaultValue ? badgeId : undefined}
                className="sr-only"
              />
              {selected ? <Check size={14} aria-hidden="true" /> : null}
              {label}
              {/* aria-hidden 이어도 aria-describedby 가 직접 가리키면 설명으로 읽힌다 — 칸 이름에는 섞이지 않는다. */}
              {option === defaultValue ? (
                <span
                  id={badgeId}
                  aria-hidden="true"
                  className="text-[length:var(--font-size-caption)] font-medium text-[var(--text-caption)]"
                >
                  기본
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {children}
    </fieldset>
  );
}
