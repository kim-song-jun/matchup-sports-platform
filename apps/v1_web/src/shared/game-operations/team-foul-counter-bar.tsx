'use client';

import { AlertTriangle } from 'lucide-react';
import { TEAM_FOUL_WARNING_THRESHOLD } from '@/lib/team-foul-counter';
import type { GameSide } from '@/types/game-operations';
import { periodLabel } from './period-label';

/**
 * 팀 파울은 피리어드마다 0부터 다시 센다(`deriveFoulCounts`, 풋살 규칙). 숫자가 어느 피리어드의 것인지와
 * 다음 피리어드에서 다시 센다는 사실을 화면에 적는다 — 후반에 숫자가 말없이 0이 되면 기록이 사라진 것처럼
 * 읽혔다(MD-QA #189, 2026-10-28 사용자 선택: 규칙은 유지하고 표시만 고친다).
 */
export function TeamFoulCounterBar({
  sides,
  counts,
  period,
  periodCount = null,
  hasNextPeriod = false,
}: {
  readonly sides: readonly GameSide[];
  readonly counts: Record<string, number>;
  readonly period: number;
  /** 정규 피리어드 수 — 1이면 단판이라 "경기 팀 파울"로 부른다. */
  readonly periodCount?: number | null;
  /** 이 피리어드 다음 피리어드가 있는가(하프타임 포함) — 있으면 다시 센다고 알려 준다. */
  readonly hasNextPeriod?: boolean;
}) {
  if (sides.length === 0) return null;
  const periodName = periodLabel(period, periodCount);
  const resetNote = hasNextPeriod ? `${periodLabel(period + 1, periodCount)}에는 0부터 다시 세요` : null;
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
      className="mx-4 overflow-hidden rounded-xl bg-[var(--surface-soft)]"
      role="group"
      aria-label={`${periodName} 팀 파울`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 px-3 pt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        <span className="font-semibold">{periodName} 팀 파울</span>
        {resetNote ? <span>{resetNote}</span> : null}
      </div>
      <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
        {sides.map((side) => {
          const count = counts[side.id] ?? 0;
          const warning = count >= TEAM_FOUL_WARNING_THRESHOLD;
          return (
            <div
              key={side.id}
              className={
                warning
                  ? 'flex flex-wrap items-center justify-between gap-x-2 bg-orange-50 px-3 py-2 dark:bg-orange-500/10'
                  : 'flex flex-wrap items-center justify-between gap-x-2 px-3 py-2'
              }
            >
              {/* 공통 접두사가 긴 팀도 구별할 수 있게 이름 전체를 표시한다. 파울 숫자는 한 덩어리로 유지한다. */}
              <span className="min-w-0 flex-1 break-keep text-xs font-medium text-[var(--text-muted)]" style={{ overflowWrap: 'anywhere' }}>{side.displayNameSnapshot}</span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
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
              </span>
              {/* 경고 안내는 이름·숫자 줄 아래 한 줄을 통째로 쓴다 — 같은 줄에 두면 이름이 밀려 사라진다. */}
              {warning ? (
                <span className="basis-full text-xs font-semibold text-orange-700 dark:text-orange-300">다음부터 10m 프리킥</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
