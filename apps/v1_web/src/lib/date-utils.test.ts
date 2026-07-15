import { describe, expect, it } from 'vitest';
import { formatTournamentDateTimeLong } from './date-utils';

describe('formatTournamentDateTimeLong', () => {
  it('includes the exact date, weekday, and time for a registration deadline', () => {
    expect(formatTournamentDateTimeLong('2026-07-20T18:30:00')).toBe(
      '2026년 7월 20일 (월) 오후 6:30',
    );
    expect(formatTournamentDateTimeLong('2026-07-20T09:05:00')).toBe(
      '2026년 7월 20일 (월) 오전 9:05',
    );
  });

  it('returns an honest fallback when the deadline is missing or invalid', () => {
    expect(formatTournamentDateTimeLong(null)).toBe('일정 미정');
    expect(formatTournamentDateTimeLong('not-a-date')).toBe('일정 미정');
  });
});
