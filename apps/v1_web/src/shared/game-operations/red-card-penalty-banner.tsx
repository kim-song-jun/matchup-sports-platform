'use client';

import { useEffect, useState } from 'react';
import { elapsedMatchMs, serverAlignedNowMs } from '@/lib/game-operations-clock';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import { deriveRedCardPenalties } from '@/lib/red-card-penalty';
import type { GameEventRecord, GameLineup, GameSide } from '@/types/game-operations';
import { playerLabel, sideLabel } from './confirm-copy';
import { RedCardPenaltyRows } from './red-card-penalty-rows';

/**
 * 패널티가 "지금" 어디까지 흘렀는지 재는 기준.
 * - `live`: 진행 중인 피리어드 — `ElapsedMatchClock`과 같은 계산(`elapsedMatchMs`)이라 시계와 어긋나지 않는다.
 *   일시 중지 중이면 시계와 함께 멈춘다.
 * - `frozen`: 하프타임처럼 흐르는 피리어드가 없을 때 — 직전 피리어드가 끝난 시점에 멈춰 있다.
 */
export type PenaltyNowAnchor =
  | {
      readonly kind: 'live';
      readonly period: number;
      readonly periodStartedAtMs: number;
      readonly offsetMs: number;
      readonly pausedTotalMs: number;
      readonly pausedAtMs: number | null;
    }
  | { readonly kind: 'frozen'; readonly period: number; readonly clockMs: number };

export interface RedCardPenaltyBannerProps {
  readonly events: readonly GameEventRecord[];
  readonly queuedItems: readonly QueuedGameEvent[];
  readonly anchor: PenaltyNowAnchor;
  readonly periodLengthMs: (period: number) => number | null;
  readonly clockMsOf?: (event: GameEventRecord) => number;
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
}

/**
 * 퇴장(레드카드) 뒤 패널티 카운트다운 — "패널티 1:23 · 수용5팀 · 수용5팀장 퇴장". 풋살처럼 퇴장 뒤 2분 또는 상대 득점까지
 * 한 명 모자란 채 뛰는 종목에서, 운영자가 시계 옆에서 보충 가능 시점을 바로 읽게 한다.
 *
 * 2분이 지나거나 상대가 득점하면 그 줄이 그냥 사라진다(별도 "보충 가능" 상태는 없다). 서버 상태가 없고 이벤트 로그와
 * 경기 시계에서 매초 다시 계산한다 — 계산 규칙은 `red-card-penalty.ts`.
 */
export function RedCardPenaltyBanner({
  events,
  queuedItems,
  anchor,
  periodLengthMs,
  clockMsOf,
  sides,
  lineups,
}: RedCardPenaltyBannerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isLive = anchor.kind === 'live';

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  const now =
    anchor.kind === 'live'
      ? {
          period: anchor.period,
          clockMs: elapsedMatchMs({
            referenceNowMs: serverAlignedNowMs(nowMs, anchor.offsetMs),
            periodStartedAtMs: anchor.periodStartedAtMs,
            pausedTotalMs: anchor.pausedTotalMs,
            pausedAtMs: anchor.pausedAtMs,
          }),
        }
      : { period: anchor.period, clockMs: anchor.clockMs };

  const penalties = deriveRedCardPenalties({ events, queuedItems, now, periodLengthMs, clockMsOf });
  if (penalties.length === 0) return null;

  // 시계가 멈춰 있으면 숫자도 멈춘다 — 이유를 적어 두지 않으면 "고장 났나?"로 읽힌다.
  const stoppedNote = anchor.kind === 'frozen' ? '하프타임' : anchor.pausedAtMs !== null ? '일시 중지 중' : null;

  return (
    <RedCardPenaltyRows
      rows={penalties.map((penalty) => ({
        key: penalty.key,
        remainingMs: penalty.remainingMs,
        label: `${sideLabel(penalty.sideId, sides)}${
          penalty.participantId === null ? '' : ` · ${playerLabel(penalty.participantId, lineups)}`
        } 퇴장`,
        stoppedNote,
      }))}
    />
  );
}
