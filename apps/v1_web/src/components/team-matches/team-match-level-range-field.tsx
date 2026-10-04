'use client';

import { useId } from 'react';
import { FieldErrorText } from '@/components/v1-ui/create-form-fields';
import { formatTeamMatchLevelRange, parseTeamMatchLevelRange } from '@/lib/team-match-level-range';
import { V1_LEVELS } from '@/lib/v1-levels';

/** 서버가 이미 지원하는 연속 범위를 생성/편집 모두 같은 두 선택으로 입력한다. */
export function TeamMatchLevelRangeField({ value, onChange, error }: {
  value: string; onChange?: (value: string) => void; error?: string;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const range = parseTeamMatchLevelRange(value);
  const min = range?.minLevelCode ?? '';
  const max = range?.maxLevelCode ?? '';
  const invalid = range === null;
  const change = (endpoint: 'min' | 'max', code: string) => {
    if (!code) { onChange?.(''); return; }
    let nextMin = endpoint === 'min' ? code : min || code;
    let nextMax = endpoint === 'max' ? code : max || code;
    if (V1_LEVELS.findIndex((level) => level.code === nextMin) > V1_LEVELS.findIndex((level) => level.code === nextMax)) {
      if (endpoint === 'min') nextMax = nextMin; else nextMin = nextMax;
    }
    // 한 번의 갱신으로 두 끝점을 기록해 즉시 다음 단계로 가거나 연속 입력해도 값이 갈리지 않는다.
    onChange?.(formatTeamMatchLevelRange(nextMin, nextMax));
  };
  return (
    <div className="tm-create-field">
      <div className="tm-text-label">실력등급</div>
      <div className="tm-create-two-col">
        {(['min', 'max'] as const).map((endpoint) => (
          <label key={endpoint} className="tm-create-field">
            <span className="tm-text-label">{endpoint === 'min' ? '최소 등급' : '최대 등급'}</span>
            <select id={`${fieldId}-${endpoint}`} data-team-match-field={endpoint === 'min' ? 'grade' : undefined} className="tm-create-input tm-create-select-control"
              value={invalid ? 'invalid' : endpoint === 'min' ? min : max} aria-invalid={Boolean(error) || invalid}
              aria-describedby={error || invalid ? errorId : undefined} onChange={(event) => change(endpoint, event.target.value)}>
              {invalid ? <option value="invalid" disabled>등급을 다시 선택해 주세요</option> : null}
              <option value="">미설정</option>
              {V1_LEVELS.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <FieldErrorText id={errorId} message={error ?? (invalid ? '실력등급을 다시 선택해 주세요.' : undefined)} />
    </div>
  );
}
