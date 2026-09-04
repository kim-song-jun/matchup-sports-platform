'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import {
  useV1TournamentPlayers,
  useV1Tournament,
  useV1Registration,
  useV1AddPlayer,
  useV1UpdatePlayer,
  useV1UpdatePlayerJersey,
  useV1RemovePlayer,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { josa } from '@/lib/korean';
import { v1Keys } from '@/lib/query-keys';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import type {
  V1TournamentPlayer,
  V1PlayerEligibilityStatus,
  V1TeamMembersPage,
  V1TournamentGenderCategory,
} from '@/types/api';

/**
 * 서버 `ROSTER_MUTABLE_TOURNAMENT_STATUSES`(apps/v1_api/.../roster-cleanup.ts)와 동일 집합.
 * 감사 finding #1(2026-08): 이 화면이 대회 status를 전혀 보지 않아, 완료·취소된 대회에서도
 * '수정 가능' 배지·버튼이 그대로 떠 있다가 서버 409(TOURNAMENT_ROSTER_NOT_MUTABLE)로 실패했다.
 * 두 목록이 갈리지 않도록, 서버 값이 바뀌면 이 상수도 함께 고친다.
 */
const ROSTER_MUTABLE_TOURNAMENT_STATUSES = new Set(['open', 'closed', 'in_progress']);

/** tournament가 아직 로딩 중이면(undefined) 막지 않는다 — 기존 낙관적 렌더링과 동일. */
export function isTournamentRosterMutable(status: string | null | undefined): boolean {
  if (!status) return true;
  return ROSTER_MUTABLE_TOURNAMENT_STATUSES.has(status);
}

/* ── Roster deadline helper ── */

export type RosterDeadlineState = {
  /** 명단 제출 마감이 지나 예외 없이는 편집이 막힌 상태 */
  blocked: boolean;
  /** 마감은 지났지만 어드민이 예외를 허용해 편집 가능한 상태 */
  overridden: boolean;
};

/**
 * 명단 제출 마감 상태를 판정한다.
 * - 마감일이 없으면 항상 편집 가능.
 * - 마감일이 지났고 어드민 예외(override)가 없으면 편집 차단.
 * - 마감일이 지났어도 어드민 예외가 있으면 편집 가능(overridden=true로 안내만 표시).
 */
export function getRosterDeadlineState(
  rosterDeadlineAt: string | null | undefined,
  overrideAt: string | null | undefined,
  now: Date = new Date(),
): RosterDeadlineState {
  if (!rosterDeadlineAt) return { blocked: false, overridden: false };
  const deadline = new Date(rosterDeadlineAt);
  if (Number.isNaN(deadline.getTime())) return { blocked: false, overridden: false };
  const isPast = now.getTime() > deadline.getTime();
  if (!isPast) return { blocked: false, overridden: false };
  return overrideAt ? { blocked: false, overridden: true } : { blocked: true, overridden: false };
}

/* ── Helpers ── */

function eligibilityLabel(status: V1PlayerEligibilityStatus): string {
  switch (status) {
    case 'non_pro': return '아마추어';
    case 'pro': return '선출';
    case 'needs_review': return '확인 중';
    default: return '알 수 없음';
  }
}

function eligibilityBadgeClass(status: V1PlayerEligibilityStatus): string {
  switch (status) {
    case 'non_pro': return 'tm-badge-grey';
    case 'pro': return 'tm-badge-blue';
    case 'needs_review': return 'tm-badge-orange';
    default: return 'tm-badge-grey';
  }
}

export function normalizeProfileText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function normalizeBirthDateForInput(v: unknown): string {
  const raw = normalizeProfileText(v);
  if (!raw) return '';
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const ymd = raw.match(/^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

export function formatRosterBirthDate(dateStr: string | null): string {
  const normalized = normalizeBirthDateForInput(dateStr);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '미입력';
  const [year, month, day] = normalized.split('-');
  return `${year}.${month}.${day}`;
}

export type RegistrationDeadlineState = 'upcoming' | 'closed' | 'unscheduled';

export function getRegistrationDeadlineState(
  deadlineAt: string | null | undefined,
  nowMs = Date.now(),
): RegistrationDeadlineState {
  if (!deadlineAt) return 'unscheduled';
  const deadlineMs = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) return 'unscheduled';
  return deadlineMs <= nowMs ? 'closed' : 'upcoming';
}

export function TournamentRosterDeadlineCard({
  deadlineAt,
  isTournamentRosterClosed = false,
  isRosterLocked,
  isRosterEditBlockedByStatus,
  isRosterDeadlineBlocked,
  nowMs,
}: {
  deadlineAt: string | null;
  /** 대회가 완료·취소돼 누구도 명단을 못 고치는 상태 — 잠금·마감보다 우선한다(서버 assertRosterMutable과 동일 순서). */
  isTournamentRosterClosed?: boolean;
  isRosterLocked: boolean;
  isRosterEditBlockedByStatus: boolean;
  isRosterDeadlineBlocked: boolean;
  nowMs?: number;
}) {
  const deadlineState = getRegistrationDeadlineState(deadlineAt, nowMs);
  const deadlineBadge = deadlineState === 'upcoming'
    ? { label: '신청 접수 중', className: 'tm-badge-green' }
    : deadlineState === 'closed'
      ? { label: '신청 마감', className: 'tm-badge-grey' }
      : { label: '일정 미정', className: 'tm-badge-grey' };
  const canEditRoster =
    !isTournamentRosterClosed && !isRosterLocked && !isRosterEditBlockedByStatus && !isRosterDeadlineBlocked;
  const rosterEditBadge = isTournamentRosterClosed
    ? '수정 불가'
    : isRosterLocked
      ? '명단 마감'
      : isRosterEditBlockedByStatus
        ? '수정 불가'
        : isRosterDeadlineBlocked
          ? '제출 마감'
          : '수정 가능';
  const rosterEditMessage = isTournamentRosterClosed
    ? '대회가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.'
    : isRosterLocked
      ? '선수 명단이 운영진에 의해 마감됐어요.'
      : isRosterEditBlockedByStatus
        ? '취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요.'
        : isRosterDeadlineBlocked
          ? '선수 명단 제출 기간이 종료됐어요.'
          : '대회 신청 마감과 별개로, 운영진이 명단을 잠그기 전까지 수정할 수 있어요.';

  return (
    <Card pad={16} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className={'tm-text-micro'} style={{ color: 'var(--text-caption)', fontWeight: 600 }}>
            대회 신청 마감
          </div>
          <div className={'tm-text-label'} style={{ color: 'var(--text-strong)', fontWeight: 700, marginTop: 4 }}>
            {formatTournamentDateTimeLong(deadlineAt)}
          </div>
        </div>
        <span className={`tm-badge ${deadlineBadge.className}`} style={{ flexShrink: 0 }}>
          {deadlineBadge.label}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span className={'tm-text-caption'} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            선수 명단
          </span>
          <span className={`tm-badge ${canEditRoster ? 'tm-badge-green' : 'tm-badge-grey'}`}>
            {rosterEditBadge}
          </span>
        </div>
        <div className={'tm-text-micro'} style={{ color: 'var(--text-caption)', lineHeight: 1.5, marginTop: 8 }}>
          {rosterEditMessage}
        </div>
      </div>
    </Card>
  );
}

/**
 * 등번호 입력값을 보낼 값으로 바꾼다.
 *
 * **`Number()` 에 그냥 넘기면 안 된다.** `type="number"` 입력은 `e`·`1e2`·`-` 를 그대로
 * 통과시키고, `Number('e')` 는 `NaN` 이며 **`NaN` 은 JSON 에서 `null` 로 직렬화된다** —
 * 서버에서 "번호를 안 보냄" 과 구분되지 않아 번호가 조용히 사라진다(2026-09-04 Copilot 리뷰).
 *
 * 빈 값은 **번호 없는 선수**이지 오류가 아니다. `0` 은 유효한 등번호다.
 */
export function parseJerseyInput(raw: string): { ok: true; value?: number } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true };
  if (!/^\d{1,2}$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Number(trimmed) };
}

/* ── Add player form ── */

type AddPlayerFormState = {
  userId: string;
  realName: string;
  birthDate: string;
  phone: string;
  /** 등번호. 문자열로 들고 있다가 보낼 때만 숫자로 바꾼다 — 빈 값과 `0` 을 구분해야 한다. */
  jerseyNumber: string;
  eligibilityStatus: V1PlayerEligibilityStatus;
};

const EMPTY_FORM: AddPlayerFormState = {
  userId: '',
  realName: '',
  birthDate: '',
  phone: '',
  jerseyNumber: '',
  eligibilityStatus: 'non_pro',
};

const EMPTY_TEAM_MEMBERS_PAGE: V1TeamMembersPage = {
  items: [],
  summary: {
    ownerCount: 0,
    managerCount: 0,
    memberCount: 0,
  },
  viewerRole: 'member',
  membersVisibilityEnabled: false,
  pageInfo: {
    nextCursor: null,
    hasNext: false,
  },
};

function normalizeTeamMembersPage(page: V1TeamMembersPage | undefined | null): V1TeamMembersPage {
  if (!page || !Array.isArray(page.items) || !page.pageInfo) {
    return EMPTY_TEAM_MEMBERS_PAGE;
  }
  return page;
}

type DraftPlayerForm = {
  id: string;
  userId: string;
};

function createDraftPlayerForm(): DraftPlayerForm {
  return {
    id: `draft-${randomUuid()}`,
    userId: '',
  };
}

/** Loose YYYY-MM-DD validation (accepts partial input, blocks obviously wrong strings) */
function isValidBirthDate(v: string): boolean {
  if (!v) return true; // optional field — empty is valid
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/* Role label helper for the member picker */
function memberRoleLabel(role: 'owner' | 'manager' | 'member'): string {
  switch (role) {
    case 'owner': return '팀장';
    case 'manager': return '관리자';
    case 'member': return '멤버';
  }
}

/** 대회 성별 구분이 요구하는 선수 성별. 서버 genderRequiredByCategory와 동일 판정. */
function genderRequiredByCategory(
  category: V1TournamentGenderCategory | null | undefined,
): 'male' | 'female' | null {
  return category === 'male' || category === 'female' ? category : null;
}

type MemberIneligibility = {
  /** 드롭다운 옵션 뒤에 붙는 짧은 사유. */
  listReason: string;
  /** 선택 시 보여줄 상세 안내. */
  message: string;
};

/**
 * 이 팀원을 지금 명단에 추가할 수 있는가 — 서버 `evaluateRosterCandidate`(tournament-players.service.ts)의
 * 프로필·성별 판정을 프론트에서도 같은 기준으로 미리 계산한다.
 *
 * 감사 finding #49(2026-08): 이 화면이 실명·생년월일·휴대폰만 보고 "선택 가능"으로 표시해,
 * 여성부 대회의 남성 팀원·mixed 대회의 성별 미등록 팀원이 눌러 봐야 400을 받았다. 어드민 후보
 * 목록(listEligiblePlayersForAdmin)은 이미 같은 함수로 사유를 미리 계산해 주는데 팀 경로만
 * 빠져 있었다 — 여기서 그 간극을 메운다.
 *
 * 휴대폰 본인인증 여부(phoneVerifiedAt)는 이 화면이 쓰는 `GET /teams/:id/members` 응답에
 * 아직 없어(팀 멤버 조회 서비스는 이 배치 담당 파일이 아니다) 프론트에서 판정할 수 없다 —
 * 그 항목은 여전히 서버 제출 시 400 `PLAYER_PHONE_NOT_VERIFIED`가 최종 방어선이다.
 */
export function getMemberIneligibility(
  member: { realName?: unknown; birthDate?: unknown; phone?: unknown; gender?: 'male' | 'female' | null },
  genderCategory: V1TournamentGenderCategory | null | undefined,
): MemberIneligibility | null {
  const requiresAnyGender = genderCategory === 'mixed';
  const missing = [
    !normalizeProfileText(member.realName) ? '실명' : null,
    !normalizeBirthDateForInput(member.birthDate) ? '생년월일' : null,
    !normalizeProfileText(member.phone) ? '휴대폰 번호' : null,
    requiresAnyGender && !member.gender ? '성별' : null,
  ].filter((v): v is string => v !== null);
  if (missing.length > 0) {
    return {
      listReason: `${missing.join(', ')} 미입력`,
      message: requiresAnyGender
        ? '실명, 생년월일, 휴대폰 번호, 성별이 모두 등록된 팀원만 선수로 등록할 수 있어요.'
        : '실명, 생년월일, 휴대폰 번호가 모두 등록된 팀원만 선수로 등록할 수 있어요.',
    };
  }
  const requiredGender = genderRequiredByCategory(genderCategory);
  if (requiredGender && member.gender !== requiredGender) {
    return requiredGender === 'male'
      ? { listReason: '남성부 대회예요', message: '남성부 대회에는 남성 팀원만 등록할 수 있어요.' }
      : { listReason: '여성부 대회예요', message: '여성부 대회에는 여성 팀원만 등록할 수 있어요.' };
  }
  return null;
}

function isRegisterableMember(
  member: { realName?: unknown; birthDate?: unknown; phone?: unknown; gender?: 'male' | 'female' | null },
  genderCategory: V1TournamentGenderCategory | null | undefined,
) {
  return getMemberIneligibility(member, genderCategory) === null;
}

function isRegisterableForm(form: AddPlayerFormState) {
  return Boolean(form.realName.trim() && form.birthDate.trim() && form.phone.trim());
}

function memberMissingReason(
  member: { realName?: unknown; birthDate?: unknown; phone?: unknown; gender?: 'male' | 'female' | null },
  genderCategory: V1TournamentGenderCategory | null | undefined,
): string {
  return getMemberIneligibility(member, genderCategory)?.listReason ?? '';
}

function AddPlayerForm({
  formId,
  teamId,
  genderCategory,
  onSubmit,
  onRemove,
  onUserChange,
  registeredUserIds,
  pendingUserIds,
  isSubmitting,
  error,
}: {
  formId: string;
  teamId: string;
  /** 명단 추가 자격(성별 구분) 판정에 쓴다 — getMemberIneligibility 참조. */
  genderCategory: V1TournamentGenderCategory | null;
  onSubmit: (formId: string, data: AddPlayerFormState) => void;
  onRemove: (formId: string) => void;
  onUserChange: (formId: string, userId: string) => void;
  registeredUserIds: Set<string>;
  pendingUserIds: Set<string>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<AddPlayerFormState>(EMPTY_FORM);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');

  // ROSTER-004: cursor-paginated team member fetch so 50+ member teams work.
  // useInfiniteQuery accumulates all loaded pages; "더 보기" fetches the next page.
  const {
    data: membersPages,
    isLoading: membersLoading,
    isError: membersError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [...v1Keys.team(teamId), 'members', { limit: 50 }] as const,
    queryFn: ({ pageParam }) =>
      v1Get<V1TeamMembersPage | undefined>(`/teams/${teamId}/members`, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }).then(normalizeTeamMembersPage),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage?.pageInfo?.hasNext ? lastPage.pageInfo.nextCursor : undefined,
    enabled: Boolean(teamId),
  });

  const members = useMemo(
    () => membersPages?.pages.flatMap((p) => normalizeTeamMembersPage(p).items) ?? [],
    [membersPages],
  );
  const unavailableMembers = useMemo(
    () => members.filter((member) => !isRegisterableMember(member, genderCategory)),
    [members, genderCategory],
  );
  // ROSTER P2-8: 팀원이 많은 팀(8명 이상)에서만 검색으로 select 옵션을 좁힌다.
  const showMemberSearch = members.length >= 8;
  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [members, memberQuery]);

  function patch(partial: Partial<AddPlayerFormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  /** When a member is chosen from the dropdown, pre-fill profile snapshots returned by the API. */
  function handleMemberChange(userId: string) {
    const member = members.find((m) => m.userId === userId);
    onUserChange(formId, userId);
    patch({
      userId,
      realName: normalizeProfileText(member?.realName) || normalizeProfileText(member?.displayName),
      birthDate: normalizeBirthDateForInput(member?.birthDate),
      phone: normalizeProfileText(member?.phone),
    });
    setBirthDateError(null);
  }

  const birthDateValid = isValidBirthDate(form.birthDate);
  const selectedAlreadyRegistered = form.userId ? registeredUserIds.has(form.userId) : false;
  const selectedAlreadyPending = form.userId ? pendingUserIds.has(form.userId) : false;
  const selectedMember = form.userId ? members.find((m) => m.userId === form.userId) : undefined;
  // 폼 입력값(form.realName/birthDate/phone)만으론 성별을 판정할 수 없다 — 선택된 팀원의
  // 원본 프로필로 다시 계산한다(핸드메이드 오버라이드가 없는 한 form 값은 이 값을 그대로 복사한 것).
  const selectedIneligibility = selectedMember
    ? getMemberIneligibility(selectedMember, genderCategory)
    : null;
  const canSubmit =
    form.userId.trim().length > 0 &&
    isRegisterableForm(form) &&
    birthDateValid &&
    !selectedAlreadyRegistered &&
    !selectedAlreadyPending &&
    selectedIneligibility === null;
  const selectedMemberMissing = form.userId ? selectedIneligibility !== null : false;
  const memberFieldId = `${formId}-member`;
  const realNameFieldId = `${formId}-realname`;
  const birthDateFieldId = `${formId}-birthdate`;
  const phoneFieldId = `${formId}-phone`;
  const eligibilityFieldId = `${formId}-eligibility`;
  const jerseyFieldId = `${formId}-jersey`;
  // 팀 고정 등번호는 힌트로만 쓴다(A3) — 자동 채움 아님.
  const memberJerseyNumber = selectedMember?.jerseyNumber ?? null;
  // 팀원이 아예 없으면 아래 실명·생년월일·휴대폰 필드는 전부 채울 값이 없는 빈 폼이라
  // 제출도 불가능하다(canSubmit이 form.userId를 요구). 크리플드 폼을 보여주는 대신
  // 폼 전체를 "먼저 멤버를 추가하라" 안내로 대체한다.
  const noMembers = !membersLoading && !membersError && members.length === 0;

  /* #7a: Neutral solid card — no blue tint. Blue reserved for focus/active states only. */
  return (
    <Card pad={16} style={{ border: '1px solid var(--grey200)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
          선수 추가
        </div>
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-neutral"
          style={{ minWidth: 44, padding: '0 12px' }}
          onClick={() => onRemove(formId)}
          disabled={isSubmitting}
          aria-label="선수 추가 칸 삭제"
        >
          X
        </button>
      </div>

      {noMembers ? (
        <EmptyState
          illustration={{ name: 'auth-welcome' }}
          title="팀원이 없어요"
          sub="먼저 팀에 멤버를 추가한 뒤 명단에 올릴 수 있어요."
          cta={teamId ? '멤버 관리' : undefined}
          ctaHref={teamId ? `/teams/${teamId}/members` : undefined}
        />
      ) : (
      <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Team member picker — replaces raw userId text input */}
        <FormField id={memberFieldId} label="팀원 선택" required>
          {membersLoading ? (
            <div
              className="tm-input"
              style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', minHeight: 44 }}
              aria-busy="true"
            >
              팀원 목록 불러오는 중…
            </div>
          ) : membersError ? (
            <div
              className="tm-input"
              style={{ color: 'var(--red700)', display: 'flex', alignItems: 'center', minHeight: 44 }}
            >
              팀원 목록을 불러오지 못했어요.
            </div>
          ) : (
            <>
              {showMemberSearch ? (
                <input
                  type="text"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="이름으로 검색"
                  aria-label="팀원 이름 검색"
                  className="tm-input"
                  style={{ minHeight: 44, marginBottom: 8 }}
                />
              ) : null}
              {unavailableMembers.length > 0 ? (
                <p className="tm-text-micro" style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  {genderCategory === 'mixed'
                    ? '프로필(생년월일·휴대폰·성별)이 완성되고 대회 성별 구분에 맞는 팀원만 명단에 올릴 수 있어요. 팀원에게 프로필 완성을 요청해 주세요.'
                    : genderCategory === 'male' || genderCategory === 'female'
                      ? `프로필(생년월일·휴대폰)이 완성된 ${genderCategory === 'male' ? '남성' : '여성'} 팀원만 명단에 올릴 수 있어요. 팀원에게 프로필 완성을 요청해 주세요.`
                      : '프로필(생년월일·휴대폰)이 완성된 팀원만 명단에 올릴 수 있어요. 팀원에게 프로필 완성을 요청해 주세요.'}
                </p>
              ) : null}
              <select
                id={memberFieldId}
                value={form.userId}
                onChange={(e) => handleMemberChange(e.target.value)}
                className="tm-input"
                style={{ minHeight: 44 }}
                aria-required="true"
              >
                <option value="">팀원을 선택해 주세요</option>
                {filteredMembers.map((m) => {
                  const registerable = isRegisterableMember(m, genderCategory);
                  const alreadyRegistered = registeredUserIds.has(m.userId);
                  const alreadyPending = pendingUserIds.has(m.userId);
                  const disabled = !registerable || alreadyRegistered || alreadyPending;
                  const suffix = alreadyRegistered
                    ? ' - 이미 등록됨'
                    : alreadyPending
                      ? ' - 추가 대기 중'
                      : registerable
                        ? ''
                        : ` - ${memberMissingReason(m, genderCategory)}`;
                  return (
                    <option key={m.userId} value={m.userId} disabled={disabled}>
                      {m.displayName} ({memberRoleLabel(m.role)})
                      {suffix}
                    </option>
                  );
                })}
              </select>
              {selectedMemberMissing && selectedIneligibility ? (
                <p className="tm-text-micro" role="alert" style={{ color: 'var(--red700)', margin: '8px 0 0' }}>
                  {selectedIneligibility.message}
                </p>
              ) : null}
              {selectedAlreadyRegistered || selectedAlreadyPending ? (
                <p className="tm-text-micro" role="alert" style={{ color: 'var(--red700)', margin: '8px 0 0' }}>
                  {selectedAlreadyRegistered ? '이미 명단에 등록된 선수예요.' : '다른 추가 칸에서 선택한 선수예요.'}
                </p>
              ) : null}
              {unavailableMembers.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {unavailableMembers.map((m) => (
                    <div key={m.userId} className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>
                      {josa(m.displayName, ['은', '는'])} {josa(memberMissingReason(m, genderCategory), ['으로', '로'])} 표시돼요.
                    </div>
                  ))}
                </div>
              ) : null}
              {hasNextPage ? (
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ marginTop: 8, width: '100%', minHeight: 44 }}
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? '불러오는 중…' : `더 불러오기 (지금까지 ${members.length}명)`}
                </button>
              ) : null}
            </>
          )}
        </FormField>

        {/* Selected member profile fields are read-only snapshots for tournament roster registration. */}
        <FormField id={realNameFieldId} label="실명" required>
          <input
            id={realNameFieldId}
            type="text"
            value={form.realName}
            placeholder="홍길동"
            maxLength={40}
            className="tm-input"
            aria-required="true"
            readOnly
          />
        </FormField>

        <FormField
          id={birthDateFieldId}
          label="생년월일"
          required
          hint="팀원 선택 시 자동으로 조회돼요."
          errorMessage={birthDateError ?? undefined}
        >
          <input
            id={birthDateFieldId}
            type="text"
            inputMode="numeric"
            value={form.birthDate}
            placeholder="예: 1995-03-21"
            maxLength={10}
            className="tm-input"
            aria-describedby={birthDateError ? `${birthDateFieldId}-error` : undefined}
            aria-invalid={birthDateError ? true : undefined}
            style={{ fontFamily: 'var(--font-pretendard)' }}
            readOnly
          />
        </FormField>

        <FormField id={phoneFieldId} label="휴대폰 번호" required hint="팀원 선택 시 자동으로 조회돼요.">
          <input
            id={phoneFieldId}
            type="tel"
            value={form.phone}
            placeholder="01012345678"
            maxLength={20}
            className="tm-input"
            aria-required="true"
            readOnly
          />
        </FormField>

        {/* 정본 §3 "명단은 등번호와 이름". **선택 입력**이라 비워도 등록된다.
            팀 고정 등번호는 **자동으로 채우지 않고 힌트로만** 보여준다(마스터 확정 A3) —
            자동 채움은 "팀 번호 = 대회 번호" 라는 오해를 만들고, 두 번호를 분리한 A안의
            취지를 화면이 되돌린다. 같게 쓸지는 사람이 고른다. */}
        <FormField
          id={jerseyFieldId}
          label="등번호"
          hint={
            typeof memberJerseyNumber === 'number'
              ? `선택 입력이에요. 이 팀원의 팀 등번호는 ${memberJerseyNumber}번이에요.`
              : '선택 입력이에요. 0~99 사이 숫자를 쓸 수 있어요.'
          }
        >
          {/* **`type="number"` 가 아니라 `text` 다.** `type="number"` 입력에 `e`·`-`·`.` 를
              넣으면 브라우저가 그것을 `badInput` 으로 보고 **`el.value` 를 빈 문자열로**
              준다 — 화면에는 `e` 가 보이는데 코드가 받는 값은 `''` 이라, "번호 없는 선수"
              로 조용히 통과한다(2026-09-04 alpha 실측: `e` 입력 → 201, `jerseyNumber: null`).
              `1e2`·`100` 은 값이 비지 않아 걸리는데 이것만 빠져나갔다.
              `text` 로 두면 사용자가 친 글자가 그대로 오고 `parseJerseyInput` 이 판정한다 —
              같은 폼의 생년월일도 같은 이유로 `text` + `inputMode="numeric"` 이다. */}
          <input
            id={jerseyFieldId}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={form.jerseyNumber}
            onChange={(event) => patch({ jerseyNumber: event.target.value })}
            placeholder="예: 7"
            className="tm-input"
            style={{ fontFamily: 'var(--font-pretendard)' }}
          />
        </FormField>

        <FormField id={eligibilityFieldId} label="선출 여부" labelId={`${eligibilityFieldId}-label`}>
          <div role="radiogroup" aria-labelledby={`${eligibilityFieldId}-label`} style={{ display: 'flex', gap: 12 }}>
            {(['non_pro', 'pro'] as const).map((val) => {
              const selected = form.eligibilityStatus === val;
              return (
                <label
                  key={val}
                  htmlFor={`${eligibilityFieldId}-${val}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44 }}
                >
                  {/* sr-only native radio — keyboard + screen reader accessible */}
                  <input
                    id={`${eligibilityFieldId}-${val}`}
                    type="radio"
                    name={eligibilityFieldId}
                    value={val}
                    checked={selected}
                    onChange={() => patch({ eligibilityStatus: val })}
                    className="sr-only"
                  />
                  {/* Themed circular indicator — matches PaymentMethodRadio pattern */}
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--radius-circle)',
                      border: selected ? '2px solid var(--blue500)' : '1px solid var(--grey200)',
                      background: selected ? 'var(--blue500)' : 'var(--bg)',
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    {selected && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 'var(--radius-circle)',
                          background: 'var(--static-white)',
                          display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
                    {eligibilityLabel(val)}
                  </span>
                </label>
              );
            })}
          </div>
        </FormField>
      </div>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <AlertBanner message={error} />
        </div>
      ) : null}

      {/* #8: Sticky CTA bar — stays in view even when the form is taller than the viewport */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 16,
          paddingTop: 12,
          paddingBottom: 8,
          background: 'var(--surface)',
          borderTop: '1px solid var(--grey100)',
          zIndex: 10,
        }}
      >
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-primary tm-btn-block"
          style={{ minHeight: 44 }}
          disabled={!canSubmit || isSubmitting}
          onClick={() => onSubmit(formId, form)}
        >
          {isSubmitting ? '추가 중…' : '추가'}
        </button>
      </div>
      </>
      )}
    </Card>
  );
}


function FormField({
  id,
  label,
  required,
  hint,
  errorMessage,
  children,
  labelId,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Inline validation error shown below the field in red. */
  errorMessage?: string;
  children: React.ReactNode;
  /** Optional id for the label element, used when the child is a radiogroup that needs aria-labelledby. */
  labelId?: string;
}) {
  return (
    <div>
      <label
        id={labelId}
        htmlFor={id}
        className="tm-text-caption"
        style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}
      >
        {label}
        {required ? (
          <span style={{ color: 'var(--red700)', marginLeft: 2 }}>*</span>
        ) : null}
      </label>
      {children}
      {errorMessage ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="tm-text-micro"
          style={{ color: 'var(--red700)', marginTop: 4 }}
        >
          {errorMessage}
        </p>
      ) : hint ? (
        <p className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ── Player row ── */

function PlayerRow({
  player,
  onUpdate,
  onRemove,
  isUpdating,
  isRemoving,
  isLocked,
  isEditing,
  onToggleEdit,
  isPrimary,
  onUpdateJersey,
}: {
  player: V1TournamentPlayer;
  onUpdate: (playerId: string, eligibilityStatus: V1PlayerEligibilityStatus) => Promise<void>;
  onRemove: (playerId: string) => void;
  isUpdating: boolean;
  isRemoving: boolean;
  isLocked: boolean;
  /** 편집 패널 열림 여부 — 부모(TournamentRosterPageClient)가 한 번에 한 행만 열리도록
   * 관리한다(editingPlayerId). 로컬 useState 로 두면 여러 행이 동시에 편집 모드로
   * 들어갈 수 있어 "저장" 버튼이 화면에 여럿 primary 로 뜨는 상태가 가능했다. */
  isEditing: boolean;
  onToggleEdit: () => void;
  /** [primary cap] 화면당 primary CTA 1개(DESIGN.md §14) — 위쪽에 열린 "선수 추가"
   * 칸이 있거나 다른 행이 편집 중이면 이 행의 "저장"은 보조로 낮춘다. 부모가
   * `draftForms.length === 0 && editingPlayerId === player.id` 로 계산해 넘긴다. */
  isPrimary: boolean;
  /** 등번호만 고치는 경로 — 자격과 서버 엔드포인트가 다르다. */
  onUpdateJersey: (playerId: string, jerseyNumber: number | null) => Promise<unknown>;
}) {
  const [draftEligibility, setDraftEligibility] = useState<V1PlayerEligibilityStatus>(player.eligibilityStatus);
  // 문자열로 든다 — 빈 값("번호 없음")과 `0` 을 숫자로는 못 가른다.
  const [draftJersey, setDraftJersey] = useState<string>(
    player.jerseyNumber === null ? '' : String(player.jerseyNumber),
  );
  const [editError, setEditError] = useState<string | null>(null);

  // 이 행이 (다시) 열릴 때마다 최신 서버 값으로 초기화한다 — 부모가 편집 상태를
  // 컨트롤하므로 "수정" 버튼 onClick 대신 여기서 동기화한다.
  //
  // **초기화는 패널이 열리는 순간에만 한다.** 예전엔 `player.eligibilityStatus`·
  // `player.jerseyNumber` 도 의존성에 있어서, **편집 중에 서버 값이 바뀌면 그때마다 다시
  // 초기화**됐다. 이 화면은 저장 하나가 두 요청으로 갈릴 수 있어서(등번호 / 자격) 실제로
  // 이런 순서가 난다 — 등번호는 성공해 목록이 갱신되고, 자격은 실패해 `editError` 가
  // 걸린다. 그러면 갱신이 도착하는 순간 **오류 문구가 지워져** 팀장은 무엇이 실패했는지
  // 못 보고, 고치던 입력값도 함께 되돌아간다.
  // 최신 값은 ref 로 읽는다 — 의존성에 넣지 않기 위해서지, 값이 필요 없어서가 아니다.
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    if (!isEditing) return;
    const latest = playerRef.current;
    setDraftEligibility(latest.eligibilityStatus);
    setDraftJersey(latest.jerseyNumber === null ? '' : String(latest.jerseyNumber));
    setEditError(null);
  }, [isEditing]);

  // **변경 여부는 정규화한 값으로 본다.** 문자열로 비교하면 `"07"` 과 `7` 이 다르게 보여
  // 버튼이 살아나는데, 저장하면 서버로 보낼 값이 같아서 **요청은 0건인데 패널만 닫힌다** —
  // 팀장은 뭔가 저장됐다고 읽는다(Copilot 지적). 파싱에 실패한 입력(`"e"`)은 "바뀐 것" 으로
  // 봐서 버튼을 열어 둔다 — 눌러야 왜 안 되는지 오류 문구가 나온다.
  const parsedDraftJersey = parseJerseyInput(draftJersey);
  const hasChanges =
    draftEligibility !== player.eligibilityStatus ||
    !parsedDraftJersey.ok ||
    (parsedDraftJersey.value ?? null) !== player.jerseyNumber;

  async function handleSave() {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (isUpdating) return;
    setEditError(null);
    const jersey = parseJerseyInput(draftJersey);
    if (!jersey.ok) {
      setEditError('등번호는 0에서 99 사이 숫자로 입력해 주세요.');
      return;
    }
    try {
      // **바뀐 것만 보낸다.** 자격과 등번호는 축이 다르고 서버 경로도 다르다 —
      // 등번호만 고쳤는데 자격까지 보내면 어드민 판정을 덮어쓸 여지가 생긴다.
      if (draftEligibility !== player.eligibilityStatus) {
        await onUpdate(player.id, draftEligibility);
      }
      const nextJersey = jersey.value ?? null;
      if (nextJersey !== player.jerseyNumber) {
        await onUpdateJersey(player.id, nextJersey);
      }
      onToggleEdit();
    } catch (err) {
      setEditError(extractErrorMessage(err, '선수 정보를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--grey100)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          aria-hidden="true"
          // 2026-08-12: [인라인 style 우선순위 fix] 배경을 인라인으로 두면 다크모드 전용
          // 클래스 오버라이드(.tm-roster-player-initial, globals.css)가 절대 못 이겨서
          // 배지가 여전히 카드에 녹아 사라졌다 — 배경은 CSS 클래스로만 관리.
          className="tm-roster-player-initial"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-control)',
            color: 'var(--text-strong)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 'var(--font-size-body-sm)',
            fontWeight: 700,
          }}
        >
          {player.realName.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* 정본 §3 "명단 공개 = 등번호·이름". `0` 은 유효한 번호라 falsy 검사로
                거르면 0번을 단 선수의 번호가 사라진다 — `null` 인지로만 가른다. */}
            {player.jerseyNumber !== null && (
              <span
                className="tm-text-label tab-num"
                style={{ color: 'var(--text-muted)', fontWeight: 700 }}
                aria-label={`등번호 ${player.jerseyNumber}번`}
              >
                {player.jerseyNumber}
              </span>
            )}
            <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
              {player.realName}
            </span>
            <span className={`tm-badge ${eligibilityBadgeClass(player.eligibilityStatus)}`}>
              {eligibilityLabel(player.eligibilityStatus)}
            </span>
          </div>
          <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
            {formatRosterBirthDate(player.birthDateSnapshot)}
          </div>
        </div>
        {!isLocked ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ minWidth: 44, padding: '0 12px' }}
              onClick={onToggleEdit}
              disabled={isUpdating || isRemoving}
              aria-expanded={isEditing}
              aria-label={`${player.realName} 수정`}
            >
              수정
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-danger"
              style={{ minWidth: 44, padding: '0 12px' }}
              onClick={() => onRemove(player.id)}
              disabled={isRemoving || isUpdating}
              aria-label={`${player.realName} 삭제`}
            >
              삭제
            </button>
          </div>
        ) : null}
      </div>

      {isEditing && !isLocked ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
          {/* 등번호 수정. 이 경로가 없던 동안 번호를 잘못 넣으면 **선수를 지우고 다시
              넣는 수밖에** 없었고, 그 우회는 되살린 행의 자격을 `needs_review` 로 되돌린다. */}
          <FormField
            id={`player-${player.id}-jersey`}
            label="등번호"
            hint="비우면 번호 없는 선수가 돼요."
          >
            <input
              id={`player-${player.id}-jersey`}
              // `type="number"` 는 `e`·`-` 를 `badInput` 으로 보고 값을 빈 문자열로 준다 —
              // 화면엔 글자가 보이는데 코드는 "번호 없음" 으로 읽는다(추가 폼과 같은 이유).
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={draftJersey}
              onChange={(event) => setDraftJersey(event.target.value)}
              placeholder="예: 7"
              className="tm-input"
              style={{ fontFamily: 'var(--font-pretendard)' }}
            />
          </FormField>

          <FormField id={`player-${player.id}-eligibility`} label="선출 여부" labelId={`player-${player.id}-eligibility-label`}>
            <div
              role="radiogroup"
              aria-labelledby={`player-${player.id}-eligibility-label`}
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
            >
              {(['non_pro', 'pro', 'needs_review'] as const).map((val) => {
                const selected = draftEligibility === val;
                return (
                  <label
                    key={val}
                    htmlFor={`player-${player.id}-eligibility-${val}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44 }}
                  >
                    <input
                      id={`player-${player.id}-eligibility-${val}`}
                      type="radio"
                      name={`player-${player.id}-eligibility`}
                      value={val}
                      checked={selected}
                      onChange={() => setDraftEligibility(val)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 20,
                        height: 20,
                        borderRadius: 'var(--radius-circle)',
                        border: selected ? '2px solid var(--blue500)' : '1px solid var(--grey200)',
                        background: selected ? 'var(--blue500)' : 'var(--bg)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {selected ? (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 'var(--radius-circle)',
                            background: 'var(--static-white)',
                            display: 'block',
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="tm-text-caption" style={{ color: 'var(--text-strong)' }}>
                      {eligibilityLabel(val)}
                    </span>
                  </label>
                );
              })}
            </div>
          </FormField>
          {editError ? (
            <p className="tm-text-micro" role="alert" style={{ color: 'var(--red700)', margin: '8px 0 0' }}>
              {editError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ flex: 1 }}
              onClick={onToggleEdit}
              disabled={isUpdating}
            >
              취소
            </button>
            <button
              type="button"
              className={`tm-btn tm-btn-sm ${isPrimary ? 'tm-btn-primary' : 'tm-btn-outline'}`}
              style={{ flex: 1 }}
              onClick={() => void handleSave()}
              disabled={isUpdating || !hasChanges}
            >
              {isUpdating ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Main client ── */

export function TournamentRosterPageClient({
  tournamentId,
  registrationId,
}: {
  tournamentId: string;
  registrationId: string;
}) {
  const { data: tournament } = useV1Tournament(tournamentId);
  const { data: registration } = useV1Registration(tournamentId, registrationId);
  const {
    data: rosterData,
    isLoading,
    isError,
    error: rosterErr,
    refetch: refetchRoster,
  } = useV1TournamentPlayers(tournamentId, registrationId);

  const addPlayer = useV1AddPlayer(tournamentId, registrationId);
  const updatePlayer = useV1UpdatePlayer(tournamentId, registrationId);
  const updatePlayerJersey = useV1UpdatePlayerJersey(tournamentId, registrationId);
  const removePlayer = useV1RemovePlayer(tournamentId, registrationId);
  const { confirm: confirmRemove, ConfirmModal: RemoveConfirmModal } = useConfirm();

  const [draftForms, setDraftForms] = useState<DraftPlayerForm[]>([]);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // [primary cap] 한 번에 한 행만 편집 모드로 둔다 — PlayerRow가 각자 로컬 상태로
  // isEditing을 가지면 여러 행이 동시에 열려 "저장" 버튼이 화면에 여럿 primary로
  // 뜰 수 있었다(DESIGN.md §14, 화면당 primary CTA 1개).
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  function handleToggleEdit(playerId: string) {
    setEditingPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  const players = rosterData?.players ?? [];
  const belowMinimum = rosterData?.belowMinimum ?? false;
  // 종료·취소된 대회는 잠금·마감 예외와 무관하게 누구도 명단을 못 고친다 — 서버
  // assertRosterMutable의 첫 번째 검사와 같은 순서(감사 finding #1). 이 값이 아직 로딩 중이면
  // (tournament === undefined) 기존처럼 막지 않는다.
  const isTournamentRosterClosed = !isTournamentRosterMutable(tournament?.status);
  const isRosterLocked = Boolean(registration?.rosterLockedAt);
  const isRosterEditBlockedByStatus =
    registration?.status === 'cancel_requested' || registration?.status === 'cancelled';
  const rosterDeadlineAt = tournament?.rosterDeadlineAt ?? null;
  const rosterDeadlineFormatted = rosterDeadlineAt
    ? formatTournamentDateTimeLong(rosterDeadlineAt)
    : null;
  const rosterDeadlineState = getRosterDeadlineState(
    rosterDeadlineAt,
    registration?.rosterDeadlineOverrideAt,
  );
  const canEditRoster =
    Boolean(registration) &&
    !isTournamentRosterClosed &&
    !isRosterLocked &&
    !isRosterEditBlockedByStatus &&
    !rosterDeadlineState.blocked;
  const minPlayers = tournament?.minPlayers ?? 0;
  const maxPlayers = tournament?.maxPlayers ?? 999;
  const shortfall = Math.max(0, minPlayers - players.length);
  const registeredUserIds = useMemo(
    () => new Set(players.map((player) => player.userId)),
    [players],
  );
  const canAddDraftForm = canEditRoster && players.length + draftForms.length < maxPlayers;

  if (isLoading) {
    return (
              <div
          aria-busy="true"
          aria-label="명단 불러오는 중"
          style={{ padding: '0 20px', marginTop: 24 }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ height: 56, borderRadius: 'var(--radius-control)', background: 'var(--grey100)', marginBottom: 8 }}
            />
          ))}
        </div>
      );
  }

  if (isError) {
    const msg = extractErrorMessage(rosterErr, '명단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
              <div style={{ padding: '0 20px', marginTop: 40 }}>
          <ErrorState
            message={msg}
            onRetry={() => void refetchRoster()}
          />
        </div>
      );
  }

  function handleAddDraftForm() {
    if (!canAddDraftForm) return;
    setDraftForms((prev) => [...prev, createDraftPlayerForm()]);
    setAddSuccess(null);
    setRemoveError(null);
  }

  function handleRemoveDraftForm(formId: string) {
    setDraftForms((prev) => prev.filter((form) => form.id !== formId));
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  }

  function handleDraftUserChange(formId: string, userId: string) {
    setDraftForms((prev) => prev.map((form) => (form.id === formId ? { ...form, userId } : form)));
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  }

  async function handleAddPlayer(formId: string, formData: {
    userId: string;
    realName: string;
    birthDate: string;
    /** 문자열로 받는다 — 빈 값과 `0` 을 구분해야 한다. */
    jerseyNumber: string;
    eligibilityStatus: V1PlayerEligibilityStatus;
  }) {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (!canEditRoster || addPlayer.isPending) return;
    const usedByAnotherDraft = draftForms.some((form) => form.id !== formId && form.userId === formData.userId);
    if (registeredUserIds.has(formData.userId) || usedByAnotherDraft) {
      setDraftErrors((prev) => ({
        ...prev,
        [formId]: registeredUserIds.has(formData.userId)
          ? '이미 명단에 등록된 선수예요.'
          : '다른 추가 칸에서 선택한 선수예요.',
      }));
      return;
    }
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
    setAddSuccess(null);
    try {
      // 빈 문자열은 **보내지 않는다**(번호 없는 선수). `0` 은 유효한 등번호라
      // truthy 검사로 거르면 0번이 사라진다 — 빈 값인지로만 가른다.
      //
      // 그리고 **`Number()` 에 그냥 넘기지 않는다.** `type="number"` 입력은 `e`·`1e2`·`-`
      // 같은 값을 그대로 통과시키고, `Number('e')` 는 `NaN` 이며 `NaN` 은 **JSON 에서
      // `null` 로 직렬화된다** — 서버 입장에서 "번호를 안 보냄" 과 구분되지 않아 번호가
      // 조용히 사라진다. 숫자 두 자리만 값으로 인정한다.
      const jersey = parseJerseyInput(formData.jerseyNumber);
      if (!jersey.ok) {
        setDraftErrors((prev) => ({ ...prev, [formId]: '등번호는 0에서 99 사이 숫자로 입력해 주세요.' }));
        return;
      }
      await addPlayer.mutateAsync({
        userId: formData.userId,
        realName: formData.realName,
        birthDate: formData.birthDate || undefined,
        jerseyNumber: jersey.value,
        eligibilityStatus: formData.eligibilityStatus,
      });
      setDraftForms((prev) => prev.filter((form) => form.id !== formId));
      setAddSuccess('선수를 추가했어요.');
    } catch (err) {
      setDraftErrors((prev) => ({
        ...prev,
        [formId]: extractErrorMessage(err, '선수 추가에 실패했어요. 잠시 후 다시 시도해 주세요.'),
      }));
    }
  }

  async function handleRemovePlayer(playerId: string) {
    if (!canEditRoster) return;
    const player = players.find((p) => p.id === playerId);
    const nameLabel = player?.realName ? `"${player.realName}"` : '이 선수';
    // 조사는 따옴표가 아니라 이름의 받침 기준으로 고른다 ("김민준"을 / "이수아"를)
    const nameJosa = josa(player?.realName ?? '이 선수', ['을', '를']).slice((player?.realName ?? '이 선수').length);
    const ok = await confirmRemove({
      title: '선수 삭제',
      message: `${nameLabel}${nameJosa} 명단에서 삭제할까요?`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoveError(null);
    setAddSuccess(null);
    try {
      await removePlayer.mutateAsync(playerId);
    } catch (err) {
      setRemoveError(extractErrorMessage(err, '선수 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  async function handleUpdatePlayerJersey(playerId: string, jerseyNumber: number | null) {
    return updatePlayerJersey.mutateAsync({ playerId, jerseyNumber });
  }

  async function handleUpdatePlayer(playerId: string, eligibilityStatus: V1PlayerEligibilityStatus) {
    if (!canEditRoster) return;
    setRemoveError(null);
    setAddSuccess(null);
    await updatePlayer.mutateAsync({
      playerId,
      body: { eligibilityStatus },
    });
    setAddSuccess('선수 정보를 수정했어요.');
  }

  return (
    <>
      <div className="tm-tournament-roster-body" style={{ padding: '0 20px 48px', marginTop: 12 }}>

        {tournament && registration ? (
          <TournamentRosterDeadlineCard
            deadlineAt={tournament.registrationDeadlineAt}
            isTournamentRosterClosed={isTournamentRosterClosed}
            isRosterLocked={isRosterLocked}
            isRosterEditBlockedByStatus={isRosterEditBlockedByStatus}
            isRosterDeadlineBlocked={rosterDeadlineState.blocked}
          />
        ) : null}

        {/* Roster deadline info row */}
        {rosterDeadlineFormatted ? (
          <p
            className="tm-text-caption"
            style={{ color: 'var(--text-muted)', marginBottom: 12 }}
          >
            {`명단 제출 마감: ${rosterDeadlineFormatted}까지`}
          </p>
        ) : null}

        {/*
          명단 편집 가능 여부의 우선순위: 대회 상태(종료·취소) > 잠금 > 명단 제출 마감(예외 여부) —
          서버 assertRosterMutable(tournament-players.service.ts)의 검사 순서와 맞춘다. 예전에는
          세 조건을 독립 배너로 각각 렌더해, 잠긴 팀에 마감 예외를 부여하면 "계속 수정할 수
          있어요"와 "명단이 마감됐어요"가 동시에 뜨는 모순이 있었다(감사 finding #1·#52).
        */}
        {isTournamentRosterClosed ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="대회가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요."
              tone="info"
            />
          </div>
        ) : isRosterLocked && rosterDeadlineState.overridden ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="운영진이 명단 제출 마감 예외를 허용했지만 명단 자체가 잠겨 있어요. 운영진의 잠금 해제가 추가로 필요해요."
              tone="info"
            />
          </div>
        ) : isRosterLocked ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="선수 명단이 마감됐어요. 변경이 필요하면 운영진에게 문의해 주세요."
              tone="info"
            />
          </div>
        ) : rosterDeadlineState.blocked ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요."
              tone="info"
            />
          </div>
        ) : rosterDeadlineState.overridden ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요."
              tone="info"
            />
          </div>
        ) : null}

        {isRosterEditBlockedByStatus ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner
              message="취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요."
              tone="info"
            />
          </div>
        ) : null}

        {/* Below minimum warning — 잠금/상태와 무관하게 미달 사실은 계속 노출 (P0: 조건 버그 수정) */}
        {belowMinimum ? (
          <div style={{ marginBottom: 16 }}>
            {/* P1-3a: 델타(K명 더 필요해요)를 굵게 병기 — AlertBanner는 string만 받으므로 동일 스타일을 직접 구성 */}
            <div
              role="status"
              aria-live="polite"
              className="tm-text-label"
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-control)',
                background: 'var(--orange50)',
                color: 'var(--orange700)',
                lineHeight: 1.55,
              }}
            >
              {`최소 ${minPlayers}명 이상 등록해야 해요. 현재 ${players.length}명 등록됐어요.`}
              {shortfall > 0 ? <strong> → {shortfall}명 더 필요해요</strong> : null}
              {isRosterLocked || rosterDeadlineState.blocked
                ? ' (명단이 마감된 상태예요 — 운영팀에 문의해 주세요)'
                : null}
            </div>
          </div>
        ) : null}

        {/* Remove error */}
        {removeError ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner message={removeError} />
          </div>
        ) : null}

        {/* Add success feedback */}
        {addSuccess ? (
          <div style={{ marginBottom: 16 }}>
            <AlertBanner tone="info" message={addSuccess} />
          </div>
        ) : null}

        {/* Roster header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            {/* P1 숫자:단위 2:1 — 선수 수 숫자(subhead)+단위(body) */}
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
              <span
                className="tab-num"
                style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}
              >
                {players.length}
              </span>
              <span
                style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-strong)', fontWeight: 500, lineHeight: 1.2 }}
              >
                명
              </span>
              <span
                className="tm-text-caption"
                style={{ color: 'var(--text-muted)', marginLeft: 4 }}
              >
                선수 명단
              </span>
            </div>
            <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
              {`최소 ${minPlayers}명 · 최대 ${maxPlayers}명`}
            </div>
          </div>
          {canAddDraftForm ? (
            <button
              type="button"
              // [primary cap] 이미 열린 추가 칸이 있거나 어떤 행이 편집 중이면 그게 지금
              // 활성 모드다 — 헤더 버튼은 보조로 낮춘다(화면당 primary CTA 1개, DESIGN.md §14).
              className={`tm-btn tm-btn-sm ${draftForms.length > 0 || editingPlayerId !== null ? 'tm-btn-outline' : 'tm-btn-primary'}`}
              style={{ flexShrink: 0, minWidth: 64 }}
              onClick={handleAddDraftForm}
              aria-label="선수 추가하기"
            >
              + 추가
            </button>
          ) : null}
          {canEditRoster && !canAddDraftForm ? (
            <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>
              최대 인원이에요
            </span>
          ) : null}
        </div>

        {draftForms.length > 0 && canEditRoster ? (
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            {draftForms.map((draftForm) => {
              const pendingUserIds = new Set(
                draftForms
                  .filter((form) => form.id !== draftForm.id)
                  .map((form) => form.userId)
                  .filter(Boolean),
              );
              return (
                <AddPlayerForm
                  key={draftForm.id}
                  formId={draftForm.id}
                  teamId={registration?.teamId ?? ''}
                  genderCategory={tournament?.genderCategory ?? null}
                  onSubmit={handleAddPlayer}
                  onRemove={handleRemoveDraftForm}
                  onUserChange={handleDraftUserChange}
                  registeredUserIds={registeredUserIds}
                  pendingUserIds={pendingUserIds}
                  isSubmitting={addPlayer.isPending}
                  error={draftErrors[draftForm.id] ?? null}
                />
              );
            })}
          </div>
        ) : null}

        {/* Player list */}
        {players.length === 0 ? (
          <Card pad={20}>
            <EmptyState
              illustration={{ name: 'auth-welcome' }}
              title="등록된 선수가 없어요"
              sub={!canEditRoster ? '명단을 수정할 수 없는 상태예요.' : `최소 ${minPlayers}명 이상 등록해 주세요.`}
            />
          </Card>
        ) : (
          <Card pad={0}>
            <div style={{ padding: '8px 16px' }}>
              <div className="tm-text-micro tab-num" style={{ color: 'var(--text-caption)', fontWeight: 600 }}>
                총 {players.length}명 · {canEditRoster ? '수정 가능' : '수정 불가'}
              </div>
            </div>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                onUpdate={handleUpdatePlayer}
                onUpdateJersey={handleUpdatePlayerJersey}
                onRemove={handleRemovePlayer}
                // **두 mutation 을 함께 본다.** 저장 하나가 자격/등번호 두 경로로 갈리므로
                // `updatePlayer` 만 보면 **등번호 요청이 도는 동안 저장 버튼이 열려 있어**
                // 같은 요청이 두 번 나간다(Copilot 지적).
                isUpdating={updatePlayer.isPending || updatePlayerJersey.isPending}
                isRemoving={removePlayer.isPending}
                isLocked={!canEditRoster}
                isEditing={editingPlayerId === player.id}
                onToggleEdit={() => handleToggleEdit(player.id)}
                isPrimary={draftForms.length === 0 && editingPlayerId === player.id}
              />
            ))}
          </Card>
        )}

        {/* Back to my registration */}
        <div style={{ marginTop: 20 }}>
          <Link
            href={`/tournaments/${tournamentId}/my`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
          >
            내 신청으로 돌아가기
          </Link>
        </div>
      </div>

      {/* 선수 삭제 confirm modal */}
      {RemoveConfirmModal}
    </>
  );
}
