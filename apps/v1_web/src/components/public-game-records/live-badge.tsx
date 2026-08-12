'use client';

import { formatElapsedClock, periodLabel } from './format';
import type { PublicGameClock } from './types';

/**
 * Lane 1 -- the minimum a spectator needs to tell "이 경기가 지금 진행 중인가"
 * at a glance: a pulsing dot (never color-only -- the "LIVE" text carries the
 * same information), the current period, and a running elapsed clock when
 * one is available. Visual language matches the existing tournament detail
 * page's own LIVE badges (`tournament-detail-client.tsx`) for consistency,
 * duplicated rather than imported since that file is outside this lane's
 * component tree.
 */
export function LiveBadge({ clock }: { clock: PublicGameClock | null }) {
  return (
    <span
      role="status"
      aria-label={
        clock === null
          ? '진행 중'
          : `진행 중, ${periodLabel(clock.periodNumber)} ${formatElapsedClock(clock.elapsedMs)}${clock.isPaused ? ' (일시 중지)' : ''}`
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
      {/* [R-T2] 고정 크기 없는 pill(자동 폭) — 두 span 모두 12로 상향. */}
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red700)', letterSpacing: '0.02em' }}>
        {clock?.isPaused ? '일시중지' : 'LIVE'}
      </span>
      {clock !== null ? (
        <span className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--red700)' }}>
          {periodLabel(clock.periodNumber)} {formatElapsedClock(clock.elapsedMs)}
        </span>
      ) : null}
    </span>
  );
}
