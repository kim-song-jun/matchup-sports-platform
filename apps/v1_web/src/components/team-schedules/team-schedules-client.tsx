'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useV1ApplyGuestRecruitment,
  useV1AuthMe,
  useV1CancelTeamSchedule,
  useV1CompleteTeamSchedule,
  useV1CreateGuestRecruitment,
  useV1CreateTeamSchedule,
  useV1MySchedule,
  useV1SetMyScheduleAttendance,
  useV1SetScheduleAttendanceOnBehalf,
  useV1TeamDetail,
  useV1TeamSchedule,
  useV1TeamSchedules,
  useV1TriggerScheduleReminder,
  useV1UpdateGuestRecruitment,
  useV1UpdateTeamSchedule,
} from '@/hooks/use-v1-api';
// guest-recruitment applications 목록·승인/거절 전용 훅은 아직 hooks/use-v1-api.ts에 없다(이
// 배치의 ownedFiles가 그 파일을 포함하지 않아 새 훅을 그쪽에 추가할 수 없음) — 같은 파일이
// 이미 쓰는 저수준 클라이언트(v1Get/v1Patch)를 이 컴포넌트 안에서 직접 useQuery/useMutation과
// 조합해 동일한 패턴(성공 시 teamSchedule invalidate)을 재현한다.
import { v1Get, v1Patch } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { randomUuid } from '@/lib/uuid';
import { extractErrorCode } from '@/lib/error-message';
import { formatTournamentDateRangeWithTime, formatTournamentDateTimeLong } from '@/lib/date-utils';
import type {
  V1CreateScheduleDto,
  V1GuestApplicationListItem,
  V1GuestRecruitmentVisibility,
  V1ReviewGuestApplicationDto,
  V1ReviewGuestApplicationResult,
  V1UpdateScheduleDto,
} from '@/types/api';
import {
  ScheduleDetailPageView,
  ScheduleFormPageView,
  ScheduleListPageView,
  MySchedulePageView,
} from './team-schedules-page';
import type {
  MyScheduleViewModel,
  ScheduleDetailViewModel,
  ScheduleFormDraft,
  ScheduleFormMode,
  ScheduleFormViewModel,
  ScheduleListViewModel,
  ScheduleStateFilter,
  ScheduleTypeFilter,
} from './team-schedules.types';
import {
  attendanceStatusLabel,
  buildScheduleCalendarMonth,
  dateKeyOf,
  fromDatetimeLocalValue,
  guestRecruitmentStateLabel,
  isDeadlinePassed,
  isScheduleManagerRole,
  isScheduleMemberRole,
  isScheduleStaleConflict,
  mapScheduleErrorMessage,
  matchScheduleDisplay,
  scheduleCreatableTypeOptions,
  scheduleRsvpDeadlineLabel,
  scheduleStateFilterOptions,
  scheduleTypeFilterOptions,
  scheduleTypeLabel,
  scheduleVisibilityLabel,
  scheduleVisibilityOptions,
  toDatetimeLocalValue,
  toScheduleListItemModel,
} from './team-schedules.view-model';

const GUEST_APPLICATION_STATE_LABELS: Record<string, string> = {
  PENDING: '대기 중',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
  WITHDRAWN: '취소됨',
};

const GUEST_RECRUITMENT_VISIBILITY_LABELS: Record<V1GuestRecruitmentVisibility, string> = {
  PUBLIC: '전체 공개',
  MEMBERS: '팀원 전용',
};

// team-schedules.view-model.ts의 mapScheduleErrorMessage/SCHEDULE_ERROR_MESSAGES는 이 배치의
// ownedFiles 밖이라 새 도메인 코드를 그쪽에 등록할 수 없다 — 등록하지 않으면 서버가 던진 영문
// message가 그대로 화면에 새어(에러 어조 규칙 위반) 나가므로, 신청 승인/거절 전용 코드 3개만
// 이 파일 안에서 얹어 감싼다(다른 모든 코드는 그대로 mapScheduleErrorMessage에 위임).
const GUEST_APPLICATION_REVIEW_ERROR_MESSAGES: Record<string, string> = {
  GUEST_APPLICATION_NOT_FOUND: '신청 정보를 찾을 수 없어요.',
  GUEST_APPLICATION_NOT_PENDING: '이미 처리된 신청이에요. 새로고침 후 다시 확인해 주세요.',
  GUEST_RECRUITMENT_FULL: '모집 인원이 이미 다 찼어요.',
};

function mapReviewApplicationErrorMessage(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code && GUEST_APPLICATION_REVIEW_ERROR_MESSAGES[code]) return GUEST_APPLICATION_REVIEW_ERROR_MESSAGES[code];
  return mapScheduleErrorMessage(err, fallback);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// ── 목록 ──────────────────────────────────────────────────────────────────────

export function TeamScheduleListPageClient({ teamId }: { teamId: string }) {
  const team = useV1TeamDetail(teamId);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [typeFilter, setTypeFilter] = useState<ScheduleTypeFilter>('all');
  const [stateFilter, setStateFilter] = useState<ScheduleStateFilter>('all');
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // 서버 캡(최대 100)을 그대로 사용 — 캘린더가 한 달 치를 필터 없이 훑어보려면
  // 목록 API의 종류/상태 필터를 그대로 쓰되 넉넉한 limit으로 한 페이지에 담는다.
  const filters = useMemo(() => {
    const next: Record<string, string | number> = { limit: 100 };
    if (typeFilter !== 'all') next.type = typeFilter;
    if (stateFilter !== 'all') next.state = stateFilter;
    return next;
  }, [typeFilter, stateFilter]);

  const query = useV1TeamSchedules(teamId, filters);
  const items = query.data?.items ?? [];
  const canManage = isScheduleManagerRole(team.data?.viewer.role);
  const todayKey = dateKeyOf(new Date().toISOString());
  const calendar = buildScheduleCalendarMonth(items, monthDate, todayKey);
  const listItems = items.map((item) => toScheduleListItemModel(item, teamId));
  const visibleItems =
    view === 'calendar' && selectedDateKey ? listItems.filter((item) => item.dateKey === selectedDateKey) : listItems;

  const model: ScheduleListViewModel = {
    teamId,
    teamName: team.data?.name ?? '',
    canManage,
    createHref: `/teams/${teamId}/schedules/new`,
    view,
    onViewChange: setView,
    typeFilter,
    onTypeFilterChange: setTypeFilter,
    stateFilter,
    onStateFilterChange: setStateFilter,
    typeOptions: scheduleTypeFilterOptions(),
    stateOptions: scheduleStateFilterOptions(),
    calendar,
    selectedDateKey,
    onSelectDate: setSelectedDateKey,
    onPrevMonth: () => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)),
    onNextMonth: () => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)),
    items: listItems,
    visibleItems,
    loading: query.isLoading,
    error: query.isError,
    onRetry: () => void query.refetch(),
    emptyTitle: '아직 등록된 일정이 없어요',
    emptySub: canManage
      ? '팀원과 함께할 첫 일정을 만들어 보세요.'
      : '팀 운영진이 일정을 등록하면 여기서 확인할 수 있어요.',
  };

  return <ScheduleListPageView model={model} />;
}

// ── 상세 ──────────────────────────────────────────────────────────────────────

export function TeamScheduleDetailPageClient({ teamId, scheduleId }: { teamId: string; scheduleId: string }) {
  const queryClient = useQueryClient();
  const team = useV1TeamDetail(teamId);
  const detail = useV1TeamSchedule(teamId, scheduleId);
  const setAttendance = useV1SetMyScheduleAttendance(teamId, scheduleId);
  const cancelSchedule = useV1CancelTeamSchedule(teamId, scheduleId);
  const completeSchedule = useV1CompleteTeamSchedule(teamId, scheduleId);
  const triggerReminder = useV1TriggerScheduleReminder(teamId, scheduleId);
  const createRecruitment = useV1CreateGuestRecruitment(teamId, scheduleId);
  const updateRecruitment = useV1UpdateGuestRecruitment(teamId, scheduleId);
  const applyRecruitment = useV1ApplyGuestRecruitment(teamId, scheduleId);

  const [conflictBanner, setConflictBanner] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [recruitmentEditOpen, setRecruitmentEditOpen] = useState(false);
  const [recruitmentSlots, setRecruitmentSlots] = useState('1');
  const [recruitmentClosesAt, setRecruitmentClosesAt] = useState('');
  const [recruitmentNote, setRecruitmentNote] = useState('');
  const [recruitmentVisibility, setRecruitmentVisibility] = useState<V1GuestRecruitmentVisibility>('PUBLIC');
  const [recruitmentEditError, setRecruitmentEditError] = useState<string | null>(null);

  const [applicantName, setApplicantName] = useState('');
  const [applicantNote, setApplicantNote] = useState('');
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [applicationSuccess, setApplicationSuccess] = useState<string | null>(null);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);

  const [applicationActionError, setApplicationActionError] = useState<string | null>(null);
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);

  const schedule = detail.data;
  const backHref = `/teams/${teamId}/schedules`;
  const viewerRole = team.data?.viewer.role;
  const canManage = isScheduleManagerRole(viewerRole);
  const canRsvp = isScheduleMemberRole(viewerRole);

  // 신청자 목록 + 승인/거절 — Task 12(guest-recruitment)에 없던 lane. 전용 훅이 아직
  // hooks/use-v1-api.ts에 없어(이 배치의 ownedFiles 밖) 같은 저수준 클라이언트를 여기서
  // 직접 조합한다. manager+만, 그리고 모집이 실제로 열려 있을 때만 불러온다.
  const guestApplicationsQueryKey = ['v1', 'guest-recruitment-applications', teamId, scheduleId] as const;
  const guestApplicationsQuery = useQuery({
    queryKey: guestApplicationsQueryKey,
    queryFn: () =>
      v1Get<{ items: V1GuestApplicationListItem[] }>(`/teams/${teamId}/schedules/${scheduleId}/guest-recruitment/applications`),
    enabled: canManage && Boolean(schedule?.guestRecruitment),
  });
  const reviewApplication = useMutation({
    mutationFn: ({ applicationId, state }: { applicationId: string; state: 'approved' | 'rejected' }) =>
      v1Patch<V1ReviewGuestApplicationResult>(
        `/teams/${teamId}/schedules/${scheduleId}/guest-recruitment/applications/${applicationId}`,
        { state } satisfies V1ReviewGuestApplicationDto,
        { headers: { 'Idempotency-Key': randomUuid() } },
      ),
    onSuccess: () => {
      // 승인은 recruitment.approvedCount/state(FILLED 도달 여부)도 함께 바꾸므로 둘 다 갱신한다.
      void queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) });
      void queryClient.invalidateQueries({ queryKey: guestApplicationsQueryKey });
    },
  });

  function onReviewApplication(applicationId: string, state: 'approved' | 'rejected') {
    setApplicationActionError(null);
    setPendingApplicationId(applicationId);
    reviewApplication.mutate(
      { applicationId, state },
      {
        onSettled: () => setPendingApplicationId(null),
        onError: (err) =>
          setApplicationActionError(mapReviewApplicationErrorMessage(err, state === 'approved' ? '승인하지 못했어요.' : '거절하지 못했어요.')),
      },
    );
  }

  function reportPossibleConflict(err: unknown, fallback: string): string {
    const message = mapScheduleErrorMessage(err, fallback);
    if (isScheduleStaleConflict(err)) {
      setConflictBanner(message);
      void detail.refetch();
    }
    return message;
  }

  function onSetStatus(status: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    if (!schedule) return;
    setAttendanceError(null);
    setAttendance.mutate(
      { status, expectedVersion: schedule.myAttendance?.version ?? 0 },
      { onError: (err) => setAttendanceError(reportPossibleConflict(err, '참석 여부를 바꾸지 못했어요.')) },
    );
  }

  function onCancelConfirm() {
    if (!schedule) return;
    setCancelError(null);
    cancelSchedule.mutate(
      { expectedVersion: schedule.version, cancelReason: cancelReason.trim() },
      {
        onSuccess: () => {
          setCancelOpen(false);
          setCancelReason('');
        },
        onError: (err) => setCancelError(reportPossibleConflict(err, '일정을 취소하지 못했어요.')),
      },
    );
  }

  function onComplete() {
    if (!schedule) return;
    completeSchedule.mutate(
      { expectedVersion: schedule.version },
      { onError: (err) => setConflictBanner(reportPossibleConflict(err, '일정을 완료 처리하지 못했어요.')) },
    );
  }

  function onCreateRecruitment() {
    if (!schedule) return;
    const closesAt = schedule.rsvpDeadlineAt ?? schedule.startAt;
    // 용병 모집은 정의상 팀 밖 사람을 구하는 기능이다 — visibility를 생략하면 서버가
    // MEMBERS로 기본값을 매겨, 신청 폼을 볼 수 있는 유일한 대상(비멤버)에게 영원히 보이지
    // 않는 모집이 만들어진다(신규 결함). 새로 여는 모집은 항상 PUBLIC으로 시작하고,
    // 필요하면 아래 "모집 정보 수정" 패널에서 팀원 전용으로 바꿀 수 있다.
    createRecruitment.mutate(
      { slots: 1, closesAt, visibility: 'PUBLIC' },
      { onError: (err) => setConflictBanner(reportPossibleConflict(err, '용병 모집을 열지 못했어요.')) },
    );
  }

  function onToggleRecruitmentOpen() {
    const recruitment = schedule?.guestRecruitment;
    if (!recruitment) return;
    updateRecruitment.mutate(
      { expectedVersion: recruitment.version, state: recruitment.state === 'OPEN' ? 'closed' : 'open' },
      { onError: (err) => setConflictBanner(reportPossibleConflict(err, '모집 상태를 바꾸지 못했어요.')) },
    );
  }

  function onOpenRecruitmentEdit() {
    const recruitment = schedule?.guestRecruitment;
    if (!recruitment) return;
    setRecruitmentSlots(String(recruitment.slots));
    setRecruitmentClosesAt(toDatetimeLocalValue(recruitment.closesAt));
    setRecruitmentNote(recruitment.note ?? '');
    setRecruitmentVisibility(recruitment.visibility);
    setRecruitmentEditError(null);
    setRecruitmentEditOpen(true);
  }

  function onSaveRecruitmentEdit() {
    const recruitment = schedule?.guestRecruitment;
    if (!recruitment) return;
    const closesAtIso = fromDatetimeLocalValue(recruitmentClosesAt);
    const slotsNum = Number(recruitmentSlots);
    if (!closesAtIso || !Number.isFinite(slotsNum) || slotsNum < 1) {
      setRecruitmentEditError('모집 인원과 마감 시각을 다시 확인해 주세요.');
      return;
    }
    setRecruitmentEditError(null);
    updateRecruitment.mutate(
      {
        expectedVersion: recruitment.version,
        slots: slotsNum,
        closesAt: closesAtIso,
        note: recruitmentNote.trim() || undefined,
        visibility: recruitmentVisibility,
      },
      {
        onSuccess: () => setRecruitmentEditOpen(false),
        onError: (err) => setRecruitmentEditError(reportPossibleConflict(err, '모집 정보를 저장하지 못했어요.')),
      },
    );
  }

  function onApplyRecruitment() {
    setApplicationError(null);
    applyRecruitment.mutate(
      { displayName: applicantName.trim(), note: applicantNote.trim() || undefined },
      {
        onSuccess: (result) => {
          setApplicationSubmitted(true);
          setApplicationSuccess(result.alreadyApplied ? '이미 신청했어요.' : '용병으로 신청했어요.');
        },
        onError: (err) => setApplicationError(mapScheduleErrorMessage(err, '신청하지 못했어요.')),
      },
    );
  }

  const recruitment = schedule?.guestRecruitment ?? null;
  const rsvpDeadlinePassed = isDeadlinePassed(schedule?.rsvpDeadlineAt ?? null);
  // 본인 응답과 대리 표시가 **같은 제약**을 따르도록 판정을 한 곳에서 만든다 —
  // 마감이 지났거나 일정이 SCHEDULED 가 아니면 대리로도 바꿀 수 없다. 둘이 갈리면
  // "팀장은 마감 후에도 바꿀 수 있나?"가 화면마다 다르게 답해진다.
  const attendanceDisabled = !schedule || schedule.state !== 'SCHEDULED' || rsvpDeadlinePassed;
  const [proxyPendingUserId, setProxyPendingUserId] = useState<string | null>(null);
  const { data: me } = useV1AuthMe();
  const [proxyError, setProxyError] = useState<string | null>(null);
  const setAttendanceOnBehalf = useV1SetScheduleAttendanceOnBehalf(teamId, scheduleId);
  function onProxyGoing(userId: string) {
    setProxyError(null);
    setProxyPendingUserId(userId);
    setAttendanceOnBehalf.mutate(
      { userId, status: 'GOING', expectedVersion: 0 },
      {
        onError: (err) => setProxyError(reportPossibleConflict(err, '참석을 대신 표시하지 못했어요.')),
        onSettled: () => setProxyPendingUserId(null),
      },
    );
  }
  const recruitmentDeadlinePassed = isDeadlinePassed(recruitment?.closesAt ?? null);

  const history: ScheduleDetailViewModel['history'] = [];
  if (schedule?.state === 'CANCELLED') {
    history.push({ label: '취소됨', detail: schedule.cancelledAt ? formatTournamentDateTimeLong(schedule.cancelledAt) : null });
    if (schedule.cancelReason) history.push({ label: '취소 사유', detail: schedule.cancelReason });
  } else if (schedule?.state === 'COMPLETED') {
    history.push({ label: '완료 처리됨', detail: null });
  }

  const matchDisplay = schedule ? matchScheduleDisplay(schedule.type, schedule.state, schedule.matchConfirmed) : null;

  const model: ScheduleDetailViewModel = {
    teamId,
    scheduleId,
    backHref,
    title: schedule?.title ?? '불러오는 중…',
    typeLabel: schedule ? scheduleTypeLabel(schedule.type) : '',
    stateLabel: matchDisplay?.stateLabel ?? '',
    stateTone: matchDisplay?.stateTone ?? 'default',
    state: schedule?.state ?? 'SCHEDULED',
    dateTimeLabel: schedule ? formatTournamentDateRangeWithTime(schedule.startAt, schedule.endAt) ?? '일정 미정' : '',
    visibilityLabel: schedule ? scheduleVisibilityLabel(schedule.visibility) : '',
    capacityLabel: schedule?.capacity != null ? `정원 ${schedule.goingCount}/${schedule.capacity}명` : null,
    version: schedule?.version ?? 0,
    conflictBanner,
    onDismissConflict: () => setConflictBanner(null),
    history,
    attendance: {
      visible: canRsvp,
      myStatus: schedule?.myAttendance?.status ?? null,
      waitlistPosition: schedule?.myAttendance?.waitlistPosition ?? null,
      counts: { going: schedule?.goingCount ?? 0, waitlisted: schedule?.waitlistedCount ?? 0 },
      deadlineLabel: scheduleRsvpDeadlineLabel(schedule?.rsvpDeadlineAt ?? null),
      deadlinePassed: rsvpDeadlinePassed,
      disabled: !schedule || schedule.state !== 'SCHEDULED' || rsvpDeadlinePassed || setAttendance.isPending,
      disabledReason: !schedule
        ? null
        : schedule.state !== 'SCHEDULED'
          ? '이미 종료된 일정이라 참석 여부를 바꿀 수 없어요.'
          : rsvpDeadlinePassed
            ? '참석 신청 마감 시간이 지났어요.'
            : null,
      pending: setAttendance.isPending,
      error: attendanceError,
      onSetStatus,
    },
    attendees: {
      visible: Boolean(schedule?.attendees),
      items: (schedule?.attendees ?? []).map((attendee) => ({
        userId: attendee.userId,
        nickname: attendee.nickname,
        profileImageUrl: attendee.profileImageUrl,
        status: attendee.status,
      })),
      counts: {
        all: schedule?.attendees?.length ?? 0,
        going: schedule?.attendees?.filter((attendee) => attendee.status === 'GOING').length ?? 0,
        noResponse: schedule?.attendees?.filter((attendee) => attendee.status === 'NO_RESPONSE').length ?? 0,
      },
      // 대리 표시는 팀장·매니저만 — 서버도 403 으로 막지만 누를 수 없는 버튼을
      // 보여주고 눌러서 실패하게 두지 않는다. 마감·상태 제약은 본인 응답과 같은
      // 판정을 쓴다(attendance.disabled) — 마감이 지났으면 대리로도 못 바꾼다.
      canProxy: canManage && !attendanceDisabled,
      // 자기 줄에는 대리 버튼을 내지 않는다 — 위쪽 "내 참석"이 같은 일을 한다.
      // 아직 /auth/me 가 안 왔으면 null 이고, 그동안은 어느 줄에도 버튼이 안 뜬다:
      // 잠깐 안 보이는 쪽이, 자기 줄에 잘못 떴다가 사라지는 쪽보다 낫다.
      viewerUserId: me?.user.id ?? null,
      proxyPendingUserId: proxyPendingUserId,
      proxyError: proxyError,
      onProxyGoing: onProxyGoing,
    },
    guestRecruitment: {
      visible: Boolean(recruitment),
      slots: recruitment?.slots ?? 0,
      applicantCount: recruitment?.applicantCount ?? 0,
      approvedCount: recruitment?.approvedCount ?? 0,
      closesAtLabel: recruitment ? `${formatTournamentDateTimeLong(recruitment.closesAt)} 마감` : '',
      note: recruitment?.note ?? null,
      stateLabel: recruitment ? guestRecruitmentStateLabel(recruitment.state) : '',
      visibilityLabel: recruitment ? GUEST_RECRUITMENT_VISIBILITY_LABELS[recruitment.visibility] : '',
      isOpen: recruitment?.state === 'OPEN',
      manage: canManage
        ? {
            onCreate: onCreateRecruitment,
            onToggleOpen: onToggleRecruitmentOpen,
            onEdit: onOpenRecruitmentEdit,
            pending: createRecruitment.isPending || updateRecruitment.isPending,
            exists: Boolean(recruitment),
            editPanel: recruitmentEditOpen
              ? {
                  open: true,
                  slots: recruitmentSlots,
                  closesAt: recruitmentClosesAt,
                  note: recruitmentNote,
                  visibility: recruitmentVisibility,
                  onSlotsChange: setRecruitmentSlots,
                  onClosesAtChange: setRecruitmentClosesAt,
                  onNoteChange: setRecruitmentNote,
                  onVisibilityChange: setRecruitmentVisibility,
                  onSave: onSaveRecruitmentEdit,
                  onDismiss: () => setRecruitmentEditOpen(false),
                  pending: updateRecruitment.isPending,
                  error: recruitmentEditError,
                }
              : undefined,
            applications: {
              items: (guestApplicationsQuery.data?.items ?? []).map((item) => ({
                applicationId: item.applicationId,
                displayName: item.displayName,
                note: item.note,
                state: item.state,
                stateLabel: GUEST_APPLICATION_STATE_LABELS[item.state] ?? item.state,
              })),
              loading: guestApplicationsQuery.isLoading,
              error: guestApplicationsQuery.isError
                ? mapScheduleErrorMessage(guestApplicationsQuery.error, '신청자 목록을 불러오지 못했어요.')
                : applicationActionError,
              onApprove: (applicationId: string) => onReviewApplication(applicationId, 'approved'),
              onReject: (applicationId: string) => onReviewApplication(applicationId, 'rejected'),
              pendingApplicationId,
            },
          }
        : undefined,
      applicationForm:
        !canRsvp && recruitment && recruitment.state === 'OPEN' && !recruitmentDeadlinePassed
          ? {
              displayName: applicantName,
              note: applicantNote,
              onDisplayNameChange: setApplicantName,
              onNoteChange: setApplicantNote,
              onSubmit: onApplyRecruitment,
              submitting: applyRecruitment.isPending,
              error: applicationError,
              successMessage: applicationSuccess,
              visible: !applicationSubmitted,
            }
          : undefined,
    },
    manage: {
      visible: canManage && schedule?.state === 'SCHEDULED',
      editHref: `/teams/${teamId}/schedules/${scheduleId}/edit`,
      onCancel: () => {
        setCancelError(null);
        setCancelOpen(true);
      },
      onComplete,
      canComplete: Boolean(schedule && schedule.state === 'SCHEDULED' && new Date(schedule.endAt).getTime() <= Date.now()),
      // 이 사유는 `manage.visible`(위 382행 — `state === 'SCHEDULED'`를 이미
      // 요구한다) 안에서만 렌더되므로, 취소·종료된 일정을 위한 분기는 화면에
      // 도달할 수 없다. 도달 못 하는 문구를 남겨두면 이후에 그게 노출된다고
      // 오해하게 되므로 시간 조건만 남긴다.
      completeDisabledReason:
        schedule && new Date(schedule.endAt).getTime() > Date.now()
          ? '경기가 끝난 뒤에 완료 처리할 수 있어요.'
          : null,
      cancelPending: cancelSchedule.isPending,
      completePending: completeSchedule.isPending,
      reminders: [
        {
          kind: 'rsvp_deadline',
          label: triggerReminder.isPending ? '전송 중…' : 'RSVP 마감 알림 보내기',
          onTrigger: () => triggerReminder.mutate({ kind: 'rsvp_deadline' }),
          pending: triggerReminder.isPending,
          visible: Boolean(schedule?.rsvpDeadlineAt),
        },
        {
          kind: 'guest_recruitment_close',
          label: '모집 마감 알림 보내기',
          onTrigger: () => triggerReminder.mutate({ kind: 'guest_recruitment_close' }),
          pending: triggerReminder.isPending,
          visible: Boolean(recruitment && recruitment.state === 'OPEN'),
        },
      ],
    },
    cancelModal: {
      open: cancelOpen,
      reason: cancelReason,
      onReasonChange: setCancelReason,
      onConfirm: onCancelConfirm,
      onDismiss: () => {
        setCancelOpen(false);
        setCancelError(null);
      },
      pending: cancelSchedule.isPending,
      error: cancelError,
    },
    loading: detail.isLoading,
    error: detail.isError,
    onRetry: () => void detail.refetch(),
  };

  return <ScheduleDetailPageView model={model} />;
}

// ── 생성/수정 폼 ───────────────────────────────────────────────────────────────

const EMPTY_DRAFT: ScheduleFormDraft = {
  title: '',
  type: 'TRAINING',
  startAt: '',
  endAt: '',
  capacity: '',
  rsvpDeadlineAt: '',
  visibility: 'TEAM',
};

export function TeamScheduleFormPageClient({ teamId, scheduleId }: { teamId: string; scheduleId?: string }) {
  const router = useRouter();
  const mode: ScheduleFormMode = scheduleId ? 'edit' : 'create';
  const team = useV1TeamDetail(teamId);
  const detail = useV1TeamSchedule(teamId, scheduleId ?? '', { enabled: mode === 'edit' });
  const create = useV1CreateTeamSchedule(teamId);
  const update = useV1UpdateTeamSchedule(teamId, scheduleId ?? '');

  const canManage = isScheduleManagerRole(team.data?.viewer.role);
  /** The viewer's role is unknown until the team query settles. Treat that window as "still
   * loading" rather than as "allowed" -- see the model comment below. */
  const teamPending = team.data === undefined && !team.isError;
  const [draft, setDraft] = useState<ScheduleFormDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(mode === 'create');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !detail.data || hydrated) return;
    setDraft({
      title: detail.data.title,
      type: detail.data.type,
      startAt: toDatetimeLocalValue(detail.data.startAt),
      endAt: toDatetimeLocalValue(detail.data.endAt),
      capacity: detail.data.capacity != null ? String(detail.data.capacity) : '',
      rsvpDeadlineAt: toDatetimeLocalValue(detail.data.rsvpDeadlineAt),
      // MEMBERS는 폼 선택지에서 뺐다(TEAM과 백엔드 동작이 동일 — scheduleVisibilityOptions()
      // 주석 참고). 레거시로 MEMBERS가 저장된 일정을 열면 TEAM으로 정규화해 토글에 항상
      // 선택된 버튼이 보이게 한다. 실제 접근 범위는 바뀌지 않는다.
      visibility: detail.data.visibility === 'MEMBERS' ? 'TEAM' : detail.data.visibility,
    });
    setHydrated(true);
  }, [mode, detail.data, hydrated]);

  function onFieldChange<K extends keyof ScheduleFormDraft>(field: K, value: ScheduleFormDraft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function onSubmit() {
    const startAtIso = fromDatetimeLocalValue(draft.startAt);
    const endAtIso = fromDatetimeLocalValue(draft.endAt);
    if (!draft.title.trim() || !startAtIso || !endAtIso) {
      setError('제목과 시작·종료 시각을 모두 입력해 주세요.');
      return;
    }
    setError(null);
    const capacityNum = draft.capacity.trim() ? Number(draft.capacity) : undefined;
    const rsvpDeadlineIso = fromDatetimeLocalValue(draft.rsvpDeadlineAt);

    if (mode === 'create') {
      // MATCH 일정은 팀매치가 시스템으로만 만든다(서버가 SCHEDULE_MATCH_TYPE_SYSTEM_ONLY 로 거부).
      // draft.type 은 수정 모드에서 기존 일정 값을 그대로 받아오므로 MATCH 가 될 수 있는데,
      // 그 값이 생성 경로로 새면 서버에서 422 로 떨어진다. 조용히 다른 타입으로 바꾸면 사용자가
      // 의도하지 않은 일정이 만들어지므로, 만들지 않고 이유를 알린다.
      if (draft.type === 'MATCH') {
        setError('매치 일정은 매치를 만들면 자동으로 생겨요. 여기서는 훈련이나 이벤트만 만들 수 있어요.');
        return;
      }
      const payload: V1CreateScheduleDto = {
        title: draft.title.trim(),
        type: draft.type,
        startAt: startAtIso,
        endAt: endAtIso,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        capacity: capacityNum,
        rsvpDeadlineAt: rsvpDeadlineIso,
        visibility: draft.visibility,
      };
      create.mutate(payload, {
        onSuccess: (result) => router.push(`/teams/${teamId}/schedules/${result.id}`),
        onError: (err) => setError(mapScheduleErrorMessage(err, '일정을 만들지 못했어요.')),
      });
      return;
    }

    if (!detail.data) return;
    const payload: V1UpdateScheduleDto = {
      expectedVersion: detail.data.version,
      title: draft.title.trim(),
      startAt: startAtIso,
      endAt: endAtIso,
      capacity: capacityNum,
      // 필드가 비어있으면 명시적으로 null(서버가 SQL NULL로 지움), 값이 있으면 그 값,
      // 미로딩 상태에서 값이 있었는데 사용자가 손대지 않은 경우도 위 draft 값 그대로 보낸다.
      rsvpDeadlineAt: draft.rsvpDeadlineAt.trim() ? rsvpDeadlineIso : null,
      visibility: draft.visibility,
    };
    update.mutate(payload, {
      onSuccess: () => router.push(`/teams/${teamId}/schedules/${scheduleId}`),
      onError: (err) => {
        const message = mapScheduleErrorMessage(err, '일정을 저장하지 못했어요.');
        setError(message);
        if (isScheduleStaleConflict(err)) void detail.refetch();
      },
    });
  }

  const backHref = mode === 'edit' ? `/teams/${teamId}/schedules/${scheduleId}` : `/teams/${teamId}/schedules`;

  const model: ScheduleFormViewModel = {
    mode,
    backHref,
    draft,
    onFieldChange,
    typeOptions: scheduleCreatableTypeOptions(),
    typeEditable: mode === 'create',
    visibilityOptions: scheduleVisibilityOptions(),
    onSubmit,
    submitting: create.isPending || update.isPending,
    error,
    // ScheduleFormPageView branches forbidden -> loadError -> loading, so both flags below are
    // computed against `teamPending` to keep the live form unreachable until the viewer's role is
    // actually known. The previous `Boolean(team.data) && !canManage` failed OPEN: on a direct load
    // of /new or /edit there is no cached team query yet, so team.data is undefined, canManage is
    // false, and forbidden was ALSO false -- which fell through to rendering the fully interactive,
    // submittable form to a non-manager for the duration of the team-detail fetch. Every other
    // route in this file derives visibility from canManage alone, which is false-by-default and
    // therefore already fail-closed; this form path was the sole exception.
    loading: teamPending || (mode === 'edit' && (detail.isLoading || !hydrated) && !detail.isError),
    loadError: team.isError || (mode === 'edit' && detail.isError),
    onRetry: () => {
      if (team.isError) void team.refetch();
      if (mode === 'edit' && detail.isError) void detail.refetch();
    },
    forbidden: !teamPending && !team.isError && !canManage,
  };

  return <ScheduleFormPageView model={model} />;
}

// ── 내 일정 (GET /me/schedule) ────────────────────────────────────────────────

export function MySchedulePageClient() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'cancelled' | 'completed'>('all');
  const filters = useMemo(
    () => (statusFilter === 'all' ? { limit: 50 } : { limit: 50, status: statusFilter }),
    [statusFilter],
  );
  const query = useV1MySchedule(filters);

  const model: MyScheduleViewModel = {
    statusFilter,
    onStatusFilterChange: setStatusFilter,
    statusOptions: [
      { value: 'all', label: '전체' },
      { value: 'scheduled', label: '예정' },
      { value: 'cancelled', label: '취소됨' },
      { value: 'completed', label: '완료' },
    ],
    items: (query.data?.items ?? []).map((item) => {
      const display = matchScheduleDisplay(item.type, item.state, item.matchConfirmed);
      return {
        id: item.id,
        teamId: item.teamId,
        teamName: item.teamName ?? '팀',
        title: item.title,
        typeLabel: scheduleTypeLabel(item.type),
        stateLabel: display.stateLabel,
        stateTone: display.stateTone,
        isTentative: display.isTentative,
        dateTimeLabel: formatTournamentDateRangeWithTime(item.startAt, item.endAt) ?? '일정 미정',
        myAttendanceLabel: item.myAttendanceStatus ? attendanceStatusLabel(item.myAttendanceStatus) : null,
        href: `/teams/${item.teamId}/schedules/${item.id}`,
      };
    }),
    loading: query.isLoading,
    error: query.isError,
    onRetry: () => void query.refetch(),
    emptyTitle: '예정된 일정이 없어요',
    emptySub: '소속 팀에서 일정을 등록하면 여기서 한 번에 확인할 수 있어요.',
  };

  return <MySchedulePageView model={model} />;
}
