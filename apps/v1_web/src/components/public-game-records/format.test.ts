import { describe, expect, it } from 'vitest';
import { formatClock, formatGoalMinute, formatPenaltyScoreline, formatScoreline, isClockAbnormal } from './format';

/**
 * alpha 실측 사고(2026-08) 회귀 방지 -- 실제 DB 값으로 재현한다.
 * `v1_game_events.clock_ms`: CARD 649,891 / 652,602 / 655,603 / 657,938ms
 * (전부 ≈11분, 정상) vs GOAL 27,166,083ms(≈452분, 이상값 -- 공개 일정
 * 화면에 과도한 분 값으로 그대로 나갔던 값). `isClockAbnormal`은 이 정상/이상값을
 * 정확히 갈라야 실제 사고를 재현·방지한다.
 */
describe('isClockAbnormal', () => {
  it('실측 사고의 정상 CARD 이벤트들(≈11분)은 이상값으로 보지 않는다', () => {
    expect(isClockAbnormal(649_891)).toBe(false);
    expect(isClockAbnormal(652_602)).toBe(false);
    expect(isClockAbnormal(655_603)).toBe(false);
    expect(isClockAbnormal(657_938)).toBe(false);
  });

  it('실측 사고의 이상값 GOAL 이벤트(27,166,083ms ≈ 452분)는 이상값으로 판정한다', () => {
    expect(isClockAbnormal(27_166_083)).toBe(true);
  });

  it('null(시각 없음)은 이상값이 아니다', () => {
    expect(isClockAbnormal(null)).toBe(false);
  });

  it('경계값: 정확히 90분은 아직 정상, 1ms만 넘으면 이상값이다', () => {
    const ninetyMinutesMs = 90 * 60_000;
    expect(isClockAbnormal(ninetyMinutesMs)).toBe(false);
    expect(isClockAbnormal(ninetyMinutesMs + 1)).toBe(true);
  });

  // `isClockAbnormal`은 숫자를 고치거나 숨기지 않는다는 계약 -- 이상값이어도
  // `formatGoalMinute`가 실제 값을 그대로(조작 없이) 반환하는지 함께 못박는다.
  it('이상값이어도 formatGoalMinute는 실제 clockMs를 그대로 표시한다(숫자 조작 금지)', () => {
    expect(isClockAbnormal(27_166_083)).toBe(true);
    expect(formatGoalMinute(27_166_083)).toBe('453′');
  });

  it('2분 4초 이벤트를 축구 기록 관례에 따라 3분으로 올림한다', () => {
    expect(formatGoalMinute(124_000)).toBe('3′');
    expect(formatClock(124_000)).toBe('3′');
  });
});

/**
 * 승부차기 보조 표기 계약. 축구에서 승부차기는 정규시간 무승부를 유지한 채 진출팀만
 * 가르므로, 큰 스코어(`formatScoreline`)는 절대 승부차기 숫자로 바뀌면 안 되고
 * 승부차기는 그 아래 보조 텍스트로만 나와야 한다. 두 함수를 한 테스트에서 함께
 * 단언하는 이유 -- 한쪽만 보면 "정규 스코어가 승부차기로 덮였다"는 실제 표시 사고를
 * 못 잡는다.
 */
describe('formatPenaltyScoreline', () => {
  it('승부차기가 있으면 보조 텍스트를 내고, 정규시간 스코어는 그대로 둔다', () => {
    const score = { home: 1, away: 1, penalties: { home: 4, away: 3 } };
    expect(formatScoreline(score, 'official')).toBe('1 : 1');
    expect(formatPenaltyScoreline(score, 'official')).toBe('승부차기 4-3');
  });

  it('승부차기가 없는 경기(penalties: null)는 아무 텍스트도 만들지 않는다', () => {
    expect(formatPenaltyScoreline({ home: 2, away: 0, penalties: null }, 'official')).toBeNull();
  });

  it('score 자체가 없으면 null이다', () => {
    expect(formatPenaltyScoreline(null, 'official')).toBeNull();
  });

  it('scoreStatus가 unavailable이면 승부차기 값이 있어도 숨긴다(스코어를 숨기는 경기의 보조 표기도 함께 숨는다)', () => {
    expect(
      formatPenaltyScoreline({ home: 1, away: 1, penalties: { home: 4, away: 3 } }, 'unavailable'),
    ).toBeNull();
  });
});
