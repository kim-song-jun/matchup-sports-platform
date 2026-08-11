'use client';

import { AlertTriangle } from 'lucide-react';
import { TEAM_FOUL_WARNING_THRESHOLD } from '@/lib/team-foul-counter';
import type { GameSide } from '@/types/game-operations';

export function TeamFoulCounterBar({
  sides,
  counts,
  period,
}: {
  readonly sides: readonly GameSide[];
  readonly counts: Record<string, number>;
  readonly period: number;
}) {
  if (sides.length === 0) return null;
  return (
    /* 어포던스 분리 — 예전엔 이 카운터가 팀마다 `rounded-lg border … px-3 py-2`
     * 박스였다. 바로 아래 액션 버튼(`.tm-btn-outline`: 테두리 + 흰/카드 배경 +
     * radius 12px 사각형)과 "테두리 있는 사각형" 이라는 같은 문법을 썼고, 크기·
     * 패딩까지 비슷해 두 눈에는 "이것도 눌러도 되는 버튼"으로 읽혔다 — 실제로는
     * 표시 전용이다.
     * 대신 이 화면의 다른 표시 전용 섹션(`RestTimer`)이 이미 쓰는 관례를
     * 따른다 — 배경으로 표면 자체를 감싸고(`mx-4`로 여백을 페이지 안쪽에
     * 두는 것까지 동일), 테두리 없이 두 팀 사이만 구분선(`divide-x`)으로
     * 가른다. 이 화면에서 "테두리 있는 사각형 = 누를 수 있다" 라는 문법을
     * 액션 버튼 하나에만 남기기 위한 선택이다(루브릭 R-K3: 구분선 1순위는
     * 여백, 2순위는 배경색 전환 — 테두리 카드가 아니라 배경 전환 + 구분선으로
     * 나눈다). radius도 버튼(12px)과 다른 값(rounded-xl=12px는 이 화면
     * 다른 표시 섹션과 통일, 버튼과는 border 유무로 갈린다)을 써서 형태만
     * 훑어도 "이건 정보, 저건 버튼"이 구분되게 한다. */
    <div
      className="mx-4 grid grid-cols-2 divide-x divide-[var(--border)] overflow-hidden rounded-xl bg-[var(--surface-soft)]"
      role="group"
      aria-label={`${period}피리어드 팀 파울`}
    >
      {sides.map((side) => {
        const count = counts[side.id] ?? 0;
        const warning = count >= TEAM_FOUL_WARNING_THRESHOLD;
        return (
          <div
            key={side.id}
            className={
              warning
                ? 'flex items-center justify-between bg-orange-50 px-3 py-2 dark:bg-orange-500/10'
                : 'flex items-center justify-between px-3 py-2'
            }
          >
            <span className="truncate text-xs font-medium text-[var(--text-muted)]">{side.displayNameSnapshot}</span>
            <span className="flex items-center gap-1">
              {warning ? <AlertTriangle size={12} aria-hidden="true" className="text-orange-500" /> : null}
              <span
                className={
                  warning
                    ? 'text-sm font-bold tabular-nums text-orange-700 dark:text-orange-300'
                    : 'text-sm font-bold tabular-nums text-[var(--text-strong)]'
                }
              >
                파울 {count}
              </span>
              {warning ? <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">· 다음부터 10m 프리킥</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
