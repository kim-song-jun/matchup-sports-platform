import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamScheduleSummary } from '@/types/api';
import {
  attendanceSummaryText,
  buildScheduleCalendarMonth,
  dateKeyOf,
  fromDatetimeLocalValue,
  isDeadlinePassed,
  isScheduleManagerRole,
  isScheduleMemberRole,
  isScheduleStaleConflict,
  mapScheduleErrorMessage,
  scheduleRsvpDeadlineLabel,
  scheduleStateLabel,
  scheduleTypeLabel,
  toDatetimeLocalValue,
  toScheduleListItemModel,
} from './team-schedules.view-model';

function schedule(overrides: Partial<V1TeamScheduleSummary> = {}): V1TeamScheduleSummary {
  return {
    id: 'sched-1',
    title: '정기 훈련',
    type: 'TRAINING',
    startAt: '2026-08-10T12:00:00.000Z',
    endAt: '2026-08-10T14:00:00.000Z',
    timezone: 'Asia/Seoul',
    capacity: 20,
    rsvpDeadlineAt: null,
    visibility: 'TEAM',
    state: 'SCHEDULED',
    version: 0,
    teamMatchId: null,
    goingCount: 5,
    waitlistedCount: 0,
    ...overrides,
  };
}

describe('team-schedules view-model — permission', () => {
  it('treats owner and manager as manager-capable roles', () => {
    expect(isScheduleManagerRole('owner')).toBe(true);
    expect(isScheduleManagerRole('manager')).toBe(true);
  });

  it('rejects member/none/missing role as manager-capable', () => {
    expect(isScheduleManagerRole('member')).toBe(false);
    expect(isScheduleManagerRole('none')).toBe(false);
    expect(isScheduleManagerRole(null)).toBe(false);
    expect(isScheduleManagerRole(undefined)).toBe(false);
  });

  it('treats owner/manager/member as RSVP-capable, but not none/anonymous', () => {
    expect(isScheduleMemberRole('owner')).toBe(true);
    expect(isScheduleMemberRole('manager')).toBe(true);
    expect(isScheduleMemberRole('member')).toBe(true);
    expect(isScheduleMemberRole('none')).toBe(false);
    expect(isScheduleMemberRole(null)).toBe(false);
  });
});

describe('team-schedules view-model — API failure / 409 conflict mapping', () => {
  it('maps VERSION_CONFLICT to a refresh-and-retry message and flags it as a stale conflict', () => {
    const err = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'VERSION_CONFLICT',
      message: 'stale version',
      timestamp: new Date().toISOString(),
    });
    expect(mapScheduleErrorMessage(err, '실패했어요')).toMatch(/새로고침/);
    expect(isScheduleStaleConflict(err)).toBe(true);
  });

  it('maps IDEMPOTENCY_PAYLOAD_CONFLICT as a stale conflict too', () => {
    const err = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
      message: 'payload conflict',
      timestamp: new Date().toISOString(),
    });
    expect(isScheduleStaleConflict(err)).toBe(true);
  });

  it('does not flag an unrelated domain error as a stale conflict', () => {
    const err = new V1ApiError({
      status: 'error',
      statusCode: 403,
      code: 'PERMISSION_DENIED',
      message: 'nope',
      timestamp: new Date().toISOString(),
    });
    expect(isScheduleStaleConflict(err)).toBe(false);
    expect(mapScheduleErrorMessage(err, '실패했어요')).toBe('이 작업을 수행할 권한이 없어요.');
  });

  it('falls back to the server message for an unmapped code', () => {
    const err = new V1ApiError({
      status: 'error',
      statusCode: 500,
      code: 'UNKNOWN_SERVER_ERROR',
      message: '서버에서 알 수 없는 오류가 발생했어요',
      timestamp: new Date().toISOString(),
    });
    expect(mapScheduleErrorMessage(err, '기본 실패 메시지')).toBe('서버에서 알 수 없는 오류가 발생했어요');
  });

  it('falls back to the caller-provided fallback when the failure carries no usable message (e.g. network loss)', () => {
    const networkError = new Error('');
    expect(mapScheduleErrorMessage(networkError, '네트워크 연결을 확인해 주세요.')).toBe('네트워크 연결을 확인해 주세요.');
  });

  it('surfaces a real Error message instead of the fallback when one is present', () => {
    const networkError = new TypeError('Failed to fetch');
    expect(mapScheduleErrorMessage(networkError, '기본 메시지')).toBe('Failed to fetch');
  });
});

describe('team-schedules view-model — list item / labels', () => {
  it('converts a schedule summary into a list item with derived labels and href', () => {
    const item = toScheduleListItemModel(schedule(), 'team-1');
    expect(item.href).toBe('/teams/team-1/schedules/sched-1');
    expect(item.typeLabel).toBe(scheduleTypeLabel('TRAINING'));
    expect(item.stateLabel).toBe(scheduleStateLabel('SCHEDULED'));
    expect(item.stateTone).toBe('default');
    expect(item.dateKey).toBe(dateKeyOf(schedule().startAt));
  });

  it('marks a cancelled/completed schedule with muted tone', () => {
    expect(toScheduleListItemModel(schedule({ state: 'CANCELLED' }), 't').stateTone).toBe('muted');
    expect(toScheduleListItemModel(schedule({ state: 'COMPLETED' }), 't').stateTone).toBe('muted');
  });

  it('includes the waitlist count in the attendance summary only when someone is waitlisted', () => {
    expect(attendanceSummaryText(18, 0, 20)).toBe('참석 18/20명');
    expect(attendanceSummaryText(20, 3, 20)).toBe('참석 20/20명 · 대기 3명');
    expect(attendanceSummaryText(4, 0, null)).toBe('참석 4명');
  });
});

describe('team-schedules view-model — deadline helpers', () => {
  it('reports a past deadline as passed', () => {
    expect(isDeadlinePassed('2000-01-01T00:00:00.000Z')).toBe(true);
  });

  it('reports a future deadline as not passed', () => {
    expect(isDeadlinePassed('2999-01-01T00:00:00.000Z')).toBe(false);
  });

  it('treats a missing deadline as not passed', () => {
    expect(isDeadlinePassed(null)).toBe(false);
  });

  it('formats a present deadline with a trailing 마감 label, and returns null for a missing one', () => {
    expect(scheduleRsvpDeadlineLabel(null)).toBeNull();
    expect(scheduleRsvpDeadlineLabel('2026-08-09T10:00:00.000Z')).toMatch(/마감$/);
  });
});

describe('team-schedules view-model — datetime-local round-trip', () => {
  it('round-trips an ISO string through toDatetimeLocalValue/fromDatetimeLocalValue', () => {
    const original = new Date(2026, 7, 10, 19, 30, 0, 0).toISOString();
    const local = toDatetimeLocalValue(original);
    expect(local).toBe('2026-08-10T19:30');
    const backToIso = fromDatetimeLocalValue(local);
    expect(backToIso).toBe(original);
  });

  it('returns an empty string / undefined for missing or invalid input', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue(undefined)).toBe('');
    expect(toDatetimeLocalValue('not-a-date')).toBe('');
    expect(fromDatetimeLocalValue('')).toBeUndefined();
    expect(fromDatetimeLocalValue('not-a-date')).toBeUndefined();
  });
});

describe('team-schedules view-model — calendar month grid', () => {
  it('builds a 6-week grid whose day-count buckets match the input schedules', () => {
    // 로컬 Date 생성자로 만든 시각을 그대로 왕복시킨다 — 하드코딩된 UTC ISO 문자열 두 개가
    // "같은 날"인지는 실행 환경의 타임존에 따라 갈릴 수 있어(예: UTC-8에서
    // 2026-08-05T01:00:00Z는 전날 오후로 밀린다), 로컬 생성자를 쓰면 인코딩(테스트 데이터
    // 준비)과 디코딩(dateKeyOf의 로컬 getter 판독)이 항상 같은 로컬 달력을 가리켜
    // 실행 타임존과 무관하게 안정적이다.
    const items = [
      schedule({ id: 'a', startAt: new Date(2026, 7, 5, 9, 0, 0).toISOString() }),
      schedule({ id: 'b', startAt: new Date(2026, 7, 5, 18, 0, 0).toISOString() }),
      schedule({ id: 'c', startAt: new Date(2026, 7, 20, 9, 0, 0).toISOString() }),
    ];
    const model = buildScheduleCalendarMonth(items, new Date(2026, 7, 1), '2026-08-01');

    expect(model.monthLabel).toBe('2026년 8월');
    expect(model.weeks).toHaveLength(6);
    expect(model.weeks.every((week) => week.length === 7)).toBe(true);

    const allDays = model.weeks.flat();
    const aug5 = allDays.find((day) => day.dateKey === dateKeyOf(items[0].startAt));
    expect(aug5?.scheduleCount).toBe(2);
    const aug20 = allDays.find((day) => day.dateKey === dateKeyOf(items[2].startAt));
    expect(aug20?.scheduleCount).toBe(1);

    // 데이터가 없는 날짜는 0건으로 남아야 한다 (합계가 새지 않는지 확인)
    const totalCounted = allDays.reduce((sum, day) => sum + day.scheduleCount, 0);
    expect(totalCounted).toBe(3);
  });

  it('flags exactly one day as today and marks in/out-of-month days correctly', () => {
    const model = buildScheduleCalendarMonth([], new Date(2026, 7, 1), '2026-08-15');
    const allDays = model.weeks.flat();
    const todays = allDays.filter((day) => day.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.dateKey).toBe('2026-08-15');

    const inMonthCount = allDays.filter((day) => day.inCurrentMonth).length;
    expect(inMonthCount).toBe(31); // 2026-08 has 31 days
  });
});
