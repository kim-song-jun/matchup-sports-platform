'use client';

import { useId } from 'react';
import { Button } from '@/components/v1-ui/button';
import {
  DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER,
  SIX_TEAM_CRITERION_LABELS,
  moveSixTeamCriterion,
  sameSixTeamOrder,
} from '@/lib/tournament-tie-break';
import type { V1SixTeamCriterion } from '@/types/api';

type SixTeamOrderEditorProps = {
  order: V1SixTeamCriterion[];
  onChange: (order: V1SixTeamCriterion[]) => void;
  disabled?: boolean;
  /** 6강 첫 세 경기 결과가 확정돼 순서를 못 바꿀 때 서버가 준 사유. 있으면 모든 버튼이 꺼진다. */
  lockedReason?: string | null;
};

/** 6강 방식 대회의 「결승 직행팀 고르는 순서」. 세 기준만 움직이고 운영자 선택은 언제나 마지막이다. */
export function SixTeamOrderEditor({ order, onChange, disabled = false, lockedReason = null }: SixTeamOrderEditorProps) {
  const headingId = useId();
  const hintId = useId();
  const frozen = disabled || lockedReason !== null;
  const isDefault = sameSixTeamOrder(order, DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER);

  return (
    <section aria-labelledby={headingId} aria-describedby={hintId} className="grid gap-2">
      <h3 id={headingId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">결승 직행팀 고르는 순서</h3>
      <p id={hintId} className="tm-text-caption text-[var(--text-muted)]">
        6강 3경기에서 이긴 팀 중 결승에 바로 오를 팀을 위에서부터 차례로 가려요. 끝까지 같으면 운영자가 직접 골라요.
      </p>
      <ol className="grid gap-2">
        {order.map((criterion, index) => {
          const label = SIX_TEAM_CRITERION_LABELS[criterion];
          return (
            <li key={criterion} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3">
              <span className="flex items-center gap-2 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
                <span aria-hidden="true" className="w-4 text-[var(--text-muted)] tabular-nums">{index + 1}</span>
                <span className="font-semibold">{label}</span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  aria-label={`${label} 한 칸 위로`}
                  disabled={frozen || index === 0}
                  onClick={() => onChange(moveSixTeamCriterion(order, index, -1))}
                >
                  위로
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  aria-label={`${label} 한 칸 아래로`}
                  disabled={frozen || index === order.length - 1}
                  onClick={() => onChange(moveSixTeamCriterion(order, index, 1))}
                >
                  아래로
                </Button>
              </span>
            </li>
          );
        })}
        <li className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3">
          <span className="flex items-center gap-2 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
            <span aria-hidden="true" className="w-4 text-[var(--text-muted)] tabular-nums">{order.length + 1}</span>
            <span className="font-semibold">운영자 선택</span>
          </span>
          <span className="tm-text-caption text-[var(--text-muted)]">항상 마지막</span>
        </li>
      </ol>
      {lockedReason !== null ? (
        <p role="status" className="tm-text-caption text-[var(--text-muted)]">{lockedReason}</p>
      ) : !isDefault ? (
        <div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([...DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER])}>
            기본 순서로 되돌리기
          </Button>
        </div>
      ) : null}
    </section>
  );
}
