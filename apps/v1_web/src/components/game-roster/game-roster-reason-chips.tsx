'use client';

import { GAME_ROSTER_REASON_OPTIONS, type GameRosterAdjustmentReason } from '@/lib/v1-status-labels';

/** 빼기로 고른 선수 아래 뜨는 사유 칩 — 고르지 않아도 저장된다. 다시 누르면 선택이 풀린다. */
export function GameRosterReasonChips({
  playerName,
  value,
  onChange,
}: {
  playerName: string;
  value: GameRosterAdjustmentReason | null;
  onChange: (reason: GameRosterAdjustmentReason | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`${playerName} 빠지는 사유(선택)`}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 0 12px 40px' }}
    >
      {GAME_ROSTER_REASON_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`tm-chip${selected ? ' tm-chip-active' : ''}`}
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
