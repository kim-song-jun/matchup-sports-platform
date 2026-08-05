import type { V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@/types/api';

export type ScheduleTypeFilter = 'all' | V1ScheduleType;
export type ScheduleStateFilter = 'all' | V1ScheduleState;

export type ScheduleListItemModel = {
  id: string;
  title: string;
  type: V1ScheduleType;
  typeLabel: string;
  state: V1ScheduleState;
  stateLabel: string;
  /** 취소/완료는 muted, 예정은 default — 배지 색 결정에 사용 */
  stateTone: 'default' | 'muted';
  /** 캘린더 그루핑용 로컬 날짜 키 (YYYY-MM-DD) */
  dateKey: string;
  dateTimeLabel: string;
  attendanceSummary: string;
  visibilityLabel: string;
  href: string;
};

export type ScheduleCalendarDayModel = {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  scheduleCount: number;
};

export type ScheduleCalendarModel = {
  monthLabel: string;
  weeks: ScheduleCalendarDayModel[][];
};

export type ScheduleListViewModel = {
  teamId: string;
  teamName: string;
  /** owner/manager만 true — 일정 생성 CTA 노출 여부 */
  canManage: boolean;
  createHref: string;
  view: 'list' | 'calendar';
  onViewChange: (view: 'list' | 'calendar') => void;
  typeFilter: ScheduleTypeFilter;
  onTypeFilterChange: (value: ScheduleTypeFilter) => void;
  stateFilter: ScheduleStateFilter;
  onStateFilterChange: (value: ScheduleStateFilter) => void;
  typeOptions: Array<{ value: ScheduleTypeFilter; label: string }>;
  stateOptions: Array<{ value: ScheduleStateFilter; label: string }>;
  calendar: ScheduleCalendarModel;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  items: ScheduleListItemModel[];
  visibleItems: ScheduleListItemModel[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptySub: string;
};

export type ScheduleGuestApplicationFormModel = {
  displayName: string;
  note: string;
  onDisplayNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  successMessage: string | null;
  /** OPEN 상태 + 마감 전 + (아직 신청하지 않았을 때)만 노출 */
  visible: boolean;
};

export type ScheduleGuestRecruitmentModel = {
  visible: boolean;
  slots: number;
  applicantCount: number;
  approvedCount: number;
  closesAtLabel: string;
  note: string | null;
  stateLabel: string;
  isOpen: boolean;
  /** owner/manager 전용 */
  manage?: {
    onCreate: () => void;
    onToggleOpen: () => void;
    onEdit: () => void;
    pending: boolean;
    exists: boolean;
    editPanel?: {
      open: boolean;
      slots: string;
      closesAt: string;
      note: string;
      onSlotsChange: (value: string) => void;
      onClosesAtChange: (value: string) => void;
      onNoteChange: (value: string) => void;
      onSave: () => void;
      onDismiss: () => void;
      pending: boolean;
      error: string | null;
    };
  };
  applicationForm?: ScheduleGuestApplicationFormModel;
};

export type ScheduleAttendanceModel = {
  visible: boolean;
  myStatus: 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED' | null;
  waitlistPosition: number | null;
  /** Only the aggregates the schedule read paths actually return. The backend's `toSummary()`
   * and `detail()` compute `goingCount`/`waitlistedCount` only -- MAYBE/NOT_GOING totals exist
   * solely on the ephemeral `PUT .../attendance/me` mutation response, so they are NOT part of a
   * schedule read. Carrying them here would force the caller to invent a value, which is how this
   * shape previously rendered a permanent, fabricated "미정 0명 · 불참 0명". */
  counts: { going: number; waitlisted: number };
  deadlineLabel: string | null;
  deadlinePassed: boolean;
  disabled: boolean;
  disabledReason: string | null;
  pending: boolean;
  error: string | null;
  onSetStatus: (status: 'GOING' | 'MAYBE' | 'NOT_GOING') => void;
};

export type ScheduleAttendeeItem = {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  status: 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED' | 'NO_RESPONSE';
};

/** 원본 목업(preview.html "02 · 일정 상세와 참석 현황")의 전체/참석/미응답 탭 명단.
 * 비멤버/공개 열람자에게는 서버가 attendees=null을 내려주므로 visible=false다. */
export type ScheduleAttendeeListModel = {
  visible: boolean;
  items: ScheduleAttendeeItem[];
  counts: { all: number; going: number; noResponse: number };
};

export type ScheduleManageActionsModel = {
  visible: boolean;
  editHref: string;
  onCancel: () => void;
  onComplete: () => void;
  canComplete: boolean;
  cancelPending: boolean;
  completePending: boolean;
  reminders: Array<{ kind: 'rsvp_deadline' | 'guest_recruitment_close'; label: string; onTrigger: () => void; pending: boolean; visible: boolean }>;
};

export type ScheduleHistoryEntry = {
  label: string;
  detail: string | null;
};

export type ScheduleDetailViewModel = {
  teamId: string;
  scheduleId: string;
  backHref: string;
  title: string;
  typeLabel: string;
  stateLabel: string;
  state: V1ScheduleState;
  dateTimeLabel: string;
  visibilityLabel: string;
  capacityLabel: string | null;
  version: number;
  conflictBanner: string | null;
  onDismissConflict: () => void;
  history: ScheduleHistoryEntry[];
  attendance: ScheduleAttendanceModel;
  attendees: ScheduleAttendeeListModel;
  guestRecruitment: ScheduleGuestRecruitmentModel;
  manage: ScheduleManageActionsModel;
  cancelModal: {
    open: boolean;
    reason: string;
    onReasonChange: (value: string) => void;
    onConfirm: () => void;
    onDismiss: () => void;
    pending: boolean;
    error: string | null;
  };
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

export type ScheduleFormMode = 'create' | 'edit';

export type ScheduleFormDraft = {
  title: string;
  type: V1ScheduleType;
  startAt: string;
  endAt: string;
  capacity: string;
  rsvpDeadlineAt: string;
  visibility: V1ScheduleVisibility;
};

export type ScheduleFormViewModel = {
  mode: ScheduleFormMode;
  backHref: string;
  draft: ScheduleFormDraft;
  onFieldChange: <K extends keyof ScheduleFormDraft>(field: K, value: ScheduleFormDraft[K]) => void;
  typeOptions: Array<{ value: V1ScheduleType; label: string }>;
  /** edit 모드에서는 false — 서버 `UpdateScheduleDto`가 type 변경을 지원하지 않는다 */
  typeEditable: boolean;
  visibilityOptions: Array<{ value: V1ScheduleVisibility; label: string }>;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  /** create/edit 권한이 없을 때(non-manager) 전용 안내 상태 */
  forbidden: boolean;
};

export type MyScheduleItemModel = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  typeLabel: string;
  stateLabel: string;
  dateTimeLabel: string;
  myAttendanceLabel: string | null;
  href: string;
};

export type MyScheduleViewModel = {
  statusFilter: 'all' | 'scheduled' | 'cancelled' | 'completed';
  onStatusFilterChange: (value: 'all' | 'scheduled' | 'cancelled' | 'completed') => void;
  statusOptions: Array<{ value: 'all' | 'scheduled' | 'cancelled' | 'completed'; label: string }>;
  items: MyScheduleItemModel[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptySub: string;
};
