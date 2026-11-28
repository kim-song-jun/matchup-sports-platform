'use client';

import { useEffect, useState } from 'react';
import { Pause } from 'lucide-react';
import { elapsedMatchMs, formatStopwatchClock, serverAlignedNowMs } from '@/lib/game-operations-clock';
import { isSinglePeriod, periodLabel } from './period-label';

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
  /** 정규 피리어드 수. 1이면 단판이라 스크린리더용 이름에 구간 이름을 붙이지 않는다. 구간은 화면에서 단계 줄이 보인다. */
  readonly periodCount?: number | null;
  /** 현재 기간의 설정 시간. 연장 기간도 자기 durationMinutes를 사용한다. */
  readonly periodDurationMinutes?: number | null;
  /** 만료는 안내만 하며 기간 종료의 확정은 서버 응답을 따른다. */
  readonly onExpiryChange?: (expired: boolean) => void;
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
 * 중에는 숫자를 회색으로 낮추고 아이콘+텍스트 배지를 함께 보여준다.
 */
export function ElapsedMatchClock({
  periodNumber,
  periodStartedAtMs,
  offsetMs,
  pausedTotalMs,
  pausedAtMs,
  periodCount,
  periodDurationMinutes,
  onExpiryChange,
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
  const expired = !isPaused && periodDurationMinutes != null && elapsedMs >= periodDurationMinutes * 60_000;

  useEffect(() => {
    onExpiryChange?.(expired);
  }, [expired, onExpiryChange]);

  return (
    <div className="flex items-center gap-2" aria-live="off">
      <span
        className={`text-3xl font-extrabold leading-none tabular-nums ${isPaused ? 'text-[var(--text-muted)]' : 'text-[var(--text-strong)]'}`}
        aria-label={`${isSinglePeriod(periodCount) ? '' : `${periodLabel(periodNumber, periodCount)} `}경과 시간 ${formatStopwatchClock(elapsedMs)}${isPaused ? ' (일시 중지됨)' : ''}`}
      >
        {formatStopwatchClock(elapsedMs)}
      </span>
      {isPaused ? (
        <span className="flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-body)]">
          <Pause size={12} aria-hidden="true" className="shrink-0" />
          일시 중지
        </span>
      ) : null}
    </div>
  );
}
