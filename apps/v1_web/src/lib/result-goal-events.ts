import type { GameResultGoalEventInput } from '@/hooks/use-tournament-result-review';
import type { GameEventRecord } from '@/types/game-operations';

export function deriveEditableGoalEvents(
  stored: readonly GameResultGoalEventInput[] | null | undefined,
  events: readonly GameEventRecord[],
): GameResultGoalEventInput[] {
  if (stored) return stored.map((event) => ({ ...event }));

  const reversed = new Set(
    events
      .filter((event) => event.type === 'CORRECTION' && event.reversesEventId)
      .map((event) => event.reversesEventId as string),
  );

  return events
    .filter(
      (event) =>
        (event.type === 'GOAL' || event.type === 'OWN_GOAL') &&
        event.sideId !== null &&
        !reversed.has(event.id),
    )
    .map((event) => ({
      id: event.id,
      sideId: event.sideId as string,
      ...(event.participantId ? { participantId: event.participantId } : {}),
      ...(event.payload.anonymous === true ? { anonymous: true } : {}),
      minute: Math.ceil(event.clockMs / 60_000),
      period: event.period,
      ownGoal: event.type === 'OWN_GOAL',
    }));
}

/**
 * 결과 정정 요청에 실을 goalEvents. 득점 기록 없이 점수만 확정된 경기(일정 보드 빠른 점수 확정 등)에서
 * 득점 행을 새로 넣지 않았으면 `undefined`(= 필드 생략)를 돌려 점수만 정정한다 — 빈 배열은 서버가
 * "득점 0건"으로 읽어 점수와 합계가 맞지 않는다고 422 로 거부한다(MD-QA #94). 원래 득점 기록이 있던
 * 경기에서 행을 전부 지운 경우는 그대로 빈 배열을 보내 서버 검증을 받는다.
 */
export function correctionGoalEventsPayload(
  baseGoalEvents: readonly GameResultGoalEventInput[],
  submitted: GameResultGoalEventInput[],
): GameResultGoalEventInput[] | undefined {
  return baseGoalEvents.length === 0 && submitted.length === 0 ? undefined : submitted;
}
