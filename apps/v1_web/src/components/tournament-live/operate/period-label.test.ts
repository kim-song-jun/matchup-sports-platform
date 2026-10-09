import { describe, expect, it } from 'vitest';
import { endPeriodLabel, periodLabel, periodPrefix, regularPeriodCountOf } from './period-label';

describe('periodLabel', () => {
  it('1피리어드는 "전반", 2피리어드는 "후반"으로 부른다', () => {
    expect(periodLabel(1)).toBe('전반');
    expect(periodLabel(2)).toBe('후반');
  });

  it('3피리어드 이상은 전/후반이 뜻을 잃으므로 번호 기반으로 되돌아간다', () => {
    expect(periodLabel(3)).toBe('3피리어드');
    expect(periodLabel(4)).toBe('4피리어드');
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
