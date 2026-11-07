'use client';

import { useId } from 'react';
import { Button } from '@/components/v1-ui/button';
import {
  DEFAULT_TOURNAMENT_TIE_BREAK_ORDER,
  TOURNAMENT_TIE_BREAK_LABELS,
  isMovableTieBreakIndex,
  moveTieBreakCriterion,
  sameTieBreakOrder,
} from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';

type TieBreakOrderEditorProps = {
  order: V1TournamentTieBreakOrder;
  onChange: (order: V1TournamentTieBreakOrder) => void;
  disabled?: boolean;
  /** 예선 결과가 확정돼 순서를 못 바꿀 때 서버가 준 사유. 있으면 모든 버튼이 꺼진다. */
  lockedReason?: string | null;
};

/** 대회 만들기·정보 수정이 함께 쓰는 「동점일 때 순서」 칸. 승점은 처음, 추첨은 마지막에 고정이다. */
export function TieBreakOrderEditor({ order, onChange, disabled = false, lockedReason = null }: TieBreakOrderEditorProps) {
  const headingId = useId();
  const hintId = useId();
  const frozen = disabled || lockedReason !== null;
  const isDefault = sameTieBreakOrder(order, DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);

  return (
    <section aria-labelledby={headingId} aria-describedby={hintId} className="grid gap-2">
      <h3 id={headingId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">동점일 때 순서</h3>
      <p id={hintId} className="tm-text-caption text-[var(--text-muted)]">
        승점이 같으면 위에서부터 차례로 가려요. 끝까지 같으면 추첨으로 정해요.
      </p>
      <ol className="grid gap-2">
        {order.map((criterion, index) => {
          const label = TOURNAMENT_TIE_BREAK_LABELS[criterion];
          const movable = isMovableTieBreakIndex(order, index);
          return (
            <li
              key={criterion}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 ${movable ? 'bg-[var(--card-surface)]' : 'bg-[var(--surface-soft)]'}`}
            >
              <span className="flex items-center gap-2 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
                <span aria-hidden="true" className="w-4 text-[var(--text-muted)] tabular-nums">{index + 1}</span>
                <span className="font-semibold">{label}</span>
              </span>
              {movable ? (
                <span className="flex gap-2">
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    aria-label={`${label} 한 칸 위로`}
                    disabled={frozen || !isMovableTieBreakIndex(order, index - 1)}
                    onClick={() => onChange(moveTieBreakCriterion(order, index, -1))}
                  >
                    위로
                  </Button>
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    aria-label={`${label} 한 칸 아래로`}
                    disabled={frozen || !isMovableTieBreakIndex(order, index + 1)}
                    onClick={() => onChange(moveTieBreakCriterion(order, index, 1))}
                  >
                    아래로
                  </Button>
                </span>
              ) : (
                <span className="tm-text-caption text-[var(--text-muted)]">{index === 0 ? '항상 처음' : '항상 마지막'}</span>
              )}
            </li>
          );
        })}
      </ol>
      {lockedReason !== null ? (
        <p role="status" className="tm-text-caption text-[var(--text-muted)]">{lockedReason}</p>
      ) : !isDefault ? (
        <div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([...DEFAULT_TOURNAMENT_TIE_BREAK_ORDER])}>
            기본 순서로 되돌리기
          </Button>
        </div>
      ) : null}
    </section>
  );
}
