'use client';

import { useId } from 'react';
import { useV1TournamentFields } from '@/hooks/use-v1-api';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';

/** Same registered field choices for league and tournament fixture settings. */
export function CompetitionFieldPicker({ tournamentId, value, onChange, disabled = false, allowNew = true, allowEmpty = false, emptyLabel = '새 경기장 등록 · 장소 검색/입력' }: {
  tournamentId: string;
  value: string;
  onChange: (fieldId: string) => void;
  disabled?: boolean;
  allowNew?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  const fields = useV1TournamentFields(tournamentId);
  const options = fields.data?.items ?? [];
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
    <label htmlFor={id} className="tm-text-label">등록된 경기장(필드)</label>
    <select id={id} className="tm-input" value={value} onChange={(event) => onChange(event.target.value)}
      disabled={disabled || fields.isPending || fields.isError}>
      <option value="" disabled={!allowNew && !allowEmpty}>{emptyLabel}</option>
      {value && !options.some((field) => field.id === value) ? <option value={value}>현재 배정된 경기장</option> : null}
      {options.filter((field) => field.active || field.id === value).map((field) =>
        <option key={field.id} value={field.id} disabled={!field.active}>{field.name}{field.active ? '' : ' (사용 안 함)'}</option>)}
    </select>
    {fields.isError ? <ErrorState compact message={extractErrorMessage(fields.error, '경기장 목록을 불러오지 못했어요.')}
      onRetry={() => void fields.refetch()} /> :
      <p className="tm-text-caption" style={{ margin: 0 }}>{fields.isPending ? '경기장을 불러오는 중이에요.' :
        allowNew ? '등록된 경기장을 선택하거나 새 장소를 입력해 주세요. 새 장소도 저장하면 경기장으로 등록·배정돼요.' : allowEmpty ? '등록된 경기장을 선택하거나 미배정으로 둘 수 있어요.' : '등록된 경기장을 선택해 주세요.'}</p>}
  </div>;
}
