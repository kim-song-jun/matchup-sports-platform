/**
 * 레거시 대회 결과에서 복원된 GOAL 이벤트를 알아보는 판정 — 서버 쪽
 * `apps/v1_api/src/tournaments/tournament-fixture-official-result.ts` 의
 * `isPeriodUnknown`/`isMinuteUnknown` 과 같은 규칙이다.
 *
 * 왜 필요한가: 골 이벤트 백필(`apps/v1_api/src/games/migration/goal-event-backfill.ts`)이
 * 복원하는 원본(`v1_tournament_fixture_results` 의 goals[])에는 **전/후반이 아예 없고**,
 * 골에 따라 **분도 없다**. 그런데 `V1GameEvent` 의 `period`·`clockMs` 는 둘 다 non-null
 * 컬럼이라 그런 골도 `period: 1`, `clockMs: 0` 으로 저장될 수밖에 없다. 그 값을 그대로
 * 렌더하면 화면이 "전반 0:00 득점"이라고, 원본에 없던 사실을 단정한다.
 *
 * 공개 화면(대진표·타임라인·일정 카드)은 서버가 이미 `period`/`clockMs` 를 `null` 로
 * 내려서 이 문제를 없앴다. 운영 콘솔은 `game.snapshot` 의 **원시 이벤트 행**을 그대로
 * 받으므로(`GameEventRecord.period`·`clockMs` 는 여전히 non-null number) 같은 판정을
 * 클라이언트에서 해야 한다 — 그리고 결과 정정을 판단하는 화면이야말로 "0:00 에 득점"
 * 같은 거짓 주장이 가장 비싼 곳이다.
 *
 * `source` 확인이 핵심이다. `V1GameEvent.payload` 는 기록 클라이언트가 자유롭게 채우는
 * 객체라(`AppendGameEventDto` 는 `@IsObject()` 하나만 건다), `minuteKnown` 만 보고
 * 판정하면 라이브로 기록된 71분 골의 시각이 지워질 수 있다.
 */
const GOAL_BACKFILL_EVENT_SOURCE = 'GOAL_BACKFILL_V1';

function backfillPayload(payload: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (payload === null || payload === undefined) return null;
  return payload.source === GOAL_BACKFILL_EVENT_SOURCE ? payload : null;
}

/**
 * "이 이벤트는 백필이 복원한 골인가" = "전/후반(period)을 모르는가".
 * 백필이 쓴 행 전부가 대상이라 별도 표식이 필요 없다 — 원본에 period 가 없었다.
 */
export function isBackfilledEvent(payload: Record<string, unknown> | undefined | null): boolean {
  return backfillPayload(payload) !== null;
}

/**
 * "이 골은 레거시 기록에 분 자체가 없던 골인가" — 백필이 그런 골에만
 * `minuteKnown: false` 를 싣는다. 분이 남아 있던 골은 `clockMs` 가 실제 값이므로
 * 그대로 표시해야 한다.
 */
export function isBackfilledMinuteUnknown(payload: Record<string, unknown> | undefined | null): boolean {
  return backfillPayload(payload)?.minuteKnown === false;
}
