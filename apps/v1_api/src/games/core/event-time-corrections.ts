/**
 * MD-QA #187 — 경기 사건의 기록 시각 정정(append-only).
 *
 * 원본 사건 행(`V1GameEvent`)은 절대 고치지 않는다. 시각 정정은 새 `TIME_CORRECTION` 행으로
 * 남고, 그 행의 `correctsEventId` 가 원본을, `clockMs` 가 새 시각을, `payload` 가 이전 시각·
 * 사유를 담는다. 한 사건을 여러 번 정정할 수 있으며 **가장 큰 sequence 의 정정이 현재 값**이다.
 *
 * 시각을 화면에 내는 모든 읽기 모델(콘솔 스냅샷·공개 경기 상세·일정 카드·팀 전적·결과
 * 리비전 파생)은 이 파일의 `foldEventTimeCorrections` 를 거쳐 정정을 반영한다. 정정 행은
 * 점수·카드 수·출전에 아무 영향을 주지 않는다 — 원본의 타입·선수·팀은 그대로다.
 */
import type { Prisma } from '@prisma/client';

export const TIME_CORRECTION_EVENT_TYPE = 'TIME_CORRECTION' as const;

/**
 * 시각을 정정할 수 있는 사건 타입 — 선수·팀에 귀속되는 "경기 중 일어난 일" 전부다.
 * 피리어드 시작/종료·일시정지/재개는 `V1GamePeriod` 가 실제 시각을 따로 들고 있어
 * 사건 시각이 아니고, CORRECTION(취소)·TIME_CORRECTION 은 사건이 아니라 사건에 대한 기록이다.
 * DB 트리거 `v1_guard_game_event_time_correction` 의 목록과 같아야 한다.
 */
export const TIME_CORRECTABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'GOAL',
  'OWN_GOAL',
  'CARD',
  'FOUL',
  'SUBSTITUTION',
]);

export type FoldableGameEvent = {
  id: string;
  type: string;
  clockMs: number;
  sequence?: number;
  correctsEventId?: string | null;
};

export type EventTimeCorrectionPayload = {
  previousClockMs: number;
  clockMs: number;
  reason: string;
  /** 'OPERATOR'(확정 전 운영 콘솔) 또는 'PLATFORM_ADMIN'(확정 후 어드민). */
  lane: 'OPERATOR' | 'PLATFORM_ADMIN';
};

export function isTimeCorrectionEvent(event: { type: string }): boolean {
  return event.type === TIME_CORRECTION_EVENT_TYPE;
}

/** 원본 사건 id → 현재(가장 최근) 정정 시각. sequence 가 없으면 배열 순서를 쓴다. */
export function latestEventTimeCorrections(
  events: readonly FoldableGameEvent[],
): ReadonlyMap<string, number> {
  const latest = new Map<string, { order: number; clockMs: number }>();
  events.forEach((event, index) => {
    if (!isTimeCorrectionEvent(event) || typeof event.correctsEventId !== 'string') return;
    const order = event.sequence ?? index;
    const current = latest.get(event.correctsEventId);
    if (current === undefined || order > current.order) {
      latest.set(event.correctsEventId, { order, clockMs: event.clockMs });
    }
  });
  return new Map([...latest].map(([eventId, value]) => [eventId, value.clockMs] as const));
}

/**
 * 정정 행을 접어 원본의 `clockMs` 에 현재 시각을 반영하고, 정정 행 자체는 뺀다.
 * 순서는 입력 그대로다 — 시각순이 필요한 호출자는 `sortEventsByMatchTime` 을 덧붙인다.
 */
export function foldEventTimeCorrections<T extends FoldableGameEvent>(events: readonly T[]): T[] {
  const corrected = latestEventTimeCorrections(events);
  return events
    .filter((event) => !isTimeCorrectionEvent(event))
    .map((event) => {
      const clockMs = corrected.get(event.id);
      return clockMs === undefined || clockMs === event.clockMs ? event : { ...event, clockMs };
    });
}

/**
 * 운영 콘솔의 이벤트 로그처럼 **sequence 가 끊기면 안 되는** 응답용. 정정 행은 그대로 두고
 * 원본의 `clockMs` 만 현재 시각으로 바꾼다(콘솔은 연속 sequence 로 누락을 감지한다).
 */
export function overlayEventTimeCorrections<T extends FoldableGameEvent>(events: readonly T[]): T[] {
  const corrected = latestEventTimeCorrections(events);
  return events.map((event) => {
    if (isTimeCorrectionEvent(event)) return event;
    const clockMs = corrected.get(event.id);
    return clockMs === undefined || clockMs === event.clockMs ? event : { ...event, clockMs };
  });
}

/** 공개 타임라인의 정렬 규칙(피리어드 → 시각 → sequence) — DB `orderBy` 를 정정 뒤에 다시 적용한다. */
export function sortEventsByMatchTime<T extends { period: number; clockMs: number; sequence?: number }>(
  events: readonly T[],
): T[] {
  return [...events].sort(
    (left, right) =>
      left.period - right.period ||
      left.clockMs - right.clockMs ||
      (left.sequence ?? 0) - (right.sequence ?? 0),
  );
}

/**
 * 시각순으로 읽은 목록용 — 정정이 하나도 없으면 DB 가 준 순서를 그대로 두고,
 * 정정이 있을 때만 접은 뒤 시각순을 다시 맞춘다.
 */
export function foldEventTimeCorrectionsInMatchOrder<
  T extends FoldableGameEvent & { period: number },
>(events: readonly T[]): T[] {
  if (!events.some(isTimeCorrectionEvent)) return [...events];
  return sortEventsByMatchTime(foldEventTimeCorrections(events));
}

/** 쿼리에 붙이는 조건 — 타입으로 좁혀 읽는 곳도 정정 행을 함께 읽어야 fold 가 된다. */
export const TIME_CORRECTION_ROW_FILTER = {
  correctsEventId: { not: null },
} as const satisfies Prisma.V1GameEventWhereInput;

/**
 * 정정 시각의 상한(ms). 피리어드 설정 길이와 그 피리어드가 실제로 흐른 시간(추가 시간 포함,
 * 일시정지 제외) 중 큰 값이다 — 추가 시간에 받은 카드도 정정할 수 있어야 하고, 설정 길이를
 * 모르는 레거시 경기라도 실제로 흐른 시간 밖으로는 못 옮긴다. 둘 다 모르면 null(상한 없음).
 */
export function eventClockUpperBoundMs(input: {
  configuredMinutes: number | null;
  period: {
    startedAt: Date | null;
    endedAt: Date | null;
    pausedTotalMs: number;
    pausedAt: Date | null;
  } | null;
  now: Date;
}): number | null {
  const configuredMs = input.configuredMinutes === null ? null : Math.round(input.configuredMinutes * 60_000);
  let playedMs: number | null = null;
  const period = input.period;
  if (period !== null && period.startedAt !== null) {
    const end = period.endedAt ?? input.now;
    const openPauseMs =
      period.endedAt === null && period.pausedAt !== null
        ? Math.max(0, input.now.getTime() - period.pausedAt.getTime())
        : 0;
    playedMs = Math.max(
      0,
      end.getTime() - period.startedAt.getTime() - Math.max(0, period.pausedTotalMs) - openPauseMs,
    );
  }
  if (configuredMs === null && playedMs === null) return null;
  return Math.max(configuredMs ?? 0, playedMs ?? 0);
}

/** 결과 리비전 골 스냅샷이 쓰는 분 표기 — `deriveTournamentRevision` 과 같은 식이다. */
export function revisionMinuteFromClock(clockMs: number): number {
  return Math.max(0, Math.ceil(clockMs / 60_000));
}

/**
 * 결과 리비전(`goalEvents` JSON · 참가자 `cards.events`)에 박힌 사건 분을 정정 시각으로 맞춘다.
 * 바뀐 것이 없으면 null — 호출자는 새 리비전을 만들지 않는다. 점수·카드 수·선수는 건드리지 않는다.
 */
export function applyEventTimesToRevisionSnapshot(input: {
  goalEvents: Prisma.JsonValue | null;
  participants: readonly { id: string; cards: Prisma.JsonValue }[];
  clockByEventId: ReadonlyMap<string, number>;
}): {
  goalEvents: Prisma.JsonValue | null;
  participantCards: ReadonlyMap<string, Prisma.JsonValue>;
} | null {
  let changed = false;
  const minuteOf = (eventId: unknown): number | undefined => {
    if (typeof eventId !== 'string') return undefined;
    const clockMs = input.clockByEventId.get(eventId);
    return clockMs === undefined ? undefined : revisionMinuteFromClock(clockMs);
  };
  const goalEvents = Array.isArray(input.goalEvents)
    ? input.goalEvents.map((goal) => {
        if (goal === null || typeof goal !== 'object' || Array.isArray(goal)) return goal;
        const minute = minuteOf(goal.id);
        if (minute === undefined || goal.minute === minute) return goal;
        changed = true;
        return { ...goal, minute };
      })
    : input.goalEvents;
  const participantCards = new Map<string, Prisma.JsonValue>();
  for (const participant of input.participants) {
    const cards = participant.cards;
    if (cards === null || typeof cards !== 'object' || Array.isArray(cards) || !Array.isArray(cards.events)) continue;
    let participantChanged = false;
    const events = cards.events.map((card) => {
      if (card === null || typeof card !== 'object' || Array.isArray(card)) return card;
      const minute = minuteOf(card.id);
      if (minute === undefined || card.minute === minute) return card;
      participantChanged = true;
      return { ...card, minute };
    });
    if (participantChanged) {
      changed = true;
      participantCards.set(participant.id, { ...cards, events });
    }
  }
  return changed ? { goalEvents, participantCards } : null;
}
