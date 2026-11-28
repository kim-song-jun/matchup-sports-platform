'use client';

import { useId } from 'react';

/**
 * 진행 중인 경기의 팀 파울을 관전 화면(경기 상세 스코어 카드)에 보여줄지 정하는 스위치 한 줄 — 대회·리그 만들기와
 * 정보 수정, 리그 설정이 같이 쓴다. 팀 파울 기준 입력칸 바로 아래에 둔다(2026-11-28 시안 A 선택).
 *
 * 켜짐이 기본값이다. 끄면 관전 화면에서만 사라지고 경기 운영 화면의 팀 파울·경고는 그대로다. 경기가 진행 중일 때도 바꿀 수 있다.
 * 모양은 "상세 이미지 표시" 스위치(`tournament-images-field.tsx`)와 같다.
 */
export function TeamFoulPublicSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <div className="mt-2 border-t border-[var(--border)] pt-1">
      <label className="flex min-h-[44px] items-center gap-3 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
        <input
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-describedby={hintId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 accent-[var(--blue500)]"
        />
        관전 화면에 팀 파울 보여주기
      </label>
      <p id={hintId} className="tm-text-caption text-[var(--text-muted)]" style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {checked
          ? '켜면 경기가 진행되는 동안 경기 상세 스코어 카드에 팀 파울 바가 보여요. 경기가 끝나면 사라져요.'
          : '관전 화면에는 팀 파울이 보이지 않아요. 경기 운영 화면의 팀 파울과 경고는 그대로예요.'}
      </p>
    </div>
  );
}
