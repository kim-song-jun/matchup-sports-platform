'use client';

import { useEffect, useState } from 'react';
import { Pause } from 'lucide-react';
import { elapsedMatchMs, formatStopwatchClock, serverAlignedNowMs } from '@/lib/game-operations-clock';
import { periodLabel } from './period-label';

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
  /** `V1GamePeriod.pausedTotalMs` — sum of every completed pause segment. */
  readonly pausedTotalMs: number;
  /** `V1GamePeriod.pausedAt`, as ms — start of the currently open pause
   * segment, or `null` when not paused right now. */
  readonly pausedAtMs: number | null;
}

/**
 * 경과 시간 표시. 초 단위로 매초 갱신한다 — ms 정밀도는 여기 필요 없다(운영자가
 * 실시간으로 눈으로 읽는 큰 숫자이지, 초 미만 단위로 뭘 판단할 자리가 아니다).
 *
 * 일시정지 구간은 경과 시간에서 제외한다(`elapsedMatchMs`) — `freezeCapture()`와
 * 정확히 같은 계산을 공유하므로 이 표시와 실제 기록되는 `clockMs`는 항상 같은
 * 값이다(두 곳에 따로 구현하면 반드시 어긋난다). *표시 포맷*은 계산과 분리된
 * 별도 계층(`formatStopwatchClock`)이다 — alpha 실측에서 "전반 584:23"처럼
 * 분이 무한히 커져 스톱워치로 못 읽히던 문제를 자릿수 고정 + 시:분:초
 * 롤오버로 고쳤다. 멈춘 숫자만 보여주면 "고장 났나?"로 읽히므로, 일시정지
 * 중에는 색상뿐 아니라 아이콘+텍스트 배지를 함께 보여준다. 진행 중일 때는
 * 초록 점을 깜빡여 "지금 이 순간에도 흐르고 있다"는 스톱워치 감각을 준다.
 */
export function ElapsedMatchClock({
  periodNumber,
  periodStartedAtMs,
  offsetMs,
  pausedTotalMs,
  pausedAtMs,
}: ElapsedMatchClockProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isPaused = pausedAtMs !== null;
  const elapsedMs = elapsedMatchMs({
    referenceNowMs: serverAlignedNowMs(nowMs, offsetMs),
    periodStartedAtMs,
    pausedTotalMs,
    pausedAtMs,
  });

  return (
    <div className="flex items-center gap-2" aria-live="off">
      <span className="text-2xs font-semibold text-gray-400 dark:text-gray-500">{periodLabel(periodNumber)}</span>
      {/* 스톱워치 다이얼 — 자릿수가 고정된 큰 숫자를 살짝 어두운 배경 칩 안에
          담아 "지금 흐르고 있는 시각"과 주변 텍스트를 시각적으로 분리한다.
          초록 점(진행 중)/일시정지 아이콘을 숫자 바로 옆에 붙여 한눈에 상태를
          읽게 한다 — 경기장에서 흘끗 봐도 파악되는 게 요건이다. */}
      <span
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-3xl font-extrabold leading-none tabular-nums tracking-tight ${
          isPaused
            ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300'
            : 'bg-gray-900/[0.04] text-gray-900 dark:bg-white/10 dark:text-white'
        }`}
        aria-label={`${periodLabel(periodNumber)} 경과 시간 ${formatStopwatchClock(elapsedMs)}${isPaused ? ' (일시 중지됨)' : ''}`}
      >
        {isPaused ? (
          <Pause size={18} aria-hidden="true" className="shrink-0" />
        ) : (
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-green-500 motion-safe:animate-pulse"
          />
        )}
        {formatStopwatchClock(elapsedMs)}
      </span>
      {isPaused ? (
        <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-2xs font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
          일시 중지
        </span>
      ) : null}
    </div>
  );
}
