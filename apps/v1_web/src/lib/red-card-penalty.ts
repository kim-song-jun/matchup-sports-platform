/**
 * 퇴장(레드카드) 뒤 "패널티" 카운트다운 — 풋살 규칙: 퇴장당한 팀은 **2분이 지나거나 상대가 득점할 때까지**
 * 한 명 모자란 채 뛰고, 그 뒤에 새 선수를 넣을 수 있다.
 *
 * 저장하는 상태가 없다. 확정된 이벤트 로그(레드카드·골)와 지금 경기 시각만으로 남은 시간을 접어 낸다:
 * - 레드카드를 받은 시각부터 **경기 시간**이 2분 흐르면 끝난다. 일시 중지·하프타임은 경기 시간이 아니므로
 *   `clockMs`(피리어드 안 경과 시간, 일시 중지 제외)만 쓰고, 전·후반 경계를 넘으면 이어서 센다.
 * - 퇴장한 팀의 상대가 득점하면(상대 골, 그 팀 선수의 자책골 포함) 아직 대기 중인 퇴장 **한 명분**이 끝난다.
 *   퇴장이 여럿이면 골 1개에 가장 먼저 퇴장한 선수부터 한 명씩이다.
 * - 취소(되돌린) 레드카드·골은 없던 것으로 본다. 서버 확정 전(대기·전송 중)인 레드카드·골은 넣는다.
 *
 * `on-pitch-state.ts`의 퇴장 판정과 같은 이벤트 규칙(되돌림·대기 큐)을 따른다.
 */

import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord } from '@/types/game-operations';

/** 퇴장 뒤 보충을 기다리는 시간(ms). */
export const RED_CARD_PENALTY_MS = 2 * 60 * 1000;

/** 경기 안의 한 시점 — 피리어드 번호와 그 피리어드 안 경과 시간. */
export interface MatchPosition {
  readonly period: number;
  readonly clockMs: number;
}

export interface RedCardPenalty {
  /** 레드카드 이벤트 id(서버 확정 전이면 큐 항목의 clientEventId). */
  readonly key: string;
  readonly participantId: string | null;
  /** 퇴장당한 팀. */
  readonly sideId: string;
  readonly redAt: MatchPosition;
  /** 남은 시간(ms) — 늘 0보다 크다. 끝난 패널티는 목록에 없다. */
  readonly remainingMs: number;
}

/** 레드카드 또는 골 한 건 — 이벤트 모양(콘솔 이벤트·공개 이벤트)과 무관한 계산용 표식. */
export interface PenaltyMarker {
  readonly key: string;
  readonly participantId: string | null;
  readonly sideId: string;
  readonly at: MatchPosition;
  /** 같은 시각일 때 앞뒤 — 이벤트는 sequence, 서버 확정 전 항목은 그 뒤. */
  readonly order: number;
}
type Marker = PenaltyMarker;

const QUEUED_ORDER_BASE = 1e15;

function compareMarkers(left: Marker, right: Marker): number {
  return left.at.period - right.at.period || left.at.clockMs - right.at.clockMs || left.order - right.order;
}

/** `from`에서 `to`까지 흐른 경기 시간(ms). 중간 피리어드 길이를 모르면 `null`. `to`가 앞이면 0. */
function elapsedMs(
  from: MatchPosition,
  to: MatchPosition,
  periodLengthMs: (period: number) => number | null,
): number | null {
  if (to.period < from.period || (to.period === from.period && to.clockMs <= from.clockMs)) return 0;
  if (to.period === from.period) return to.clockMs - from.clockMs;
  const firstLength = periodLengthMs(from.period);
  if (firstLength === null) return null;
  let total = Math.max(0, firstLength - from.clockMs);
  for (let period = from.period + 1; period < to.period; period += 1) {
    const length = periodLengthMs(period);
    if (length === null) return null;
    total += length;
  }
  return total + to.clockMs;
}

export function deriveRedCardPenalties(input: {
  readonly events: readonly GameEventRecord[];
  readonly queuedItems?: readonly QueuedGameEvent[];
  /** 지금 경기 시점. */
  readonly now: MatchPosition;
  /** 그 피리어드의 설정 길이(ms). 모르면 `null` — 전·후반 경계를 넘는 패널티는 계산하지 않는다(값을 지어내지 않는다). */
  readonly periodLengthMs: (period: number) => number | null;
  /** 정정된 시각을 반영한다. 없으면 `event.clockMs`. */
  readonly clockMsOf?: (event: GameEventRecord) => number;
}): readonly RedCardPenalty[] {
  const { events, queuedItems = [], now, periodLengthMs, clockMsOf } = input;
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null && id !== undefined),
  );
  const knownClientEventIds = new Set(events.map((event) => event.clientEventId));
  const reds: Marker[] = [];
  const goals: Marker[] = [];

  for (const event of events) {
    if (reversedIds.has(event.id) || event.sideId === null || event.sideId === undefined) continue;
    const marker: Marker = {
      key: event.id,
      participantId: event.participantId ?? null,
      sideId: event.sideId,
      at: { period: event.period, clockMs: clockMsOf?.(event) ?? event.clockMs },
      order: event.sequence,
    };
    if (event.type === 'CARD' && event.payload.card === 'RED') reds.push(marker);
    else if (event.type === 'GOAL' || event.type === 'OWN_GOAL') goals.push(marker);
  }
  for (const [index, { status, event, clientEventId }] of queuedItems.entries()) {
    // 서버가 이미 확정해 로그에 들어온 항목이 큐에 아직 남아 있으면 두 번 세지 않는다.
    if ((status !== 'queued' && status !== 'sending') || knownClientEventIds.has(clientEventId)) continue;
    if (event.sideId === undefined || event.sideId === '') continue;
    const marker: Marker = {
      key: clientEventId,
      participantId: event.participantId ?? null,
      sideId: event.sideId,
      at: { period: event.period, clockMs: event.clockMs },
      order: QUEUED_ORDER_BASE + index,
    };
    if (event.type === 'CARD' && event.payload.card === 'RED') reds.push(marker);
    else if (event.type === 'GOAL' || event.type === 'OWN_GOAL') goals.push(marker);
  }

  return derivePenaltiesFromMarkers({ reds, goals, now, periodLengthMs });
}

/**
 * 레드카드·골 표식에서 패널티를 접는 핵심 계산. 운영 콘솔(`deriveRedCardPenalties`)과 공개 경기 화면이 같은 규칙을
 * 쓰도록 이벤트 모양과 무관한 표식(`PenaltyMarker`)만 받는다.
 */
export function derivePenaltiesFromMarkers(input: {
  readonly reds: readonly PenaltyMarker[];
  readonly goals: readonly PenaltyMarker[];
  readonly now: MatchPosition;
  readonly periodLengthMs: (period: number) => number | null;
}): readonly RedCardPenalty[] {
  const { reds, goals, now, periodLengthMs } = input;
  const penalties: RedCardPenalty[] = [];
  for (const sideId of new Set(reds.map((red) => red.sideId))) {
    const sideReds = reds.filter((red) => red.sideId === sideId).sort(compareMarkers);
    const opponentGoals = goals.filter((goal) => goal.sideId !== sideId).sort(compareMarkers);

    // 상대 골 1개는 그 시점에 아직 대기 중이던 퇴장 중 가장 먼저 퇴장한 한 명분을 끝낸다.
    const released = new Set<string>();
    for (const goal of opponentGoals) {
      const serving = sideReds.find(
        (red) =>
          !released.has(red.key) &&
          compareMarkers(red, goal) < 0 &&
          (elapsedMs(red.at, goal.at, periodLengthMs) ?? 0) < RED_CARD_PENALTY_MS,
      );
      if (serving !== undefined) released.add(serving.key);
    }

    for (const red of sideReds) {
      if (released.has(red.key)) continue;
      const elapsed = elapsedMs(red.at, now, periodLengthMs);
      if (elapsed === null) continue;
      const remainingMs = RED_CARD_PENALTY_MS - elapsed;
      if (remainingMs <= 0) continue;
      penalties.push({ key: red.key, participantId: red.participantId, sideId, redAt: red.at, remainingMs });
    }
  }
  return penalties.sort((left, right) => left.remainingMs - right.remainingMs);
}

/** 남은 시간 표시 — 올림한 초를 `분:초`로("1:23"). 막 퇴장했을 때 "2:00"으로 시작해 0이 되기 직전까지 "0:01"이다. */
export function formatPenaltyRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
