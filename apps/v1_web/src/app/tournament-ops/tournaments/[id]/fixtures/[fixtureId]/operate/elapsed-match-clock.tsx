'use client';

import { useEffect, useState } from 'react';
import { formatMatchClock, serverAlignedNowMs } from '@/lib/game-operations-clock';

export interface ElapsedMatchClockProps {
  readonly periodNumber: number;
  readonly periodStartedAtMs: number;
  /** `medianOffsetMs(...)` — same server-time-alignment `freezeCapture()`
   * uses. This display exists specifically so an operator glancing at the
   * screen sees the same match time a tap would freeze *right now* — it is
   * intentionally NOT a separate "trust me" number. If the device clock is
   * off, this number is already corrected the same way every captured event
   * is; there is nothing further to reconcile here. A device whose offset
   * estimate itself is stale/wrong surfaces as repeated `CLOCK_DRIFT`
   * banners on submit (`gameOperationsErrorMessage`), not as a mismatch
   * against this display — both numbers come from the same offset. */
  readonly offsetMs: number;
}

/**
 * 경과 시간 표시. 초 단위로 매초 갱신한다 — ms 정밀도는 여기 필요 없다(운영자가
 * 실시간으로 눈으로 읽는 큰 숫자이지, 초 미만 단위로 뭘 판단할 자리가 아니다).
 * `startedAt`이 있는 한 게임 state(LIVE/PAUSED)와 무관하게 계속 흐른다 — 이
 * 데이터 모델 자체가 피리어드 일시정지 구간을 별도로 추적하지 않기 때문에
 * (`GamePeriod`에 pausedAt/resumedAt이 없다), 이 숫자를 멈춰 보이게 만들면
 * "화면엔 10:00에서 멈췄는데 실제로 다음 이벤트는 12:30으로 찍힌다"는 불일치를
 * 만든다 — freezeCapture()가 계산하는 값과 항상 일치해야 신뢰할 수 있다.
 */
export function ElapsedMatchClock({ periodNumber, periodStartedAtMs, offsetMs }: ElapsedMatchClockProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedMs = Math.max(0, serverAlignedNowMs(nowMs, offsetMs) - periodStartedAtMs);

  return (
    <p className="flex items-baseline gap-1.5" aria-live="off">
      <span className="text-2xs font-semibold text-gray-400 dark:text-gray-500">{periodNumber}P</span>
      <span
        className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white"
        aria-label={`${periodNumber}피리어드 경과 시간 ${formatMatchClock(elapsedMs)}`}
      >
        {formatMatchClock(elapsedMs)}
      </span>
    </p>
  );
}
