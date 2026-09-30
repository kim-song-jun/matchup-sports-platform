import { activityMonth } from './activity-counts';

describe('activityMonth', () => {
  it('KST 달로 자른다 — KST 10/1 00:30 은 10월, 9/30 23:59 는 9월', () => {
    expect(activityMonth(new Date('2026-09-30T15:30:00Z'))).toEqual({
      monthStart: new Date('2026-09-30T15:00:00Z'),
      nextMonthStart: new Date('2026-10-31T15:00:00Z'),
    });
    expect(activityMonth(new Date('2026-09-30T14:59:00Z'))).toEqual({
      monthStart: new Date('2026-08-31T15:00:00Z'),
      nextMonthStart: new Date('2026-09-30T15:00:00Z'),
    });
  });

  it('12월에서 다음 해 1월로 넘어간다', () => {
    expect(activityMonth(new Date('2026-12-15T03:00:00Z')).nextMonthStart).toEqual(new Date('2026-12-31T15:00:00Z'));
  });
});
