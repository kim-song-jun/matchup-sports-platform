'use client';

import { Timer } from 'lucide-react';
import { formatElapsedClock, periodLabel } from './format';
import type { PublicGameClock, PublicPeriodBreak } from './types';

const PERIOD_BREAK_LABEL: Record<PublicPeriodBreak, string> = {
  halftime: '하프타임',
  regulation_ended: '정규 시간 종료',
};

/**
 * Lane 1 -- the minimum a spectator needs to tell "이 경기가 지금 진행 중인가"
 * at a glance: a pulsing dot (never color-only -- the "LIVE" text carries the
 * same information), the current period, and a running elapsed clock when
 * one is available. Visual language matches the existing tournament detail
 * page's own LIVE badges (`tournament-detail-client.tsx`) for consistency,
 * duplicated rather than imported since that file is outside this lane's
 * component tree.
 *
 * `periodBreak` -- `clock`이 `null`인데 경기(`status`)는 여전히 `'live'`인 두 상황을
 * 구분한다: `'halftime'`(피리어드 사이 휴식)과 `'regulation_ended'`(모든 피리어드
 * 종료, 결과 확정/승부차기 대기). `clock !== null`이면 서버 계약상 항상 `null`이므로
 * (`types.ts`의 `PublicPeriodBreak` 문서 참고) 여기서도 `clock === null`일 때만
 * 참조한다. 운영 콘솔이 이미 같은 두 상태를 별도 칩("하프타임"/"정규 시간 종료",
 * `operate-console.tsx`)으로 보여주므로 그 실제 문구를 그대로 재사용-- 관전자
 * 전용 새 표현을 만들지 않는다.
 */
export function LiveBadge({
  clock,
  periodBreak,
}: {
  clock: PublicGameClock | null;
  periodBreak: PublicPeriodBreak | null;
}) {
  const breakLabel = clock === null && periodBreak !== null ? PERIOD_BREAK_LABEL[periodBreak] : null;

  return (
    <span
      role="status"
      aria-label={
        clock !== null
          ? `진행 중, ${periodLabel(clock.periodNumber)} ${formatElapsedClock(clock.elapsedMs)}${clock.isPaused ? ' (일시 중지)' : ''}`
          : breakLabel !== null
            ? `진행 중, ${breakLabel}`
            : '진행 중'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'var(--red50)',
        borderRadius: 20,
        padding: '2px 8px',
        flexShrink: 0,
      }}
    >
      {breakLabel !== null ? (
        <Timer size={12} aria-hidden="true" style={{ color: 'var(--red700)', flexShrink: 0 }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: clock?.isPaused ? 'var(--grey400)' : 'var(--red500)',
            flexShrink: 0,
            boxShadow: clock?.isPaused ? 'none' : '0 0 0 2px color-mix(in srgb, var(--red500) 25%, transparent)',
          }}
        />
      )}
      {/* [R-T2] 고정 크기 없는 pill(자동 폭) -- 두 span 모두 12로 상향. */}
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red700)', letterSpacing: '0.02em' }}>
        {breakLabel ?? (clock?.isPaused ? '일시중지' : 'LIVE')}
      </span>
      {clock !== null ? (
        <span className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--red700)' }}>
          {periodLabel(clock.periodNumber)} {formatElapsedClock(clock.elapsedMs)}
        </span>
      ) : null}
    </span>
  );
}
