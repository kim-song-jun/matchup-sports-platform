/**
 * 경기를 끝내기 전 "쉬는 구간"에서도 사건을 기록할 수 있는지 판정한다(2026-11-18 사용자 확정, 정본 §6).
 *
 * 사건은 원래 지금 `LIVE` 인 기간에만 붙는다. 하지만 현장에서는 하프타임이나 정규 시간 종료 직후에야
 * 방금 지나간 골·카드·파울이 빠진 걸 알아챈다. 그 구간(경기는 아직 `LIVE`, 방금 끝난 기간은 `ENDED`)에서는
 * 아래 종류의 사건에 한해 방금 끝난 기간에 붙여 받는다.
 *
 * - **하프타임**: 다음 기간이 `HALFTIME` 이고 그 앞 기간이 모두 `ENDED` 일 때, 방금 끝난 기간(전반)에 붙인다.
 * - **정규 시간 종료**: 모든 기간이 `ENDED` 일 때 마지막 기간에 붙인다.
 *
 * 받지 않는 것: 교체(`SUBSTITUTION`)와 그 밖의 사건 종류, 다음 기간이 이미 시작된 뒤의 앞 기간,
 * 경기가 `LIVE` 가 아닐 때(종료 뒤에는 결과 정정으로 고친다), 기간 설정 길이를 넘는 시각.
 *
 * DB 를 읽지 않는 순수 함수라 서비스(`GamesService.assertEventReferences`)가 읽어 온 값을 넘기고
 * 규칙 자체는 여기서 단위 테스트한다.
 */
import { V1GameEventType, V1GamePeriodState, V1GameState } from '@prisma/client';

/** 쉬는 구간에도 늦게 기록할 수 있는 사건 종류. 교체는 일부러 뺐다 — 새 기간의 출전 명단에 영향을 준다. */
export const BREAK_RECORDABLE_EVENT_TYPES: ReadonlySet<V1GameEventType> = new Set<V1GameEventType>([
  V1GameEventType.GOAL,
  V1GameEventType.OWN_GOAL,
  V1GameEventType.CARD,
  V1GameEventType.FOUL,
]);

export interface BreakRecordingInput {
  readonly gameState: V1GameState;
  readonly eventType: V1GameEventType;
  /** 사건이 붙으려는 기간 번호. 호출부가 이미 `ENDED` 인 기간임을 확인했다. */
  readonly periodNumber: number;
  /** 이 경기의 모든 기간(번호와 상태). */
  readonly periods: ReadonlyArray<{ readonly number: number; readonly state: V1GamePeriodState }>;
  readonly clockMs: number;
  /** 그 기간의 설정 길이(분). 읽지 못하면 `undefined` 이고 시각 상한을 두지 않는다. */
  readonly durationMinutes: number | undefined;
}

export function isRecordableDuringBreak(input: BreakRecordingInput): boolean {
  if (input.gameState !== V1GameState.LIVE) return false;
  if (!BREAK_RECORDABLE_EVENT_TYPES.has(input.eventType)) return false;
  const { periods, periodNumber } = input;
  if (periods.length === 0) return false;

  const upToTarget = periods.filter((period) => period.number <= periodNumber);
  if (upToTarget.length === 0 || upToTarget.some((period) => period.state !== V1GamePeriodState.ENDED)) return false;

  const later = periods.filter((period) => period.number > periodNumber);
  const regulationEnded = later.length === 0;
  const halftimeAfterTarget = later.some(
    (period) => period.number === periodNumber + 1 && period.state === V1GamePeriodState.HALFTIME,
  );
  if (!regulationEnded && !halftimeAfterTarget) return false;

  return input.durationMinutes === undefined || input.clockMs <= input.durationMinutes * 60_000;
}
