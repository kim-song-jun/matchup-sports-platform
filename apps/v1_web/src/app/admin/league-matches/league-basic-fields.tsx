'use client';

import { useId } from 'react';
import { DATE_INPUT_MAX } from '@/lib/kst-calendar';

export const leagueInputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
export const leagueLabelClass = 'mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]';

export interface LeagueBasicValue {
  title: string;
  sportId: string;
  regionId: string;
  startsOn: string;
  endsOn: string;
}

/** 생성·수정의 기본 입력 순서, 스타일과 날짜 범위 검증을 공유한다. */
export function LeagueBasicFields({ value, onChange, sports, regions, sportLocked, sportHint, disabled }: {
  value: LeagueBasicValue;
  onChange: (field: keyof LeagueBasicValue, value: string) => void;
  sports: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  sportLocked?: boolean;
  sportHint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const rangeError = value.startsOn && value.endsOn && value.endsOn < value.startsOn
    ? '종료일은 시작일보다 빠를 수 없어요.' : null;
  return <fieldset disabled={disabled} className="min-w-0 space-y-5" aria-label="기본 정보">
    <div>
      <label htmlFor={`${id}-title`} className={leagueLabelClass}>리그 이름</label>
      <input id={`${id}-title`} value={value.title} onChange={e => onChange('title', e.target.value)} maxLength={100} required className={leagueInputClass} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={`${id}-sport`} className={leagueLabelClass}>종목</label>
        <select id={`${id}-sport`} value={value.sportId} onChange={e => onChange('sportId', e.target.value)} disabled={sportLocked} className={leagueInputClass}>
          <option value="">종목 선택</option>
          {sports.map(sport => <option key={sport.id} value={sport.id}>{sport.name}</option>)}
        </select>
        {sportHint && <p className="mt-1 tm-text-caption text-[var(--text-muted)]">{sportHint}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-region`} className={leagueLabelClass}>지역</label>
        <select id={`${id}-region`} value={value.regionId} onChange={e => onChange('regionId', e.target.value)} required className={leagueInputClass}>
          <option value="">지역 선택</option>
          {value.regionId && !regions.some(region => region.id === value.regionId) && <option value={value.regionId}>현재 저장된 지역</option>}
          {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={`${id}-start`} className={leagueLabelClass}>시작일</label>
        <input id={`${id}-start`} type="date" max={DATE_INPUT_MAX} required value={value.startsOn} onChange={e => onChange('startsOn', e.target.value)} className={leagueInputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-end`} className={leagueLabelClass}>종료일</label>
        <input id={`${id}-end`} type="date" min={value.startsOn || undefined} max={DATE_INPUT_MAX} required value={value.endsOn} onChange={e => onChange('endsOn', e.target.value)} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${id}-range-error` : undefined} className={leagueInputClass} />
      </div>
    </div>
    {rangeError && <p id={`${id}-range-error`} role="alert" className="tm-text-caption font-medium text-[var(--red700)]">{rangeError}</p>}
  </fieldset>;
}
