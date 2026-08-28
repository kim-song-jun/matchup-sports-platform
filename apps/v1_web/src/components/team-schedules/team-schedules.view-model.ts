import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateRangeWithTime, formatTournamentDateTimeLong } from '@/lib/date-utils';
import type {
  V1AttendanceStatus,
  V1GuestRecruitmentState,
  V1ScheduleState,
  V1ScheduleType,
  V1ScheduleVisibility,
  V1TeamScheduleSummary,
} from '@/types/api';
import type { ScheduleCalendarDayModel, ScheduleCalendarModel, ScheduleListItemModel } from './team-schedules.types';

// ── 권한 판정 ──────────────────────────────────────────────────────────────────
// V1TeamDetail.viewer.role은 'owner' | 'manager' | 'member' | 'none' 문자열이다
// (팀 도메인 전역 컨벤션 — teams-client.tsx의 isTeamOperatorRole/isTeamMemberRole과 동일 판정).

export function isScheduleManagerRole(role?: string | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function isScheduleMemberRole(role?: string | null): boolean {
  return isScheduleManagerRole(role) || role === 'member';
}

// ── 라벨 ──────────────────────────────────────────────────────────────────────

const SCHEDULE_TYPE_LABELS: Record<V1ScheduleType, string> = {
  MATCH: '경기',
  TRAINING: '훈련',
  EVENT: '이벤트',
};

export function scheduleTypeLabel(type: V1ScheduleType): string {
  return SCHEDULE_TYPE_LABELS[type] ?? type;
}

const SCHEDULE_STATE_LABELS: Record<V1ScheduleState, string> = {
  SCHEDULED: '예정',
  CANCELLED: '취소됨',
  COMPLETED: '완료',
};

export function scheduleStateLabel(state: V1ScheduleState): string {
  return SCHEDULE_STATE_LABELS[state] ?? state;
}

export function scheduleStateTone(state: V1ScheduleState): 'default' | 'muted' {
  return state === 'SCHEDULED' ? 'default' : 'muted';
}

/**
 * 매치 ↔ 팀일정 연동: "가확정(상대팀 모집 중) vs 확정(상대팀 확정)"은 type==='MATCH' &&
 * state==='SCHEDULED'인 스케줄에만 적용되는 오버라이드다 — 둘 다 이미 이 코드베이스에 쓰이는
 * 기존 카피(search-experience.tsx의 '상대팀 모집 중', team-matches-client.tsx의 '상대팀 확정').
 * CANCELLED/COMPLETED나 MATCH가 아닌 스케줄은 제네릭 라벨을 그대로 쓴다 — 그 두 상태는 확정
 * 여부와 무관하게 이미 명확하기 때문. 톤도 기존 관례를 그대로 따른다: 가확정은 '덜 중요한 상태'
 * 톤(muted→tm-badge-grey), 확정은 SCHEDULED와 동일한 톤(default→tm-badge-blue).
 * isTentative는 카드 반투명(opacity) 처리 트리거 — 색만으로 정보를 전달하지 않도록 항상
 * stateLabel 텍스트와 함께 쓴다(호출부 책임).
 */
export function matchScheduleDisplay(
  type: V1ScheduleType,
  state: V1ScheduleState,
  matchConfirmed: boolean | null,
): { stateLabel: string; stateTone: 'default' | 'muted'; isTentative: boolean } {
  if (type === 'MATCH' && state === 'SCHEDULED' && matchConfirmed !== null) {
    return matchConfirmed
      ? { stateLabel: '상대팀 확정', stateTone: 'default', isTentative: false }
      : { stateLabel: '상대팀 모집 중', stateTone: 'muted', isTentative: true };
  }
  return { stateLabel: scheduleStateLabel(state), stateTone: scheduleStateTone(state), isTentative: false };
}

const SCHEDULE_VISIBILITY_LABELS: Record<V1ScheduleVisibility, string> = {
  PUBLIC: '전체 공개',
  TEAM: '팀 전용',
  MEMBERS: '멤버 전용',
};

export function scheduleVisibilityLabel(visibility: V1ScheduleVisibility): string {
  return SCHEDULE_VISIBILITY_LABELS[visibility] ?? visibility;
}

const ATTENDANCE_STATUS_LABELS: Record<V1AttendanceStatus, string> = {
  GOING: '참석',
  MAYBE: '미정',
  NOT_GOING: '불참',
  WAITLISTED: '대기',
};

export function attendanceStatusLabel(status: V1AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

const GUEST_RECRUITMENT_STATE_LABELS: Record<V1GuestRecruitmentState, string> = {
  OPEN: '모집 중',
  CLOSED: '마감',
  FILLED: '충원 완료',
};

export function guestRecruitmentStateLabel(state: V1GuestRecruitmentState): string {
  return GUEST_RECRUITMENT_STATE_LABELS[state] ?? state;
}

export function attendanceSummaryText(goingCount: number, waitlistedCount: number, capacity: number | null): string {
  const capacityPart = capacity !== null ? `/${capacity}` : '';
  const base = `참석 ${goingCount}${capacityPart}명`;
  return waitlistedCount > 0 ? `${base} · 대기 ${waitlistedCount}명` : base;
}

// ── 에러 매핑 (409 conflict 포함) ─────────────────────────────────────────────
// mapScheduleErrorMessage는 이 도메인의 모든 mutation catch 블록에서 공유하는 단일 소스다.
// extractErrorCode로 도메인 코드를 먼저 구분하고, 알려지지 않은 코드는 항상
// extractErrorMessage(err, fallback)으로 폴백한다 — 이 순서가 뒤바뀌면 서버가 보낸
// 사람이 읽는 메시지가 코드 매핑에 가려질 수 있다.
const SCHEDULE_ERROR_MESSAGES: Record<string, string> = {
  VERSION_CONFLICT: '다른 곳에서 먼저 정보를 바꿨어요. 최신 내용으로 새로고침했어요. 다시 시도해 주세요.',
  SCHEDULE_TERMINAL: '이미 종료된 일정이에요. 새로고침 후 확인해 주세요.',
  SCHEDULE_NOT_ACTIVE: '지금은 참석 여부를 바꿀 수 없는 일정이에요.',
  SCHEDULE_NOT_YET_ENDED: '아직 끝나지 않은 일정이에요. 종료 시각 이후에 완료 처리할 수 있어요.',
  RSVP_DEADLINE_PASSED: '참석 신청 마감 시간이 지났어요.',
  NOT_FOUND_OR_ARCHIVED: '일정을 찾을 수 없어요. 삭제됐거나 접근 권한이 없을 수 있어요.',
  PERMISSION_DENIED: '이 작업을 수행할 권한이 없어요.',
  GUEST_RECRUITMENT_NOT_FOUND: '용병 모집 정보를 찾을 수 없어요.',
  GUEST_RECRUITMENT_ALREADY_EXISTS: '이미 용병 모집이 열려 있어요.',
  GUEST_RECRUITMENT_TERMINAL: '이미 마감된 용병 모집이에요.',
  GUEST_RECRUITMENT_DEADLINE_PASSED: '용병 모집 마감 시간이 지났어요.',
  IDEMPOTENCY_KEY_REQUIRED: '요청을 다시 시도해 주세요.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '요청이 겹쳤어요. 새로고침 후 다시 시도해 주세요.',
  PROXY_ATTENDANCE_ALREADY_ANSWERED: '팀원이 이미 응답했어요. 최신 내용으로 새로고침했어요.',
  PROXY_ATTENDANCE_STATUS_NOT_ALLOWED: '대신 표시할 수 있는 건 참석뿐이에요.',
  SCHEDULE_MATCH_SOURCE_REQUIRED: '경기 일정은 팀매치를 먼저 선택해야 해요.',
  SCHEDULE_TEAM_MATCH_NOT_ALLOWED: '경기가 아닌 일정에는 팀매치를 연결할 수 없어요.',
  TEAM_MATCH_NOT_FOUND_FOR_TEAM: '선택한 팀매치가 이 팀 소속이 아니에요.',
  VALIDATION_ERROR: '입력한 내용을 다시 확인해 주세요.',
};

export function mapScheduleErrorMessage(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code && SCHEDULE_ERROR_MESSAGES[code]) return SCHEDULE_ERROR_MESSAGES[code];
  return extractErrorMessage(err, fallback);
}

/**
 * 화면을 새 데이터로 되돌려야 하는 409류. PROXY_ATTENDANCE_ALREADY_ANSWERED 도 여기 든다 --
 * 팀장이 보고 있던 "미응답" 목록이 낡아서 나는 충돌이라, 메시지만 띄우고 목록을 그대로 두면
 * 이미 답한 사람 옆에 대리 버튼이 계속 남는다.
 */
export function isScheduleStaleConflict(err: unknown): boolean {
  const code = extractErrorCode(err);
  return (
    code === 'VERSION_CONFLICT' ||
    code === 'IDEMPOTENCY_PAYLOAD_CONFLICT' ||
    code === 'PROXY_ATTENDANCE_ALREADY_ANSWERED'
  );
}

// ── 목록 항목 변환 ────────────────────────────────────────────────────────────

export function dateKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toScheduleListItemModel(schedule: V1TeamScheduleSummary, teamId: string): ScheduleListItemModel {
  const display = matchScheduleDisplay(schedule.type, schedule.state, schedule.matchConfirmed);
  return {
    id: schedule.id,
    title: schedule.title,
    type: schedule.type,
    typeLabel: scheduleTypeLabel(schedule.type),
    state: schedule.state,
    stateLabel: display.stateLabel,
    stateTone: display.stateTone,
    isTentative: display.isTentative,
    dateKey: dateKeyOf(schedule.startAt),
    dateTimeLabel: formatTournamentDateRangeWithTime(schedule.startAt, schedule.endAt) ?? '일정 미정',
    attendanceSummary: attendanceSummaryText(schedule.goingCount, schedule.waitlistedCount, schedule.capacity),
    visibilityLabel: scheduleVisibilityLabel(schedule.visibility),
    href: `/teams/${teamId}/schedules/${schedule.id}`,
  };
}

export function scheduleRsvpDeadlineLabel(rsvpDeadlineAt: string | null): string | null {
  if (!rsvpDeadlineAt) return null;
  return `${formatTournamentDateTimeLong(rsvpDeadlineAt)} 마감`;
}

export function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// ── <input type="datetime-local"> 변환 ────────────────────────────────────────
// datetime-local 값은 타임존이 없는 "로컬 벽시계" 문자열이다. new Date(그 문자열)은
// ECMA-262 Date Time String Format 규격상 타임존 오프셋이 없으면 로컬 시간으로 해석되므로
// (날짜만 있는 형식만 UTC), toISOString()으로의 왕복이 안전하다.
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// ── 캘린더(월간 그리드) ───────────────────────────────────────────────────────
// 순수 날짜 연산만 사용 — 외부 캘린더 라이브러리 없이 6주 고정 그리드를 만든다.

const WEEKDAY_HEADER = ['일', '월', '화', '수', '목', '금', '토'];

export function buildScheduleCalendarMonth(
  items: V1TeamScheduleSummary[],
  monthDate: Date,
  todayKey: string,
): ScheduleCalendarModel {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());

  const countsByDate = new Map<string, number>();
  for (const item of items) {
    const key = dateKeyOf(item.startAt);
    if (!key) continue;
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const weeks: ScheduleCalendarDayModel[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: ScheduleCalendarDayModel[] = [];
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + week * 7 + day);
      // 로컬 캘린더 필드를 직접 읽는다 — dateKeyOf(iso)와 동일한 포맷(YYYY-MM-DD)이어야
      // items의 startAt에서 뽑은 키와 정확히 매치한다.
      const localKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      days.push({
        dateKey: localKey,
        dayNumber: current.getDate(),
        inCurrentMonth: current.getMonth() === month,
        isToday: localKey === todayKey,
        scheduleCount: countsByDate.get(localKey) ?? 0,
      });
    }
    weeks.push(days);
  }

  return {
    monthLabel: `${year}년 ${month + 1}월`,
    weeks,
  };
}

export function weekdayHeaders(): string[] {
  return WEEKDAY_HEADER;
}

export function scheduleTypeFilterOptions(): Array<{ value: 'all' | V1ScheduleType; label: string }> {
  return [
    { value: 'all', label: '전체' },
    { value: 'MATCH', label: '경기' },
    { value: 'TRAINING', label: '훈련' },
    { value: 'EVENT', label: '이벤트' },
  ];
}

export function scheduleStateFilterOptions(): Array<{ value: 'all' | V1ScheduleState; label: string }> {
  return [
    { value: 'all', label: '전체' },
    { value: 'SCHEDULED', label: '예정' },
    { value: 'CANCELLED', label: '취소됨' },
    { value: 'COMPLETED', label: '완료' },
  ];
}

/**
 * 생성 폼에서 고를 수 있는 종류는 MATCH를 제외한다 — `CreateScheduleDto.teamMatchId`는
 * MATCH 타입에 필수이고(`422 SCHEDULE_MATCH_SOURCE_REQUIRED`), 이 화면은 아직 팀매치
 * 선택 UI를 제공하지 않는다. 고를 수 없는 옵션을 보여주고 서버가 매번 거부하게 두는 대신,
 * 뒷단이 실제로 지원하는 조합만 노출한다(팀매치 연동 폼은 별도 확장 지점).
 */
export function scheduleCreatableTypeOptions(): Array<{ value: V1ScheduleType; label: string }> {
  return [
    { value: 'TRAINING', label: '훈련' },
    { value: 'EVENT', label: '이벤트' },
  ];
}

/**
 * "팀 전용"/"멤버 전용" 2개를 노출했었으나, 백엔드가 둘 다 "활성 멤버십 필요"로
 * 동일하게 처리한다(team-schedules.service.ts의 assertManageableTeam 부근 주석 —
 * "향후 세분화를 위해 2단계 enum을 스키마에 남겨둠"). 사용자에게는 구분되지 않는
 * 가짜 선택지였다(2026-08-05 지적) — 실제로 구분이 필요해지기 전까지 하나로
 * 합친다. `MEMBERS` 값 자체는 스키마/DTO에서 지우지 않았다(기존에 MEMBERS로
 * 저장된 일정이 있으면 여전히 유효해야 함) — UI 선택지에서만 뺐다.
 */
export function scheduleVisibilityOptions(): Array<{ value: 'TEAM' | 'MEMBERS' | 'PUBLIC'; label: string }> {
  return [
    { value: 'TEAM', label: '팀 전용' },
    { value: 'PUBLIC', label: '전체 공개' },
  ];
}
