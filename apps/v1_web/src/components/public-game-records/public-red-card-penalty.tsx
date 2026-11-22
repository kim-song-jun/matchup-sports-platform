'use client';

import { useEffect, useState } from 'react';
import { derivePenaltiesFromMarkers, type PenaltyMarker } from '@/lib/red-card-penalty';
import { RedCardPenaltyRows } from '@/shared/game-operations/red-card-penalty-rows';
import type { PublicGameClock, PublicMatchEvent, PublicPeriodBreak } from './types';

export interface PublicRedCardPenaltyProps {
  readonly events: readonly PublicMatchEvent[];
  readonly clock: PublicGameClock | null;
  readonly periodBreak: PublicPeriodBreak | null;
  readonly periodCount?: number | null;
  /** 정규 피리어드별 길이(분). 전·후반 경계를 넘는 패널티를 이어 세는 데 쓴다. */
  readonly periodMinutes?: readonly number[] | null;
  readonly homeName: string;
  readonly awayName: string;
}

/**
 * 공개 경기 화면(관중·선수)의 퇴장 패널티 줄 — 풋살처럼 교체를 기록하지 않는 종목의 진행 중 경기에서, 퇴장 뒤 2분 또는
 * 상대 득점까지 남은 시간을 LIVE 배지 아래에 보여 준다. 운영 콘솔과 같은 계산(`lib/red-card-penalty.ts`)과 같은 줄 모양
 * (`RedCardPenaltyRows`)을 쓴다.
 *
 * 공개 응답의 시계(`clock`)는 서버가 요청 시점에 계산한 값이고 화면은 10초마다 다시 받는다. 그 사이는 받은 시각부터
 * 흐른 시간을 더해 매초 줄인다(일시 중지 중에는 멈춘다). 그래서 일시 중지·득점은 최대 한 번의 갱신 주기만큼 늦게 반영될 수 있다.
 * 선수 이름은 공개 동의를 받은 경우에만 응답에 있고, 없으면 팀 이름까지만 보여 준다.
 */
export function PublicRedCardPenalty({
  events,
  clock,
  periodBreak,
  periodCount,
  periodMinutes,
  homeName,
  awayName,
}: PublicRedCardPenaltyProps) {
  // 서버 시계를 받은 시각 — 새 값이 오면(피리어드·경과 시간·일시 중지 중 하나라도 달라지면) 다시 잡는다.
  const [time, setTime] = useState(() => {
    const at = Date.now();
    return { receivedAtMs: at, nowMs: at };
  });
  const running = clock !== null && !clock.isPaused;

  useEffect(() => {
    const at = Date.now();
    setTime({ receivedAtMs: at, nowMs: at });
  }, [clock?.periodNumber, clock?.elapsedMs, clock?.isPaused]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTime((previous) => ({ ...previous, nowMs: Date.now() })), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const periodLengthMs = (period: number): number | null => {
    const minutes = periodMinutes?.[period - 1];
    return typeof minutes === 'number' && minutes > 0 ? minutes * 60_000 : null;
  };

  let now: { period: number; clockMs: number } | null = null;
  if (clock !== null) {
    now = {
      period: clock.periodNumber,
      clockMs: clock.elapsedMs + (clock.isPaused ? 0 : Math.max(0, time.nowMs - time.receivedAtMs)),
    };
  } else if (periodBreak === 'halftime' && periodCount === 2) {
    // 하프타임에는 흐르는 경기 시간이 없다 — 전반이 끝난 시점에 멈춘 값을 보여 준다(정규 두 피리어드일 때만 직전 피리어드를 안다).
    const firstLength = periodLengthMs(1);
    if (firstLength !== null) now = { period: 1, clockMs: firstLength };
  }
  if (now === null) return null;

  const reds: PenaltyMarker[] = [];
  const goals: PenaltyMarker[] = [];
  events.forEach((event, index) => {
    // 시각을 모르는(백필) 기록은 앞뒤를 가릴 수 없어 넣지 않는다.
    if (event.period === null || event.clockMs === null) return;
    const marker: PenaltyMarker = {
      key: `public-${index}`,
      participantId: event.participantId,
      sideId: event.sideId,
      at: { period: event.period, clockMs: event.clockMs },
      order: index,
    };
    if (event.type === 'CARD' && event.cardColor === 'RED') reds.push(marker);
    else if (event.type === 'GOAL' || event.type === 'OWN_GOAL') goals.push(marker);
  });

  const penalties = derivePenaltiesFromMarkers({ reds, goals, now, periodLengthMs });
  if (penalties.length === 0) return null;

  const stoppedNote = clock === null ? '하프타임' : clock.isPaused ? '일시 중지 중' : null;
  return (
    <div style={{ marginTop: 12 }}>
      <RedCardPenaltyRows
        rows={penalties.map((penalty) => {
          const event = events[Number(penalty.key.slice('public-'.length))];
          const team = event?.side === 'away' ? awayName : homeName;
          // 이름은 공개 동의가 있어 응답에 실린 경우에만 붙는다.
          const player = event?.participantName ?? null;
          return {
            key: penalty.key,
            remainingMs: penalty.remainingMs,
            label: `${team}${player === null ? '' : ` · ${player}`} 퇴장`,
            stoppedNote,
          };
        })}
      />
    </div>
  );
}
