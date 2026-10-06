import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatAdminDate,
  formatAdminDateTimeShort,
  formatAdminKstDateTimeShort,
  formatCardDate,
  formatCardTime,
  formatKstDateShort,
  formatKstTime,
  formatTournamentDateRangeWithTime,
  formatTournamentDateShort,
  formatTournamentDateTimeLong,
  formatTournamentDateTimeShort,
} from './date-utils';

function runtimeModuleUrl(relativePath: string): string {
  // Node 22.0도 실행할 수 있게 실제 TS 소스를 일반 ESM으로 바꾼다. formatter는 대체하지 않는다.
  const source = readFileSync(resolve(relativePath), 'utf8');
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, removeComments: true },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}

describe('formatAdminKstDateTimeShort / 기존 local admin family (관리자 대회 목록 · MD-QA #27)', () => {
  const dateUtilsUrl = runtimeModuleUrl('src/lib/date-utils.ts');
  const overviewUtilsUrl = runtimeModuleUrl('src/app/admin/tournaments/[id]/tournament-admin-shared.ts');

  it.each([
    { hostTimeZone: 'UTC', offset: 0, localFamily: ['10.11 16:24', '2026.10.11 16:24', '2026.10.11'] },
    { hostTimeZone: 'America/Los_Angeles', offset: 420, localFamily: ['10.11 09:24', '2026.10.11 09:24', '2026.10.11'] },
    { hostTimeZone: 'Asia/Seoul', offset: -540, localFamily: ['10.12 01:24', '2026.10.12 01:24', '2026.10.12'] },
  ] as const)(
    '실제 $hostTimeZone 호스트에서 대회는 KST, 기존 관리자 목록·상세는 같은 로컬 시각을 유지한다',
    ({ hostTimeZone, offset, localFamily }) => {
      // Given: UTC 날짜 경계를 넘는 같은 API 값. LA에서는 보고된 16시간 차이를 재현한다.
      // worker의 process.env.TZ 변경만으로는 V8 로컬 시간대가 바뀌지 않을 수 있어,
      // TZ를 지정해 새 Node 프로세스를 시작하고 실제 적용된 시간대도 함께 검증한다.
      const script = `
        import { formatAdminKstDateTimeShort, formatAdminDateTimeShort, formatAdminDateTime, formatAdminDate } from ${JSON.stringify(dateUtilsUrl)};
        import { formatDate, formatDateRange } from ${JSON.stringify(overviewUtilsUrl)};
        const scheduledAt = '2026-10-11T16:24:00.000Z';
        const scheduledEndAt = '2026-10-12T00:24:00.000Z';
        const registrationDeadlineAt = '2026-10-04T15:24:00.000Z';
        console.log(JSON.stringify({
          hostTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hostOffset: new Date(scheduledAt).getTimezoneOffset(),
          listSchedule: [scheduledAt, scheduledEndAt].map(formatAdminKstDateTimeShort).join(' ~ '),
          listDeadline: formatAdminKstDateTimeShort(registrationDeadlineAt),
          overviewSchedule: formatDateRange(scheduledAt, scheduledEndAt),
          overviewDeadline: formatDate(registrationDeadlineAt),
          localFamily: [formatAdminDateTimeShort, formatAdminDateTime, formatAdminDate].map(format => format(scheduledAt)),
        }));
      `;

      // When: 실제 목록·개요 표시 함수를 같은 원본 시각에 적용한다.
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        env: { ...process.env, TZ: hostTimeZone },
        encoding: 'utf8',
        timeout: 10_000,
      });

      // Then: 형식은 달라도 날짜와 시각은 고정된 제품 시간대에 일치한다.
      expect(JSON.parse(output)).toEqual({
        hostTimeZone,
        hostOffset: offset,
        listSchedule: '10.12 01:24 ~ 10.12 09:24',
        listDeadline: '10.5 00:24',
        overviewSchedule: '2026. 10. 12. 오전 01:24 ~ 2026. 10. 12. 오전 09:24',
        overviewDeadline: '2026. 10. 5. 오전 12:24',
        localFamily,
      });
    },
  );

  it.each([
    [null, '—'],
    [undefined, '—'],
    ['', '—'],
    ['not-a-date', 'not-a-date'],
  ] as const)(
    '빈 값·잘못된 값 %s의 기존 표시 계약을 유지한다',
    (value, expected) => {
      expect(formatAdminDateTimeShort(value)).toBe(expected);
      expect(formatAdminKstDateTimeShort(value)).toBe(expected);
    },
  );
});

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

describe('formatCardDate / formatCardTime (목록 카드 공용)', () => {
  it('KST 달력 기준으로 그린다 — 서버(UTC)와 브라우저가 하루 어긋나지 않게', () => {
    // 2026-10-02T16:30Z = KST 2026-10-03 01:30
    expect(formatCardDate('2026-10-02T16:30:00.000Z')).toBe('10월 3일 (토)');
    expect(formatCardTime('2026-10-02T16:30:00.000Z')).toBe('01:30');
  });

  it('invalid 입력의 처리는 카드의 기존 동작을 유지한다', () => {
    // 날짜는 원문 노출(디버깅), 시각은 빈 칸(없을 수 있는 슬롯).
    expect(formatCardDate('not-a-date')).toBe('not-a-date');
    expect(formatCardTime('not-a-date')).toBe('');
  });
});
