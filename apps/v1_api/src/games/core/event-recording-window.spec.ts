import { V1GameEventType, V1GamePeriodState, V1GameState } from '@prisma/client';
import {
  BREAK_RECORDABLE_EVENT_TYPES,
  isRecordableDuringBreak,
  type BreakRecordingInput,
} from './event-recording-window';

/**
 * 경기 종료 전 쉬는 구간(하프타임·정규 시간 종료)의 사건 기록 규칙(2026-11-18 사용자 확정).
 * 전반/후반 2기간 경기를 기준으로, 상태 조합마다 어느 기간에 어떤 사건이 들어가는지 고정한다.
 */
const ENDED = V1GamePeriodState.ENDED;
const HALFTIME = V1GamePeriodState.HALFTIME;
const LIVE_PERIOD = V1GamePeriodState.LIVE;
const SCHEDULED = V1GamePeriodState.SCHEDULED;

const AT_HALFTIME = [
  { number: 1, state: ENDED },
  { number: 2, state: HALFTIME },
];
const AT_REGULATION_END = [
  { number: 1, state: ENDED },
  { number: 2, state: ENDED },
];

function input(overrides: Partial<BreakRecordingInput>): BreakRecordingInput {
  return {
    gameState: V1GameState.LIVE,
    eventType: V1GameEventType.GOAL,
    periodNumber: 1,
    periods: AT_HALFTIME,
    clockMs: 10 * 60_000,
    durationMinutes: 15,
    ...overrides,
  };
}

describe('isRecordableDuringBreak — 쉬는 구간의 사건 기록', () => {
  describe('하프타임(전반 ENDED, 후반 HALFTIME)', () => {
    it('골·자책골·옐로/레드카드(CARD)·파울을 전반에 붙여 받는다', () => {
      for (const eventType of [
        V1GameEventType.GOAL,
        V1GameEventType.OWN_GOAL,
        V1GameEventType.CARD,
        V1GameEventType.FOUL,
      ]) {
        expect(isRecordableDuringBreak(input({ eventType }))).toBe(true);
      }
    });

    it('교체와 그 밖의 사건 종류는 계속 막는다', () => {
      for (const eventType of [
        V1GameEventType.SUBSTITUTION,
        V1GameEventType.CORRECTION,
        V1GameEventType.PERIOD_START,
        V1GameEventType.PERIOD_END,
        V1GameEventType.PAUSE,
        V1GameEventType.RESUME,
        V1GameEventType.TIME_CORRECTION,
      ]) {
        expect(isRecordableDuringBreak(input({ eventType }))).toBe(false);
      }
    });

    it('시각이 전반 설정 길이 이하면 받고 넘으면 거절한다', () => {
      expect(isRecordableDuringBreak(input({ clockMs: 15 * 60_000 }))).toBe(true);
      expect(isRecordableDuringBreak(input({ clockMs: 15 * 60_000 + 1 }))).toBe(false);
    });

    it('설정 길이를 읽지 못하면 시각 상한 없이 받는다', () => {
      expect(isRecordableDuringBreak(input({ durationMinutes: undefined, clockMs: 99 * 60_000 }))).toBe(true);
    });

    it('아직 시작하지 않은 후반(HALFTIME 기간)에는 붙이지 못한다', () => {
      expect(isRecordableDuringBreak(input({ periodNumber: 2 }))).toBe(false);
    });
  });

  describe('정규 시간 종료(모든 기간 ENDED, 경기는 LIVE)', () => {
    it('마지막 기간에 골·자책골·카드·파울을 받는다', () => {
      for (const eventType of [
        V1GameEventType.GOAL,
        V1GameEventType.OWN_GOAL,
        V1GameEventType.CARD,
        V1GameEventType.FOUL,
      ]) {
        expect(isRecordableDuringBreak(input({ periods: AT_REGULATION_END, periodNumber: 2, eventType }))).toBe(true);
      }
    });

    it('교체는 막는다', () => {
      expect(
        isRecordableDuringBreak(
          input({ periods: AT_REGULATION_END, periodNumber: 2, eventType: V1GameEventType.SUBSTITUTION }),
        ),
      ).toBe(false);
    });

    it('마지막이 아닌 기간(전반)에는 후반이 이미 끝났으면 붙이지 못한다', () => {
      expect(isRecordableDuringBreak(input({ periods: AT_REGULATION_END, periodNumber: 1 }))).toBe(false);
    });

    it('정규 시간을 넘는 시각은 거절한다', () => {
      expect(
        isRecordableDuringBreak(
          input({ periods: AT_REGULATION_END, periodNumber: 2, clockMs: 15 * 60_000 + 1 }),
        ),
      ).toBe(false);
    });

    it('단판(기간 1개) 경기도 정규 시간 종료 뒤 마지막 기간에 받는다', () => {
      expect(
        isRecordableDuringBreak(input({ periods: [{ number: 1, state: ENDED }], periodNumber: 1 })),
      ).toBe(true);
    });
  });

  describe('받지 않는 상태', () => {
    it('경기가 LIVE 가 아니면 받지 않는다 — 종료된 경기는 결과 정정으로 고친다', () => {
      for (const gameState of [V1GameState.ENDED, V1GameState.CANCELLED, V1GameState.PAUSED, V1GameState.SCHEDULED]) {
        expect(isRecordableDuringBreak(input({ gameState }))).toBe(false);
        expect(
          isRecordableDuringBreak(input({ gameState, periods: AT_REGULATION_END, periodNumber: 2 })),
        ).toBe(false);
      }
    });

    it('후반이 이미 시작되어 LIVE 이면 전반에는 더 붙이지 못한다', () => {
      expect(
        isRecordableDuringBreak(
          input({
            periods: [
              { number: 1, state: ENDED },
              { number: 2, state: LIVE_PERIOD },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('전반이 아직 진행 중이거나 시작 전이면 쉬는 구간이 아니다', () => {
      expect(
        isRecordableDuringBreak(
          input({
            periods: [
              { number: 1, state: LIVE_PERIOD },
              { number: 2, state: SCHEDULED },
            ],
          }),
        ),
      ).toBe(false);
      expect(
        isRecordableDuringBreak(
          input({
            periods: [
              { number: 1, state: SCHEDULED },
              { number: 2, state: SCHEDULED },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('기간이 없으면 받지 않는다', () => {
      expect(isRecordableDuringBreak(input({ periods: [] }))).toBe(false);
    });
  });

  describe('3기간 이상 경기', () => {
    const THIRDS_BREAK_AFTER_2 = [
      { number: 1, state: ENDED },
      { number: 2, state: ENDED },
      { number: 3, state: HALFTIME },
    ];

    it('두 번째 쉬는 시간에는 방금 끝난 2기간에 붙이고 1기간에는 붙이지 못한다', () => {
      expect(isRecordableDuringBreak(input({ periods: THIRDS_BREAK_AFTER_2, periodNumber: 2 }))).toBe(true);
      expect(isRecordableDuringBreak(input({ periods: THIRDS_BREAK_AFTER_2, periodNumber: 1 }))).toBe(false);
    });
  });

  it('쉬는 구간에 받는 사건 종류는 골·자책골·카드·파울 네 가지뿐이다', () => {
    expect([...BREAK_RECORDABLE_EVENT_TYPES].sort()).toEqual(
      [V1GameEventType.CARD, V1GameEventType.FOUL, V1GameEventType.GOAL, V1GameEventType.OWN_GOAL].sort(),
    );
  });
});
