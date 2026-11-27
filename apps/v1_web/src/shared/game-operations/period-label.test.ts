import { describe, expect, it } from 'vitest';
import { endPeriodLabel, periodLabel, periodPrefix, regularPeriodCountOf } from './period-label';

describe('periodLabel', () => {
  it('1피리어드는 "전반", 2피리어드는 "후반"으로 부른다', () => {
    expect(periodLabel(1)).toBe('전반');
    expect(periodLabel(2)).toBe('후반');
  });

  it('정규 전·후반 뒤의 셋째·넷째는 연장 전반·연장 후반이다', () => {
    expect(periodLabel(3)).toBe('연장 전반');
    expect(periodLabel(4)).toBe('연장 후반');
    expect(periodLabel(3, 2)).toBe('연장 전반');
    expect(periodLabel(4, 2)).toBe('연장 후반');
  });

  it('그 밖의 구간과 정규 구간이 셋 이상인 경기는 번호로 부른다', () => {
    expect(periodLabel(5)).toBe('5번째 경기 시간');
    expect(periodLabel(3, 4)).toBe('3번째 경기 시간');
    expect(periodLabel(4, 4)).toBe('4번째 경기 시간');
  });

  it('어떤 이름에도 「피리어드」를 쓰지 않는다', () => {
    for (const number of [1, 2, 3, 4, 5, 6]) expect(periodLabel(number)).not.toContain('피리어드');
  });
});

describe('단판 표기', () => {
  it('정규 1개면 말머리가 없고 종료 버튼은 "정규 시간 종료"다', () => {
    expect(periodPrefix(1, 1)).toBe('');
    expect(endPeriodLabel(1, 1)).toBe('정규 시간 종료');
    expect(periodLabel(1, 1)).toBe('경기');
  });

  it('2피리어드 경기와 피리어드 수를 모르는 경기는 전/후반 그대로다', () => {
    for (const count of [2, null, undefined]) {
      expect(periodPrefix(1, count)).toBe('전반 ');
      expect(endPeriodLabel(1, count)).toBe('전반 종료');
      expect(endPeriodLabel(2, count)).toBe('후반 종료');
    }
  });
});

describe('정규 구간이 셋 이상인 경기', () => {
  it('말머리와 종료 문구도 구간 수를 따라 번호로 부른다 — 정규 셋째 구간이 「연장」으로 나오지 않는다', () => {
    expect(periodPrefix(3, 4)).toBe('3번째 경기 시간 ');
    expect(endPeriodLabel(3, 4)).toBe('3번째 경기 시간 종료');
    expect(periodPrefix(3, 2)).toBe('연장 전반 ');
    expect(endPeriodLabel(3, 2)).toBe('연장 전반 종료');
  });
});

describe('regularPeriodCountOf', () => {
  const regular = { extraTime: false };
  it('연장 설정은 정규 수에서 뺀다', () => {
    expect(regularPeriodCountOf(2, [regular, { extraTime: true }])).toBe(1);
    expect(regularPeriodCountOf(3, [regular, regular, { extraTime: true }])).toBe(2);
  });
  it('길이 설정이 없으면 행 수를 쓰고, 행이 없으면 null이다', () => {
    expect(regularPeriodCountOf(1, null)).toBe(1);
    expect(regularPeriodCountOf(2, undefined)).toBe(2);
    expect(regularPeriodCountOf(0, null)).toBeNull();
  });
});
