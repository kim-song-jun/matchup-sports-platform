import { normalizeCompetitionPeriods } from './competition-config-periods';

const halves = [
  { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
  { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
];
const single = [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 30, extraTime: false }];

describe('normalizeCompetitionPeriods', () => {
  it('전·후반을 하나로 줄이면 단일 피리어드가 된다', () => {
    expect(normalizeCompetitionPeriods(halves, [{ durationMinutes: 30 }])).toEqual(single);
  });

  it('단판을 다시 둘로 나누면 단일·2피리어드가 아니라 전·후반으로 저장한다', () => {
    expect(normalizeCompetitionPeriods(single, [{ durationMinutes: 25 }, { durationMinutes: 15 }])).toEqual([
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 25, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 15, extraTime: false },
    ]);
  });

  it('전·후반 뒤에 피리어드를 더하면 기존 둘은 유지하고 새 행만 번호로 붙인다', () => {
    expect(normalizeCompetitionPeriods(halves, [{ durationMinutes: 20 }, { durationMinutes: 20 }, { durationMinutes: 10 }])).toEqual([
      ...halves,
      { code: 'PERIOD_3', label: '3피리어드', durationMinutes: 10, extraTime: false },
    ]);
  });
});
