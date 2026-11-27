'use client';

import { AlertCircle, Minus, Plus } from 'lucide-react';
import { onlyDigits } from '@/lib/number-format';
import {
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  describeFormatOutcome,
  type CreateFormatChoice,
} from './create-form-model';

const INPUT_ID = 'create-team-count';
const ERROR_ID = `${INPUT_ID}-error`;
const OUTCOME_ID = `${INPUT_ID}-outcome`;

export function CreateTeamCountField({
  value,
  format,
  error,
  disabled,
  onStep,
  onChange,
}: {
  value: string;
  format: CreateFormatChoice;
  error?: string;
  disabled?: boolean;
  onStep: (delta: 1 | -1) => void;
  onChange: (value: string) => void;
}) {
  // 입력은 숫자만 받으므로 빈 칸이 아니면 항상 정수다.
  const count = value === '' ? null : Number(value);
  const outcome = count === null ? '' : describeFormatOutcome(format, count);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={INPUT_ID} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
        팀 수
        <span aria-hidden="true" className="ml-0.5 text-[var(--red700)]">*</span>
        <span className="sr-only"> (필수)</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="한 팀 줄이기"
          disabled={disabled || (count !== null && count <= TEAM_COUNT_MIN)}
          onClick={() => onStep(-1)}
          className="tm-btn tm-btn-outline tm-btn-icon"
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <input
          id={INPUT_ID}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(onlyDigits(event.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? ERROR_ID : OUTCOME_ID}
          className="tm-input max-w-[84px] text-center"
        />
        <span aria-hidden="true" className="text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">팀</span>
        <button
          type="button"
          aria-label="한 팀 늘리기"
          disabled={disabled || (count !== null && count >= TEAM_COUNT_MAX)}
          onClick={() => onStep(1)}
          className="tm-btn tm-btn-outline tm-btn-icon"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <div id={OUTCOME_ID} aria-live="polite">
        {outcome ? (
          <p className="text-[length:var(--font-size-label)] text-[var(--text-body)]">{outcome}</p>
        ) : null}
      </div>
      {error ? (
        <p
          id={ERROR_ID}
          role="alert"
          data-error-focus={INPUT_ID}
          className="flex items-center gap-1 text-[length:var(--font-size-caption)] text-[var(--red700)]"
        >
          <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
