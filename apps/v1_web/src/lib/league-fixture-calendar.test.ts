import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  describeDateSelection,
  monthOf,
  shiftMonth,
  toggleFixtureDate,
} from './league-fixture-calendar';

describe('buildMonthGrid', () => {
  it('달마다 칸 수가 흔들리지 않는다 — 항상 42칸', () => {
    // 주 수가 달마다 바뀌면 달을 넘길 때 격자 높이가 출렁여 연속 클릭이 빗나간다.
    for (const month of ['2026-02', '2026-08', '2026-09', '2027-01']) {
      expect(buildMonthGrid(month, '2026-09-04')).toHaveLength(42);
    }
  });

  it('일요일에서 시작한다', () => {
    expect(buildMonthGrid('2026-09', '2026-09-04')[0].weekday).toBe(0);
  });

  it('이웃 달 칸을 이 달로 착각하지 않는다', () => {
    const grid = buildMonthGrid('2026-09', '2026-09-04');
    // 2026-09-01 은 화요일이라 앞에 일·월 두 칸이 8월에서 넘어온다.
    expect(grid[0].inMonth).toBe(false);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it('오늘은 과거가 아니다 — 당일 경기를 못 만들면 운영자가 막힌다', () => {
    const grid = buildMonthGrid('2026-09', '2026-09-04');
    expect(grid.find((c) => c.date === '2026-09-04')?.past).toBe(false);
    expect(grid.find((c) => c.date === '2026-09-03')?.past).toBe(true);
  });
});

describe('toggleFixtureDate', () => {
  it('없으면 넣고 있으면 뺀다', () => {
    expect(toggleFixtureDate([], '2026-09-12')).toEqual(['2026-09-12']);
    expect(toggleFixtureDate(['2026-09-12'], '2026-09-12')).toEqual([]);
  });

  it('항상 오름차순으로 돌려준다 — 화면 순서와 배정 순서가 달라지면 안 된다', () => {
    expect(toggleFixtureDate(['2026-09-26', '2026-09-12'], '2026-09-19')).toEqual([
      '2026-09-12',
      '2026-09-19',
      '2026-09-26',
    ]);
  });
});

describe('shiftMonth', () => {
  it('해를 넘는다', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('여러 달을 건너뛴다', () => {
    expect(shiftMonth('2026-09', 5)).toBe('2027-02');
    expect(shiftMonth('2026-03', -5)).toBe('2025-10');
  });
  it('monthOf 와 왕복한다', () => {
    expect(monthOf('2026-09-04')).toBe('2026-09');
  });
});

describe('describeDateSelection', () => {
  it('부족은 몇 개 더 필요한지 말한다 — 서버가 422 로 거부하는 유일한 경우다', () => {
    expect(describeDateSelection(2, 5)).toEqual({
      state: 'short',
      message: '5개 필요한데 2개 골랐어요. 3개 더 고르세요.',
    });
  });

  it('초과는 오류가 아니다 — 남는 날짜는 서버가 그냥 안 쓴다', () => {
    // 부족과 같은 톤으로 보여주면 운영자가 멀쩡한 입력을 고치려 든다.
    const extra = describeDateSelection(7, 5);
    expect(extra.state).toBe('extra');
    expect(extra.message).not.toContain('더 고르세요');
  });

  it('딱 맞으면 그렇다고 말한다', () => {
    expect(describeDateSelection(5, 5).state).toBe('exact');
  });
});
