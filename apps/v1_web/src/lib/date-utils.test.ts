import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatKstDateShort, formatKstTime, formatTournamentDateTimeLong, formatTournamentDateTimeShort } from './date-utils';

describe('formatKstTime / formatKstDateShort (리그 대진 timing 타임라인)', () => {
  it('실행 타임존과 무관하게 KST 벽시계로 표기한다', () => {
    expect(formatKstTime('2026-09-02T13:00:00.000Z')).toBe('22:00'); // 13:00Z = 22:00 KST
    expect(formatKstDateShort('2026-09-02T13:00:00.000Z')).toBe('9. 2. (수)');
  });

  it('invalid 문자열은 원본을 그대로 반환한다', () => {
    expect(formatKstTime('nope')).toBe('nope');
    expect(formatKstDateShort('nope')).toBe('nope');
  });
});

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

describe('formatTournamentDateTimeShort', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('서버가 보내는 UTC 타임스탬프를 KST 기준 M/D (요일) HH:MM 으로 변환한다', () => {
    expect(formatTournamentDateTimeShort('2026-08-07T11:00:00.000Z')).toBe('8/7 (금) 20:00');
  });

  it('UTC 자정 경계를 넘어 KST 날짜가 바뀌는 경우도 정확히 넘어간다', () => {
    // UTC 2026-08-06 23:30 -> KST 2026-08-07 08:30 (날짜가 하루 넘어감)
    expect(formatTournamentDateTimeShort('2026-08-06T23:30:00.000Z')).toBe('8/7 (금) 08:30');
  });

  it('dateStr이 없거나 invalid이면 null을 반환한다', () => {
    expect(formatTournamentDateTimeShort(null)).toBeNull();
    expect(formatTournamentDateTimeShort(undefined)).toBeNull();
    expect(formatTournamentDateTimeShort('not-a-date')).toBeNull();
  });
});
