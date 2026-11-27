'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { V1Tournament } from '@/types/api';
import { tournamentInfoNeeds, type InfoNeedKey } from '../info-sections';
import type { BuildResult, InfoSummaryBadgeTone, InfoSummaryRow } from './types';

/** 섹션 폼 입력칸의 id — 딥링크 초점과 오류 이동이 이 id 로 칸을 찾는다. */
export const infoFieldId = (field: string) => `info-${field}`;

/** 요약 줄 배지의 고정 문구. */
export const NEEDED_BADGE: InfoSummaryRow['badge'] = { tone: 'needed', text: '채워야 해요' };
export const OPTIONAL_BADGE: InfoSummaryRow['badge'] = { tone: 'optional', text: '선택' };
export const DEFAULT_BADGE: InfoSummaryRow['badge'] = { tone: 'default', text: '기본값' };
export const SPORT_DEFAULT_BADGE: InfoSummaryRow['badge'] = { tone: 'default', text: '종목 기본값' };

/** 「필요」 등급으로 남은 항목 — 요약 줄의 「채워야 해요」 가 개요의 채워야 할 설정과 같은 판정을 쓴다. */
export function requiredNeedKeys(tournament: V1Tournament): ReadonlySet<InfoNeedKey> {
  return new Set(
    tournamentInfoNeeds(tournament)
      .filter((need) => need.tier === 'required')
      .map((need) => need.key),
  );
}

interface FieldError {
  fieldId: string;
  message: string;
}

/** 섹션 폼의 입력 초안 — 처음 값과 달라졌는지와, 저장을 막은 칸의 오류를 함께 든다. */
export function useSectionDraft<Draft>(
  base: V1Tournament,
  toDraft: (tournament: V1Tournament) => Draft,
  onDirtyChange: (dirty: boolean) => void,
  /** 이 초안 밖에서 든 변경(예: 경기 시간) — 섹션의 「바뀜」 에 함께 센다. */
  extraDirty = false,
) {
  const [initial] = useState(() => toDraft(base));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<FieldError | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    onDirtyChange(dirty || extraDirty);
  }, [dirty, extraDirty, onDirtyChange]);

  const set = useCallback(<Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }, []);

  const fail = useCallback((fieldId: string, message: string): BuildResult => {
    setError({ fieldId, message });
    return { ok: false, fieldId, message };
  }, []);

  const errorFor = (fieldId: string) => (error?.fieldId === fieldId ? error.message : undefined);

  return { draft, initial, set, setDraft, dirty, fail, errorFor, clearError: () => setError(null) };
}

export const fieldInputCls =
  'h-[44px] w-full rounded-xl border bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
export const fieldTextareaCls =
  'w-full resize-none rounded-xl border bg-[var(--card-surface)] px-3 py-3 text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
export const fieldBorderCls = (invalid: boolean) =>
  invalid ? 'border-[var(--red700)] focus:border-[var(--red700)]' : 'border-[var(--border)] focus:border-blue-500';

const BADGE_TONE_CLS: Record<InfoSummaryBadgeTone, string> = {
  needed: 'bg-[var(--tint-orange)] text-[var(--orange700)]',
  default: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
  optional: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
  off: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
};

export function InfoBadge({ tone, children }: { tone: InfoSummaryBadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-semibold ${BADGE_TONE_CLS[tone]}`}
    >
      {children}
    </span>
  );
}

/** 시트 안의 한 묶음 — 묶음 사이는 1px 선으로만 나눈다. */
export function FormGroup({
  title,
  badge,
  hint,
  children,
}: {
  title?: string;
  badge?: InfoSummaryRow['badge'];
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-[var(--border)] py-4 last:border-b-0">
      {title ? (
        <p className="mb-2 flex items-center gap-1.5 text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">
          {title}
          {badge ? <InfoBadge tone={badge.tone}>{badge.text}</InfoBadge> : null}
        </p>
      ) : null}
      {children}
      {hint ? <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/** 라벨·입력·한 줄 도움말·오류를 한 칸으로 묶는다. 오류는 칸 바로 아래에 나오고 입력과 `aria-describedby` 로 이어진다. */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (control: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-[var(--red700)]">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : null}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[length:var(--font-size-caption)] text-[var(--red700)]">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** 숫자·짧은 글 한 줄 입력 — 단위(명·원·분)는 칸 안 오른쪽에 붙인다. */
export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  unit,
  required,
  disabled,
  inputMode,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  unit?: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      {(control) => (
        <div className="relative">
          <input
            {...control}
            type="text"
            inputMode={inputMode}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder}
            className={`${fieldInputCls} ${fieldBorderCls(Boolean(error))} ${unit ? 'pr-10' : ''}`}
          />
          {unit ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--font-size-label)] text-[var(--text-muted)]">
              {unit}
            </span>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** 두세 개 중 하나를 고르는 버튼 줄 — 고른 칸은 옅은 배경과 테두리 색, 체크 표시 대신 `aria-pressed` 로 알린다. */
export function ChoiceButtons<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value | null;
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-[44px] min-w-[72px] items-center justify-center rounded-xl border px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
              selected
                ? 'border-blue-500 bg-[var(--blue50)] text-[var(--blue700)]'
                : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 빈 글은 `null`, 아니면 앞뒤 공백을 뗀 글. */
export const textOrNull = (value: string): string | null => value.trim() || null;
