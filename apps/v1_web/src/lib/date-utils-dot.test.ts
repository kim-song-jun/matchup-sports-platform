import { describe, expect, it } from 'vitest';
import { formatKstDotDate, formatKstDotMonthDay } from './date-utils';

describe('formatKstDotMonthDay / formatKstDotDate', () => {
  it('KST 기준 두 자리 월·일로 적는다', () => {
    // 2026-03-04T16:00Z = KST 3월 5일 01:00
    expect(formatKstDotMonthDay('2026-03-04T16:00:00.000Z')).toBe('03.05');
    expect(formatKstDotDate('2026-03-04T16:00:00.000Z')).toBe('2026.03.05');
    expect(formatKstDotDate('2026-11-11T03:00:00.000Z')).toBe('2026.11.11');
  });

  it('없거나 잘못된 값이면 null', () => {
    expect(formatKstDotMonthDay(null)).toBeNull();
    expect(formatKstDotDate('not-a-date')).toBeNull();
  });
});
