import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatAdminDate,
  formatKstDateShort,
  formatKstTime,
  formatTournamentDateRangeWithTime,
  formatTournamentDateShort,
  formatTournamentDateTimeLong,
  formatTournamentDateTimeShort,
} from './date-utils';

describe('formatAdminDate', () => {
  it('유효한 날짜는 Y.M.D (formatAdminDateTime의 날짜 전용 자매 스타일)', () => {
    expect(formatAdminDate('2026-08-05T10:00:00.000Z')).toMatch(/^2026\.8\.\d+$/);
  });

  it('빈 값은 대시, invalid는 원문 그대로', () => {
    expect(formatAdminDate(null)).toBe('—');
    expect(formatAdminDate(undefined)).toBe('—');
    expect(formatAdminDate('not-a-date')).toBe('not-a-date');
  });
});

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

describe('formatTournamentDateShort / formatTournamentDateTimeShort / formatTournamentDateRangeWithTime (공개 일정 화면)', () => {
  // 대회 킥오프는 서버가 KST 벽시계로 배치하는 계약이다(round-robin-schedule.ts) — 공개
  // 일정·대진표 화면은 뷰어 기기 타임존과 무관하게 항상 그 KST 시각을 보여줘야 어드민이
  // 배정한 시각·실제 집합 시각과 일치한다. 과거엔 d.getHours() 류 로컬 getter를 써서
  // TZ=Asia/Seoul 실행 환경에서만 우연히 맞았고, 해외 접속·UTC 데스크톱 등 다른 타임존
  // 기기에서는 몇 시간씩 밀린 시각을 보여줬다(실사례: KST 22:00 킥오프가 13:00으로 표시).
  // 이 스위트는 일부러 KST가 아닌 타임존을 실행 환경으로 강제해 그 회귀를 다시 못
  // 들어오게 잠근다 — 이전 버전의 이 테스트는 TZ를 Asia/Seoul로 강제해서 이 회귀를
  // 못 잡았다.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York'; // KST와 무관한 타임존
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('실행 환경이 KST가 아니어도 UTC 타임스탬프를 KST 기준 M/D (요일)로 표기한다', () => {
    // 11:00Z = 20:00 KST, 같은 날짜
    expect(formatTournamentDateShort('2026-08-07T11:00:00.000Z')).toBe('8/7 (금)');
  });

  it('실행 환경이 KST가 아니어도 UTC 타임스탬프를 KST 기준 M/D (요일) HH:MM으로 표기한다', () => {
    expect(formatTournamentDateTimeShort('2026-08-07T11:00:00.000Z')).toBe('8/7 (금) 20:00');
  });

  it('UTC 자정 경계를 넘어 KST 날짜가 바뀌는 경우도 실행 환경 타임존과 무관하게 정확히 넘어간다', () => {
    // UTC 2026-08-06 23:30 -> KST 2026-08-07 08:30 (날짜가 하루 넘어감).
    // America/New_York 로컬로 잘못 해석하면 8/6 19:30(하루 전 시각)이 나온다.
    expect(formatTournamentDateTimeShort('2026-08-06T23:30:00.000Z')).toBe('8/7 (금) 08:30');
  });

  it('dateStr이 없거나 invalid이면 null을 반환한다', () => {
    expect(formatTournamentDateShort(null)).toBeNull();
    expect(formatTournamentDateShort('not-a-date')).toBeNull();
    expect(formatTournamentDateTimeShort(null)).toBeNull();
    expect(formatTournamentDateTimeShort(undefined)).toBeNull();
    expect(formatTournamentDateTimeShort('not-a-date')).toBeNull();
  });

  it('날짜·시각 라벨이 같은 KST 기준으로 나와 범위 표기가 뒤틀리지 않는다', () => {
    // 시작 11:00Z(20:00 KST) ~ 종료 12:30Z(21:30 KST), 같은 날 -> 압축 표기
    expect(
      formatTournamentDateRangeWithTime('2026-08-07T11:00:00.000Z', '2026-08-07T12:30:00.000Z'),
    ).toBe('8/7 (금) 20:00~21:30');
  });
});
