import { describe, expect, it } from 'vitest';
import { formatGoalMinute, isClockAbnormal } from './format';

/**
 * alpha 실측 사고(2026-08) 회귀 방지 -- 실제 DB 값으로 재현한다.
 * `v1_game_events.clock_ms`: CARD 649,891 / 652,602 / 655,603 / 657,938ms
 * (전부 ≈11분, 정상) vs GOAL 27,166,083ms(≈452분, 이상값 -- 공개 일정
 * 화면에 `452′`로 그대로 나갔던 값). `isClockAbnormal`은 이 정상/이상값을
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
    expect(formatGoalMinute(27_166_083)).toBe('452′');
  });
});
