'use client';

import { useState, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import {
  useV1TournamentPlayers,
  useV1Tournament,
  useV1Registration,
  useV1AddPlayer,
  useV1UpdatePlayer,
  useV1RemovePlayer,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { josa } from '@/lib/korean';
import { v1Keys } from '@/lib/query-keys';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import type { V1TournamentPlayer, V1PlayerEligibilityStatus, V1TeamMembersPage } from '@/types/api';

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
  isRosterLocked,
  isRosterEditBlockedByStatus,
  isRosterDeadlineBlocked,
  nowMs,
}: {
  deadlineAt: string | null;
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
  const canEditRoster = !isRosterLocked && !isRosterEditBlockedByStatus && !isRosterDeadlineBlocked;
  const rosterEditBadge = isRosterLocked
    ? '명단 마감'
    : isRosterEditBlockedByStatus
      ? '수정 불가'
      : isRosterDeadlineBlocked
        ? '제출 마감'
        : '수정 가능';
  const rosterEditMessage = isRosterLocked
    ? '선수 명단이 운영진에 의해 마감됐어요.'
    : isRosterEditBlockedByStatus
      ? '취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요.'
      : isRosterDeadlineBlocked
        ? '선수 명단 제출 기간이 종료됐어요.'
        : '대회 신청 마감과 별개로, 운영진이 명단을 잠그기 전까지 수정할 수 있어요.';

  return (
    <Card pad={16} style={{ marginBottom: 14 }}>
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

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span className={'tm-text-caption'} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            선수 명단
          </span>
          <span className={`tm-badge ${canEditRoster ? 'tm-badge-green' : 'tm-badge-grey'}`}>
            {rosterEditBadge}
          </span>
        </div>
        <div className={'tm-text-micro'} style={{ color: 'var(--text-caption)', lineHeight: 1.5, marginTop: 6 }}>
          {rosterEditMessage}
        </div>
      </div>
    </Card>
  );
}

/* ── Add player form ── */

type AddPlayerFormState = {
  userId: string;
  realName: string;
  birthDate: string;
  phone: string;
  eligibilityStatus: V1PlayerEligibilityStatus;
};

const EMPTY_FORM: AddPlayerFormState = {
  userId: '',
  realName: '',
  birthDate: '',
  phone: '',
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
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function isRegisterableMember(member: { realName?: unknown; birthDate?: unknown; phone?: unknown }) {
  return Boolean(
    normalizeProfileText(member.realName) &&
    normalizeBirthDateForInput(member.birthDate) &&
    normalizeProfileText(member.phone),
  );
}

function isRegisterableForm(form: AddPlayerFormState) {
  return Boolean(form.realName.trim() && form.birthDate.trim() && form.phone.trim());
}

function memberMissingReason(member: { realName?: unknown; birthDate?: unknown; phone?: unknown }): string {
  const missing = [
    !normalizeProfileText(member.realName) ? '실명' : null,
    !normalizeBirthDateForInput(member.birthDate) ? '생년월일' : null,
    !normalizeProfileText(member.phone) ? '휴대폰 번호' : null,
  ].filter(Boolean);
  return `${missing.join(', ')} 미입력`;
}

function AddPlayerForm({
  formId,
  teamId,
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
    () => members.filter((member) => !isRegisterableMember(member)),
    [members],
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
  const canSubmit =
    form.userId.trim().length > 0 &&
    isRegisterableForm(form) &&
    birthDateValid &&
    !selectedAlreadyRegistered &&
    !selectedAlreadyPending;
  const selectedMemberMissing = form.userId && !isRegisterableForm(form);
  const memberFieldId = `${formId}-member`;
  const realNameFieldId = `${formId}-realname`;
  const birthDateFieldId = `${formId}-birthdate`;
  const phoneFieldId = `${formId}-phone`;
  const eligibilityFieldId = `${formId}-eligibility`;

  /* #7a: Neutral solid card — no blue tint. Blue reserved for focus/active states only. */
  return (
    <Card pad={16} style={{ border: '1px solid var(--grey200)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
          선수 추가
        </div>
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-neutral"
          style={{ minWidth: 44, padding: '0 10px' }}
          onClick={() => onRemove(formId)}
          disabled={isSubmitting}
          aria-label="선수 추가 칸 삭제"
        >
          X
        </button>
      </div>

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
              style={{ color: 'var(--red500)', display: 'flex', alignItems: 'center', minHeight: 44 }}
            >
              팀원 목록을 불러오지 못했어요.
            </div>
          ) : members.length === 0 ? (
            <div
              className="tm-input"
              style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', minHeight: 44 }}
            >
              팀원이 없어요.
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
                  프로필(생년월일·휴대폰)이 완성된 팀원만 명단에 올릴 수 있어요. 팀원에게 프로필 완성을 요청해 주세요.
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
                  const registerable = isRegisterableMember(m);
                  const alreadyRegistered = registeredUserIds.has(m.userId);
                  const alreadyPending = pendingUserIds.has(m.userId);
                  const disabled = !registerable || alreadyRegistered || alreadyPending;
                  const suffix = alreadyRegistered
                    ? ' - 이미 등록됨'
                    : alreadyPending
                      ? ' - 추가 대기 중'
                      : registerable
                        ? ''
                        : ` - ${memberMissingReason(m)}`;
                  return (
                    <option key={m.userId} value={m.userId} disabled={disabled}>
                      {m.displayName} ({memberRoleLabel(m.role)})
                      {suffix}
                    </option>
                  );
                })}
              </select>
              {selectedMemberMissing ? (
                <p className="tm-text-micro" role="alert" style={{ color: 'var(--red500)', margin: '6px 0 0' }}>
                  실명, 생년월일, 휴대폰 번호가 모두 등록된 팀원만 선수로 등록할 수 있어요.
                </p>
              ) : null}
              {selectedAlreadyRegistered || selectedAlreadyPending ? (
                <p className="tm-text-micro" role="alert" style={{ color: 'var(--red500)', margin: '6px 0 0' }}>
                  {selectedAlreadyRegistered ? '이미 명단에 등록된 선수예요.' : '다른 추가 칸에서 선택한 선수예요.'}
                </p>
              ) : null}
              {unavailableMembers.length > 0 ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {unavailableMembers.map((m) => (
                    <div key={m.userId} className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>
                      {josa(m.displayName, ['은', '는'])} {josa(memberMissingReason(m), ['으로', '로'])} 표시돼요. 제출하면 서버가 최신 프로필 기준으로 다시 확인해요.
                    </div>
                  ))}
                </div>
              ) : null}
              {hasNextPage ? (
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ marginTop: 6, width: '100%', minHeight: 44 }}
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

        <FormField id={eligibilityFieldId} label="선출 여부" labelId={`${eligibilityFieldId}-label`}>
          <div role="radiogroup" aria-labelledby={`${eligibilityFieldId}-label`} style={{ display: 'flex', gap: 10 }}>
            {(['non_pro', 'pro'] as const).map((val) => {
              const selected = form.eligibilityStatus === val;
              return (
                <label
                  key={val}
                  htmlFor={`${eligibilityFieldId}-${val}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 44 }}
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
                      borderRadius: '50%',
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
                          borderRadius: '50%',
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
          paddingTop: 10,
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
        style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}
      >
        {label}
        {required ? (
          <span style={{ color: 'var(--red500)', marginLeft: 2 }}>*</span>
        ) : null}
      </label>
      {children}
      {errorMessage ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="tm-text-micro"
          style={{ color: 'var(--red500)', marginTop: 4 }}
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
}: {
  player: V1TournamentPlayer;
  onUpdate: (playerId: string, eligibilityStatus: V1PlayerEligibilityStatus) => Promise<void>;
  onRemove: (playerId: string) => void;
  isUpdating: boolean;
  isRemoving: boolean;
  isLocked: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftEligibility, setDraftEligibility] = useState<V1PlayerEligibilityStatus>(player.eligibilityStatus);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSave() {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (isUpdating) return;
    setEditError(null);
    try {
      await onUpdate(player.id, draftEligibility);
      setIsEditing(false);
    } catch (err) {
      setEditError(extractErrorMessage(err, '선수 정보를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--grey100)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 12,
            background: 'var(--grey100)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ minWidth: 44, padding: '0 10px' }}
              onClick={() => {
                setDraftEligibility(player.eligibilityStatus);
                setEditError(null);
                setIsEditing((prev) => !prev);
              }}
              disabled={isUpdating || isRemoving}
              aria-expanded={isEditing}
              aria-label={`${player.realName} 수정`}
            >
              수정
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-danger"
              style={{ minWidth: 44, padding: '0 10px' }}
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
          <FormField id={`player-${player.id}-eligibility`} label="선출 여부" labelId={`player-${player.id}-eligibility-label`}>
            <div
              role="radiogroup"
              aria-labelledby={`player-${player.id}-eligibility-label`}
              style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
            >
              {(['non_pro', 'pro', 'needs_review'] as const).map((val) => {
                const selected = draftEligibility === val;
                return (
                  <label
                    key={val}
                    htmlFor={`player-${player.id}-eligibility-${val}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 36 }}
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
                        borderRadius: '50%',
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
                            borderRadius: '50%',
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
            <p className="tm-text-micro" role="alert" style={{ color: 'var(--red500)', margin: '8px 0 0' }}>
              {editError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ flex: 1, minHeight: 40 }}
              onClick={() => {
                setDraftEligibility(player.eligibilityStatus);
                setEditError(null);
                setIsEditing(false);
              }}
              disabled={isUpdating}
            >
              취소
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-primary"
              style={{ flex: 1, minHeight: 40 }}
              onClick={() => void handleSave()}
              disabled={isUpdating || draftEligibility === player.eligibilityStatus}
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
  const removePlayer = useV1RemovePlayer(tournamentId, registrationId);
  const { confirm: confirmRemove, ConfirmModal: RemoveConfirmModal } = useConfirm();

  const [draftForms, setDraftForms] = useState<DraftPlayerForm[]>([]);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const players = rosterData?.players ?? [];
  const belowMinimum = rosterData?.belowMinimum ?? false;
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

  const backHref = `/tournaments/${tournamentId}/my`;

  if (isLoading) {
    return (
      <AppChrome title="선수 명단" backHref={backHref} bottomNav={false}>
        <div
          aria-busy="true"
          aria-label="명단 불러오는 중"
          style={{ padding: '0 20px', marginTop: 24 }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ height: 56, borderRadius: 12, background: 'var(--grey100)', marginBottom: 8 }}
            />
          ))}
        </div>
      </AppChrome>
    );
  }

  if (isError) {
    const msg = extractErrorMessage(rosterErr, '명단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="선수 명단" backHref={backHref} bottomNav={false}>
        <div style={{ padding: '0 20px', marginTop: 40 }}>
          <ErrorState
            message={msg}
            onRetry={() => void refetchRoster()}
          />
        </div>
      </AppChrome>
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
      await addPlayer.mutateAsync({
        userId: formData.userId,
        realName: formData.realName,
        birthDate: formData.birthDate || undefined,
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
    <AppChrome title="선수 명단" backHref={backHref} bottomNav={false} activeTab="tournaments">
      <div className="tm-tournament-roster-body" style={{ padding: '0 20px 48px', marginTop: 12 }}>

        {tournament && registration ? (
          <TournamentRosterDeadlineCard
            deadlineAt={tournament.registrationDeadlineAt}
            isRosterLocked={isRosterLocked}
            isRosterEditBlockedByStatus={isRosterEditBlockedByStatus}
            isRosterDeadlineBlocked={rosterDeadlineState.blocked}
          />
        ) : null}

        {/* Roster deadline info row */}
        {rosterDeadlineFormatted ? (
          <p
            className="tm-text-caption"
            style={{ color: 'var(--text-muted)', marginBottom: 10 }}
          >
            {`명단 제출 마감: ${rosterDeadlineFormatted}까지`}
          </p>
        ) : null}

        {/* Roster deadline passed banner (blocks edit unless admin granted an override) */}
        {rosterDeadlineState.blocked ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message="명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요."
              tone="info"
            />
          </div>
        ) : null}

        {/* Deadline passed but admin granted an override — editing stays open */}
        {rosterDeadlineState.overridden ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message="운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요."
              tone="info"
            />
          </div>
        ) : null}

        {/* Locked banner */}
        {isRosterLocked ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message="선수 명단이 마감됐어요. 변경이 필요하면 운영진에게 문의해 주세요."
              tone="info"
            />
          </div>
        ) : null}

        {isRosterEditBlockedByStatus ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message="취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요."
              tone="info"
            />
          </div>
        ) : null}

        {/* Below minimum warning — 잠금/상태와 무관하게 미달 사실은 계속 노출 (P0: 조건 버그 수정) */}
        {belowMinimum ? (
          <div style={{ marginBottom: 14 }}>
            {/* P1-3a: 델타(K명 더 필요해요)를 굵게 병기 — AlertBanner는 string만 받으므로 동일 스타일을 직접 구성 */}
            <div
              role="status"
              aria-live="polite"
              className="tm-text-label"
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--orange50)',
                color: 'var(--orange500)',
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
          <div style={{ marginBottom: 14 }}>
            <AlertBanner message={removeError} />
          </div>
        ) : null}

        {/* Add success feedback */}
        {addSuccess ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner tone="info" message={addSuccess} />
          </div>
        ) : null}

        {/* Roster header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
              className="tm-btn tm-btn-sm tm-btn-primary"
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
          <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
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
              title="등록된 선수가 없어요"
              sub={!canEditRoster ? '명단을 수정할 수 없는 상태예요.' : `최소 ${minPlayers}명 이상 등록해 주세요.`}
            />
          </Card>
        ) : (
          <Card pad={0}>
            <div style={{ padding: '8px 14px' }}>
              <div className="tm-text-micro tab-num" style={{ color: 'var(--text-caption)', fontWeight: 600 }}>
                총 {players.length}명 · {canEditRoster ? '수정 가능' : '수정 불가'}
              </div>
            </div>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                onUpdate={handleUpdatePlayer}
                onRemove={handleRemovePlayer}
                isUpdating={updatePlayer.isPending}
                isRemoving={removePlayer.isPending}
                isLocked={!canEditRoster}
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
    </AppChrome>
  );
}
