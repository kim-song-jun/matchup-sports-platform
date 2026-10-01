import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamScheduleSummary } from '@/types/api';
import {
  attendanceLockedReason,
  attendanceSummaryText,
  buildScheduleCalendarMonth,
  dateKeyOf,
  fromDatetimeLocalValue,
  isDeadlinePassed,
  isScheduleManagerRole,
  isScheduleMemberRole,
  isScheduleStaleConflict,
  mapScheduleErrorMessage,
  matchScheduleDisplay,
  scheduleCancelNoticeLine,
  scheduleOpponentTeamName,
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
    linkedMatch: null,
    matchConfirmed: null,
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

  it('이미 답한 팀원 충돌은 목록을 되돌려야 하는 stale 로 다룬다', () => {
    // 팀장이 보고 있던 "미응답" 목록이 낡아서 나는 충돌이라, 메시지만 띄우고 목록을
    // 그대로 두면 이미 답한 사람 옆에 대리 버튼이 계속 남는다.
    const err = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'PROXY_ATTENDANCE_ALREADY_ANSWERED',
      message: 'already answered',
      timestamp: new Date().toISOString(),
    });
    expect(isScheduleStaleConflict(err)).toBe(true);
    expect(mapScheduleErrorMessage(err, '실패했어요')).toBe('팀원이 이미 응답했어요. 최신 내용으로 새로고침했어요.');
  });

  it('대리로 참석 외 상태를 시도한 경우는 stale 이 아니라 그대로 알린다', () => {
    // 목록이 낡아서 난 것이 아니므로 새로고침해도 달라지지 않는다 -- 되돌릴 것이 없다.
    const err = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'PROXY_ATTENDANCE_STATUS_NOT_ALLOWED',
      message: 'only going',
      timestamp: new Date().toISOString(),
    });
    expect(isScheduleStaleConflict(err)).toBe(false);
    expect(mapScheduleErrorMessage(err, '실패했어요')).toBe('대신 표시할 수 있는 건 참석뿐이에요.');
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

  it('F67: 아무도 답하지 않은 정원 없는 일정은 "참석 0명" 대신 요약이 없다 (대조군: 1명·대기·정원이 있으면 그대로)', () => {
    expect(attendanceSummaryText(0, 0, null)).toBeNull();
    expect(toScheduleListItemModel(schedule({ goingCount: 0, waitlistedCount: 0, capacity: null }), 't').attendanceSummary).toBeNull();
    expect(attendanceSummaryText(1, 0, null)).toBe('참석 1명');
    expect(attendanceSummaryText(0, 2, null)).toBe('참석 0명 · 대기 2명');
    expect(attendanceSummaryText(0, 0, 10)).toBe('참석 0/10명');
  });
});

// 매치 ↔ 팀일정 연동(레인 schedule): "가확정(상대팀 모집 중, 반투명) vs 확정(상대팀 확정)"은
// type==='MATCH' && state==='SCHEDULED'인 스케줄에만 적용되는 파생 라벨/톤 오버라이드다.
describe('team-schedules view-model — match schedule confirmation display', () => {
  it('shows the tentative label/tone/opacity trigger for an unconfirmed MATCH schedule', () => {
    const display = matchScheduleDisplay('MATCH', 'SCHEDULED', false);
    expect(display.stateLabel).toBe('상대팀 모집 중');
    expect(display.stateTone).toBe('muted');
    expect(display.isTentative).toBe(true);
  });

  it('shows the confirmed label/tone with no opacity trigger once the opponent is locked in', () => {
    const display = matchScheduleDisplay('MATCH', 'SCHEDULED', true);
    expect(display.stateLabel).toBe('상대팀 확정');
    expect(display.stateTone).toBe('default');
    expect(display.isTentative).toBe(false);
  });

  it('falls back to the generic state label for a non-MATCH schedule regardless of matchConfirmed', () => {
    const display = matchScheduleDisplay('TRAINING', 'SCHEDULED', false);
    expect(display.stateLabel).toBe(scheduleStateLabel('SCHEDULED'));
    expect(display.stateTone).toBe('default');
    expect(display.isTentative).toBe(false);
  });

  it('falls back to the generic terminal label for a CANCELLED/COMPLETED MATCH schedule (confirmation is moot once terminal)', () => {
    expect(matchScheduleDisplay('MATCH', 'CANCELLED', false)).toEqual({
      stateLabel: scheduleStateLabel('CANCELLED'),
      stateTone: 'muted',
      isTentative: false,
    });
    expect(matchScheduleDisplay('MATCH', 'COMPLETED', true)).toEqual({
      stateLabel: scheduleStateLabel('COMPLETED'),
      stateTone: 'muted',
      isTentative: false,
    });
  });

  it('falls back to the generic label for a MATCH schedule whose confirmation could not be resolved (matchConfirmed: null)', () => {
    const display = matchScheduleDisplay('MATCH', 'SCHEDULED', null);
    expect(display.stateLabel).toBe(scheduleStateLabel('SCHEDULED'));
    expect(display.isTentative).toBe(false);
  });

  it('threads the tentative flag through toScheduleListItemModel for an unconfirmed MATCH schedule', () => {
    const item = toScheduleListItemModel(schedule({ type: 'MATCH', matchConfirmed: false }), 'team-1');
    expect(item.stateLabel).toBe('상대팀 모집 중');
    expect(item.stateTone).toBe('muted');
    expect(item.isTentative).toBe(true);
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

describe('attendanceLockedReason', () => {
  it('취소된 일정은 종료가 아니라 취소라고 말한다', () => {
    expect(attendanceLockedReason('CANCELLED', false)).toBe('취소된 일정이라 참석 여부를 바꿀 수 없어요.');
    expect(attendanceLockedReason('CANCELLED', true)).toBe('취소된 일정이라 참석 여부를 바꿀 수 없어요.');
  });

  it('완료된 일정은 종료, 예정된 일정은 마감 여부로만 갈린다', () => {
    expect(attendanceLockedReason('COMPLETED', false)).toBe('이미 종료된 일정이라 참석 여부를 바꿀 수 없어요.');
    expect(attendanceLockedReason('SCHEDULED', true)).toBe('참석 신청 마감 시간이 지났어요.');
    expect(attendanceLockedReason('SCHEDULED', false)).toBeNull();
  });
});

describe('scheduleOpponentTeamName — 일정을 가진 팀 기준의 상대 (W3-V8)', () => {
  // 매치 상세 모양 그대로: approvedOpponentTeam 은 호스트 기준 상대다.
  const friendly = {
    hostTeamId: 'team-host',
    hostTeamName: '팀관리 테스트',
    hostTeam: { teamId: 'team-host', name: '팀관리 테스트' },
    approvedOpponentTeam: { teamId: 'team-guest', name: '마포 FC' },
  };

  it('호스트 팀 일정에서는 신청(원정) 팀이 상대다 (대조군)', () => {
    expect(scheduleOpponentTeamName(friendly, 'team-host')).toBe('마포 FC');
  });

  it('신청(원정) 팀 일정에서는 호스트 팀이 상대다 — 자기 팀 이름이 나오지 않는다', () => {
    expect(scheduleOpponentTeamName(friendly, 'team-guest')).toBe('팀관리 테스트');
  });

  it('리그 대진(원정 쪽)도 같은 규칙이다 — 호스트 객체가 없으면 hostTeamName 으로', () => {
    const league = { hostTeamId: 'team-a', hostTeamName: '성수 FC', hostTeam: null, approvedOpponentTeam: { teamId: 'team-b', name: '망원 FC' } };
    expect(scheduleOpponentTeamName(league, 'team-b')).toBe('성수 FC');
    expect(scheduleOpponentTeamName(league, 'team-a')).toBe('망원 FC');
  });

  it('상대가 확정되지 않았거나, 보는 팀이 어느 쪽도 아니면 null', () => {
    expect(scheduleOpponentTeamName({ ...friendly, approvedOpponentTeam: null }, 'team-host')).toBeNull();
    expect(scheduleOpponentTeamName(friendly, 'team-other')).toBeNull();
    expect(scheduleOpponentTeamName(undefined, 'team-host')).toBeNull();
  });
});

describe('scheduleCancelNoticeLine — 서버 취소 알림 수신자와 같은 말', () => {
  it('전체 공개 일정에 승인된 용병이 있으면 용병도 알림을 받는다고 말한다', () => {
    expect(scheduleCancelNoticeLine('PUBLIC', 2)).toBe('팀원과 승인된 용병에게 알림이 가요.');
  });

  it('승인된 용병이 없거나, 공개가 아닌 일정이면 용병을 말하지 않는다 — 비공개 일정 용병에겐 서버도 보내지 않는다', () => {
    expect(scheduleCancelNoticeLine('PUBLIC', 0)).toBe('팀원에게 알림이 가요.');
    expect(scheduleCancelNoticeLine('TEAM', 3)).toBe('팀원에게 알림이 가요.');
    expect(scheduleCancelNoticeLine('MEMBERS', 3)).toBe('팀원에게 알림이 가요.');
  });
});
