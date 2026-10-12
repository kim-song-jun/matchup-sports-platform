import { kstDayRange, toSportFacets, totalFromSportFacets } from './list-facets';

describe('kstDayRange', () => {
  it('KST 자정 직전과 직후를 서로 다른 날로 가른다', () => {
    // 2026-10-12T14:59:59Z = KST 23:59:59, 15:00:00Z = KST 다음 날 00:00:00.
    const before = kstDayRange(new Date('2026-10-12T14:59:59Z'));
    const after = kstDayRange(new Date('2026-10-12T15:00:00Z'));
    expect(before.gte.toISOString()).toBe('2026-10-11T15:00:00.000Z');
    expect(before.lt.toISOString()).toBe('2026-10-12T15:00:00.000Z');
    expect(after.gte.toISOString()).toBe('2026-10-12T15:00:00.000Z');
    expect(after.lt.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });
});

describe('toSportFacets / totalFromSportFacets', () => {
  const sports = toSportFacets([
    { sportId: 'b', _count: { _all: 2 } },
    { sportId: 'a', _count: { _all: 2 } },
    { sportId: 'c', _count: { _all: 5 } },
    { sportId: 'z', _count: { _all: 0 } },
  ]);

  it('건수 내림차순·동률 id 순으로 정렬하고 0건 종목은 뺀다', () => {
    expect(sports.map((s) => s.sportId)).toEqual(['c', 'a', 'b']);
  });

  it('종목 필터가 없으면 합계, 있으면 그 종목 건수가 전체 건수다', () => {
    expect(totalFromSportFacets(sports)).toBe(9);
    expect(totalFromSportFacets(sports, 'a')).toBe(2);
    expect(totalFromSportFacets(sports, 'missing')).toBe(0);
  });
});
