'use client';
import { useId } from 'react';
export function SixTeamModeField({
  eligible,
  value,
  onChange,
  disabled,
}: {
  eligible: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (!eligible)
    return value ? (
      <p className="tm-text-caption" role="status">
        모집 정원이나 형식을 바꾸면 6강 전용 방식이 해제돼요.
      </p>
    ) : null;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="tm-text-label font-semibold">
        6팀 토너먼트 진행
      </label>
      <select
        id={id}
        className="tm-input min-h-11"
        value={value ? 'six' : 'standard'}
        onChange={(e) => onChange(e.target.value === 'six')}
        disabled={disabled}
      >
        <option value="standard">일반 토너먼트</option>
        <option value="six">6강 · 승리팀 중 1팀 결승 직행</option>
      </select>
      {value && (
        <p className="tm-text-caption text-[var(--text-muted)]">
          6강 3경기 → 성적 기준 결승 직행팀 선정 → 준결승 → 결승. 대진 생성에는
          확정팀 6팀이 필요해요.
        </p>
      )}
    </div>
  );
}
