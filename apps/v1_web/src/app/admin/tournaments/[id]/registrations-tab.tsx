'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, Download, Lock, Unlock, Check, X, Users, User, Clock, AlertCircle, Undo2, Timer, TimerOff } from 'lucide-react';
import { useV1AdminTournamentRegistrations, useV1ConfirmPayment, useV1ConfirmRegistration, useV1CancelRegistrationAdmin, useV1RejectCancelRequest, useV1RosterLock, useV1RosterUnlock, useV1RosterDeadlineOverrideGrant, useV1RosterDeadlineOverrideRevoke, useV1ExportRosterCsv, useV1AdminTournamentPlayers, useV1UpdatePlayerEligibility, useV1AdminAddPlayer, useV1AdminRemovePlayer, useV1AdminRosterEligibleMembers } from '@/hooks/use-v1-api';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { AdminCardList, AdminEmpty } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { formatDate } from './tournament-admin-shared';
import {
  ADMIN_CANCELLABLE,
  ActionButton,
  ELIGIBILITY_LABEL,
  GENDER_LABEL,
  PHONE_LABEL,
  REGISTRATION_STATUS_FILTERS,
  SimpleModal,
  formatGenderQuotaError,
  formatPhoneNumber,
  formatRegistrationPaymentSubtitle,
  submitBtnCls,
} from './tournament-detail-shared';


// ── Registration roster modal ─────────────────────────────────────────────

export function RosterModal({
  open,
  onClose,
  registration,
  showToast,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  registration: V1AdminTournamentRegistration | null;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  canWrite: boolean;
}) {
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentPlayers(
    registration?.id ?? '',
  );
  const updateEligibility = useV1UpdatePlayerEligibility(registration?.id ?? '');
  const addPlayer = useV1AdminAddPlayer(registration?.id ?? '');
  const removePlayer = useV1AdminRemovePlayer(registration?.id ?? '');

  // 팀의 활성 멤버를 불러와 고르게 한다. 예전에는 userId 를 직접 입력받았는데, 운영자가
  // UUID 를 얻을 경로가 화면에 없어 사실상 쓸 수 없었다(2026-08-04 alpha UI 검수).
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const eligible = useV1AdminRosterEligibleMembers(registration?.id ?? '', open && canWrite);
  const members = eligible.data?.members ?? [];
  // 멤버는 있는데 전원 자격 미달인 경우(정원 초과·취소된 신청 등)를 "멤버 0명" 과 구분한다.
  const hasEligibleMember = members.some((m) => m.eligible);
  const selectedMember = members.find((m) => m.userId === selectedUserId) ?? null;
  // 버튼은 "무언가 골랐는지" 가 아니라 "그게 지금도 추가 가능한지" 를 봐야 한다. 목록이
  // 갱신되는 사이(다른 운영자가 먼저 추가, 팀 탈퇴 등) 고른 사람이 자격을 잃을 수 있다.
  const canAddSelectedMember = !!selectedMember?.eligible && !!selectedMember.realName?.trim();

  // 다른 신청으로 모달을 다시 열면 앞선 선택이 남는다 — RosterModal 은 항상 마운트돼 있고
  // 숨겨질 뿐이라 useState 가 초기화되지 않는다. 같은 사람이 두 팀에 속하면 이전 팀에서
  // 고른 userId 가 새 팀에서도 유효한 선택으로 보인다.
  useEffect(() => {
    setSelectedUserId('');
    setAddError(null);
  }, [registration?.id, open]);

  // 고른 팀원이 목록에서 사라지거나 자격을 잃으면 선택을 비운다 — select 는 없는 값을 못
  // 그려 빈칸이 되는데, 상태만 남아 있으면 화면과 어긋난다.
  useEffect(() => {
    if (!selectedUserId || !eligible.data) return;
    const still = eligible.data.members.find((m) => m.userId === selectedUserId);
    if (!still || !still.eligible) setSelectedUserId('');
  }, [eligible.data, selectedUserId]);

  const players = [...(data?.players ?? [])].sort(
    (left, right) => Number(right.isTeamCaptain) - Number(left.isTeamCaptain),
  );

  const handleAddPlayer = () => {
    if (!selectedMember) {
      setAddError('추가할 팀원을 선택해주세요.');
      return;
    }
    // 버튼이 열려 있어도 마지막에 한 번 더 본다 — 목록 갱신과 클릭이 겹치면 버튼 상태가
    // 한 박자 늦을 수 있다.
    if (!selectedMember.eligible) {
      setAddError(selectedMember.ineligibleReason ?? '지금은 추가할 수 없는 팀원이에요.');
      return;
    }
    // 실명은 서버가 팀원 프로필에서 다시 읽지만, DTO 가 필수로 받으므로 함께 보낸다.
    const realName = selectedMember.realName?.trim();
    if (!realName) {
      setAddError('실명이 등록되지 않은 팀원이에요.');
      return;
    }
    setAddError(null);
    addPlayer.mutate(
      { userId: selectedMember.userId, realName },
      {
        onSuccess: () => {
          setSelectedUserId('');
          showToast('선수를 명단에 추가했어요.', 'success');
        },
        onError: (err) => setAddError(extractErrorMessage(err, '선수를 추가하지 못했어요.')),
      },
    );
  };

  const handleRemovePlayer = (playerId: string, realName: string) => {
    removePlayer.mutate(playerId, {
      onSuccess: () => showToast(`${realName} 선수를 명단에서 제외했어요.`, 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '선수를 제외하지 못했어요.'), 'error'),
    });
  };

  const handleEligibilityChange = (playerId: string, status: string) => {
    updateEligibility.mutate(
      { playerId, eligibilityStatus: status as 'non_pro' | 'pro' | 'needs_review' },
      {
        onSuccess: () => showToast('자격 상태를 변경했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '자격 상태를 변경하지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <SimpleModal
      open={open}
      title={`명단 검토 — ${registration?.teamName ?? registration?.teamId ?? ''}`}
      onClose={onClose}
    >
      {isPending ? (
        <p className="text-sm text-[var(--text-muted)]">불러오는 중…</p>
      ) : isError ? (
        <div role="alert" className="rounded-xl bg-[var(--red50)] p-4 text-sm text-[var(--red700)]">
          <p>{extractErrorMessage(error, '명단을 불러오지 못했어요.')}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-[44px] rounded-lg bg-[var(--card-surface)] px-4 font-semibold text-[var(--red700)]"
          >
            다시 시도
          </button>
        </div>
      ) : players.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">등록된 선수가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto" role="list">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)]">{p.realName}</p>
                  {p.isTeamCaptain ? (
                    <span className="shrink-0 rounded-md bg-[var(--blue50)] px-1.5 py-0.5 text-[var(--font-size-caption)] font-semibold text-[var(--blue700)]">팀장</span>
                  ) : null}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {p.birthDateSnapshot ?? '생년월일 미등록'} ·{' '}
                  {p.genderSnapshot ? GENDER_LABEL[p.genderSnapshot] : '성별 미등록'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {PHONE_LABEL} {formatPhoneNumber(p.phone)}
                </p>
              </div>
              <select
                value={p.eligibilityStatus}
                onChange={(e) => handleEligibilityChange(p.id, e.target.value)}
                disabled={!canWrite || updateEligibility.isPending}
                aria-label={`${p.realName} 자격 상태`}
                className="h-[44px] px-3 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              >
                {(Object.entries(ELIGIBILITY_LABEL) as [string, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleRemovePlayer(p.id, p.realName)}
                disabled={!canWrite || removePlayer.isPending}
                aria-label={`${p.realName} 선수를 명단에서 제외`}
                className="h-[44px] shrink-0 rounded-xl border border-[var(--border)] px-3 text-[13px] font-semibold text-[var(--red700)] transition-colors hover:bg-[var(--red50)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-950/30"
              >
                제외
              </button>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] p-3 dark:border-gray-700">
          <p className="text-[13px] font-semibold text-[var(--text-strong)] dark:text-white">선수 추가</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            팀의 활성 멤버만 추가할 수 있어요. 명단 잠금과 제출 마감은 운영자 권한으로 넘어갑니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="admin-roster-member" className="sr-only">
                추가할 팀원
              </label>
              <select
                id="admin-roster-member"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setAddError(null);
                }}
                disabled={eligible.isPending || members.length === 0}
                className="h-[44px] w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text-strong)] transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">
                  {/* 조회 실패를 "멤버 없음" 으로 말하지 않는다 — 목록이 비어 있는 이유가
                      다르면 운영자가 팀 구성을 의심하며 엉뚱한 데를 찾게 된다. */}
                  {eligible.isPending
                    ? '팀원 불러오는 중…'
                    : eligible.isError
                      ? '팀원 목록을 불러오지 못했어요'
                      : members.length === 0
                        ? '팀에 활성 멤버가 없어요'
                        : hasEligibleMember
                          ? '팀원 선택'
                          : '추가할 수 있는 팀원이 없어요'}
                </option>
                {members.map((m) => (
                  // 못 고르는 팀원도 이유와 함께 보여 준다 — 목록에서 지워 버리면 운영자가
                  // "왜 이 사람이 없지?" 를 화면 밖에서 찾아야 한다.
                  <option key={m.userId} value={m.userId} disabled={!m.eligible}>
                    {(m.realName ?? m.nickname ?? m.userId.slice(0, 8))}
                    {m.role === 'owner' ? ' (팀장)' : m.role === 'manager' ? ' (매니저)' : ''}
                    {m.eligible ? '' : ` — ${m.ineligibleReason}`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddPlayer}
              // isError 도 막는다 — 재조회가 실패하면 React Query 는 직전 데이터를 그대로
              // 들고 있어서, 아래에 에러가 떠 있는데도 옛 판정으로 추가가 가능해진다.
              disabled={
                addPlayer.isPending ||
                eligible.isFetching ||
                eligible.isError ||
                !canAddSelectedMember
              }
              className="h-[44px] shrink-0 rounded-xl bg-blue-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              {addPlayer.isPending ? '추가 중…' : '추가'}
            </button>
          </div>
          {eligible.isError ? (
            <p role="alert" className="mt-2 text-xs text-[var(--red700)]">
              {extractErrorMessage(eligible.error, '팀원 목록을 불러오지 못했어요.')}
            </p>
          ) : null}
          {addError ? (
            <p role="alert" className="mt-2 text-xs text-[var(--red700)]">
              {addError}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        닫기
      </button>
    </SimpleModal>
  );
}

// ── Export CSV button (one hook instance per row) ─────────────────────────

function ExportCsvButton({
  registrationId,
  showToast,
}: {
  registrationId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const exportCsv = useV1ExportRosterCsv(registrationId);

  const handleClick = () => {
    exportCsv.mutate(undefined, {
      onSuccess: (res) => {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || `roster_${registrationId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('CSV를 다운로드했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, 'CSV 다운로드에 실패했어요.'), 'error'),
    });
  };

  return (
    <ActionButton
      onClick={handleClick}
      disabled={exportCsv.isPending}
      icon={<Download size={13} />}
      label={exportCsv.isPending ? '…' : 'CSV'}
      tone="gray"
    />
  );
}

// ── Tab: Registrations ────────────────────────────────────────────────────

// exported for component-level testing (roster deadline override toggle) — see
// tournament-detail-registrations-tab.test.tsx
export function RegistrationsTab({
  tournamentId,
  showToast,
  tournamentTeamCount,
  canWrite,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  /** 정원(팀 수) — 참가 확정 시 정원 초과 경고에 사용. 로딩 중이면 undefined */
  tournamentTeamCount?: number;
  canWrite: boolean;
}) {
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentRegistrations(tournamentId);
  const confirmPayment = useV1ConfirmPayment();
  const confirmRegistration = useV1ConfirmRegistration();
  const cancelRegistration = useV1CancelRegistrationAdmin();
  const rejectCancelRequest = useV1RejectCancelRequest();
  const rosterLock = useV1RosterLock();
  const rosterUnlock = useV1RosterUnlock();
  const rosterDeadlineOverrideGrant = useV1RosterDeadlineOverrideGrant();
  const rosterDeadlineOverrideRevoke = useV1RosterDeadlineOverrideRevoke();
  const [rosterRegistration, setRosterRegistration] = useState<V1AdminTournamentRegistration | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const { confirm: confirmDialog, ConfirmModal } = useConfirm();

  // P1-2: 상태 필터
  const [statusFilter, setStatusFilter] = useState('all');
  // P2-7: 일괄 입금 확인 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const registrations = data?.items ?? [];
  const filteredRegistrations =
    statusFilter === 'all' ? registrations : registrations.filter((r) => r.status === statusFilter);
  const statusCounts: Record<string, number> = { all: registrations.length };
  for (const r of registrations) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }
  // 처리 대기 = 입금 확인 중(payment_checking) + 취소 요청(cancel_requested)
  const pendingReviewCount = (statusCounts.payment_checking ?? 0) + (statusCounts.cancel_requested ?? 0);

  const handleConfirmPayment = (reg: V1AdminTournamentRegistration) => {
    confirmPayment.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('입금을 확인했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '입금 확인에 실패했어요.'), 'error'),
      },
    );
  };

  const handleConfirm = (reg: V1AdminTournamentRegistration, decision: 'confirm' | 'waitlist') => {
    confirmRegistration.mutate(
      { registrationId: reg.id, decision },
      {
        onSuccess: (res) => {
          if (res.alreadyProcessed) {
            showToast('이미 처리된 신청이에요.', 'success');
          } else {
            showToast(decision === 'confirm' ? '확정했어요.' : '대기로 설정했어요.', 'success');
          }
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '처리에 실패했어요.'), 'error'),
      },
    );
  };

  // P1-1: 참가 확정은 정원 정보를 포함한 확인 모달을 경유한다
  const handleConfirmClick = async (reg: V1AdminTournamentRegistration) => {
    const confirmedCount = registrations.filter((r) => r.status === 'confirmed').length;
    const nextCount = confirmedCount + 1;
    const capacityLine =
      tournamentTeamCount != null
        ? `현재 ${confirmedCount}/${tournamentTeamCount}팀 확정 — 이 팀을 확정하면 ${nextCount}/${tournamentTeamCount}팀이 돼요.`
        : `현재 ${confirmedCount}팀이 확정됐어요.`;
    const overCapacity = tournamentTeamCount != null && nextCount > tournamentTeamCount;
    const message = overCapacity
      ? `${capacityLine} 정원을 초과해요 — 대기 명단(waitlist) 처리될 수 있어요.`
      : capacityLine;
    const ok = await confirmDialog({
      title: '참가 확정',
      message,
      confirmLabel: '확정',
      tone: overCapacity ? 'danger' : 'default',
    });
    if (!ok) return;
    handleConfirm(reg, 'confirm');
  };

  const handleCancel = async (reg: V1AdminTournamentRegistration) => {
    const teamLabel = reg.teamName ? `"${reg.teamName}"` : '이 팀';
    const reasonSuffix =
      reg.status === 'cancel_requested' && reg.cancelReason
        ? ` 팀이 남긴 취소 사유: "${reg.cancelReason}"`
        : '';
    const ok = await confirmDialog({
      title: '신청 취소',
      message: `${teamLabel}의 신청을 취소할까요? 이 작업은 되돌릴 수 없어요.${reasonSuffix}`,
      confirmLabel: '취소 처리',
      tone: 'danger',
    });
    if (!ok) return;
    cancelRegistration.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('취소했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '취소에 실패했어요.'), 'error'),
      },
    );
  };

  // P1-6: 취소 요청 거부(잔류)
  const handleRejectCancel = async (reg: V1AdminTournamentRegistration) => {
    const ok = await confirmDialog({
      title: '취소 요청 거부',
      message: '취소 요청을 거부하고 이전 상태로 되돌릴까요? 팀이 남긴 취소 사유는 기록에 남아요.',
      confirmLabel: '거부하고 되돌리기',
    });
    if (!ok) return;
    rejectCancelRequest.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('취소 요청을 거부했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '취소 요청 거부에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRosterLock = (reg: V1AdminTournamentRegistration) => {
    rosterLock.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('명단을 잠갔어요.', 'success'),
        onError: (err) => {
          if (err instanceof V1ApiError && err.code === 'TOURNAMENT_GENDER_QUOTA_NOT_MET') {
            showToast(
              formatGenderQuotaError(err.details) ??
                extractErrorMessage(err, '명단 잠금에 실패했어요.'),
              'error',
            );
            return;
          }
          showToast(extractErrorMessage(err, '명단 잠금에 실패했어요.'), 'error');
        },
      },
    );
  };

  const handleRosterUnlock = (reg: V1AdminTournamentRegistration) => {
    rosterUnlock.mutate(
      reg.id,
      {
        onSuccess: () => showToast('명단 잠금을 해제했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '명단 잠금 해제에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRosterDeadlineOverrideGrant = (reg: V1AdminTournamentRegistration) => {
    rosterDeadlineOverrideGrant.mutate(
      reg.id,
      {
        onSuccess: () => showToast('명단 제출 마감 예외를 허용했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '마감 예외 허용에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRosterDeadlineOverrideRevoke = (reg: V1AdminTournamentRegistration) => {
    rosterDeadlineOverrideRevoke.mutate(
      reg.id,
      {
        onSuccess: () => showToast('예외를 해제했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '예외 해제에 실패했어요.'), 'error'),
      },
    );
  };

  // P2-7: payment_checking으로 넘어가기 전(awaiting_payment) 신청만 일괄 입금 확인 대상 —
  // confirmPayment 훅의 BE 가드가 status=awaiting_payment만 허용한다.
  const toggleSelected = (registrationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return next;
    });
  };

  const handleBatchConfirmPayment = async () => {
    const targets = registrations.filter((r) => selectedIds.has(r.id) && r.status === 'awaiting_payment');
    if (targets.length === 0) return;
    const ok = await confirmDialog({
      title: '일괄 입금 확인',
      message: `선택한 ${targets.length}건을 입금 확인 처리할까요?`,
      confirmLabel: '입금 확인',
    });
    if (!ok) return;
    setIsBatchProcessing(true);
    let successCount = 0;
    try {
      for (const reg of targets) {
        try {
          await confirmPayment.mutateAsync({ registrationId: reg.id });
          successCount += 1;
        } catch (err) {
          const teamLabel = reg.teamName ?? reg.teamId;
          showToast(extractErrorMessage(err, `${teamLabel} 입금 확인에 실패했어요.`), 'error');
        }
      }
    } finally {
      setIsBatchProcessing(false);
      setSelectedIds(new Set());
    }
    if (successCount > 0) {
      showToast(`${successCount}건 입금 확인 완료`, 'success');
    }
  };

  return (
    <>
      {/* P1-2: 상태 필터 칩 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3" role="group" aria-label="신청 상태 필터">
        {REGISTRATION_STATUS_FILTERS.map((opt) => {
          const active = statusFilter === opt.value;
          const count = statusCounts[opt.value] ?? 0;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              aria-pressed={active}
              className={[
                'inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-[13px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                active
                  ? 'bg-blue-500 text-white'
                  : 'bg-[var(--card-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:border-blue-300 hover:text-[var(--blue700)]',
              ].join(' ')}
            >
              {opt.label}
              {opt.value !== 'all' && count > 0 && (
                <span
                  className={[
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[var(--font-size-caption)] font-semibold tabular-nums',
                    // active 상태의 카운트 배지는 파란 칩(bg-blue-500, 테마 불변) 위에 얹히는
                    // 반투명 흰 원이라 --static-white 를 써야 한다 — --card-surface 는 다크에서
                    // 거의 검정이라 파란 칩 위에서 탁하게 죽는 회귀가 있었다(전수검수 발견).
                    active ? 'bg-[var(--static-white)]/25 text-white' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* P1-2: 처리 대기 주의 배너 */}
      {pendingReviewCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--tint-orange)] border border-[var(--tint-orange-border)] px-4 py-2.5 text-[13px] text-[var(--orange700)]">
          <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
          <span>처리 대기 중인 신청이 {pendingReviewCount}건 있어요.</span>
        </div>
      )}

      {/* P2-7: 일괄 처리 바 */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--blue50)] border border-blue-100 px-4 py-2.5">
          <span className="text-[13px] text-[var(--blue700)]">{selectedIds.size}건 선택됨</span>
          <button
            type="button"
            onClick={() => void handleBatchConfirmPayment()}
            disabled={isBatchProcessing}
            className={submitBtnCls}
          >
            <Check size={14} aria-hidden="true" />
            선택 {selectedIds.size}건 입금 확인
          </button>
        </div>
      )}

      {/* f8: AdminCardList — registrations as card grid */}
      <AdminCardList<V1AdminTournamentRegistration>
        rows={filteredRegistrations}
        keyExtractor={(r) => r.id}
        actionLayout="compact"
        card={(r) => ({
          title: (
            <span className="inline-flex items-center gap-2 min-w-0">
              <label
                className={[
                  // 시각 크기는 체크박스(18px)만 차지하되 히트 영역은 padding + 상쇄 margin으로 36px+ 확보
                  'inline-flex items-center justify-center p-2.5 -m-2.5 shrink-0 rounded',
                  r.status === 'awaiting_payment' ? 'cursor-pointer' : 'invisible pointer-events-none',
                ].join(' ')}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelected(r.id)}
                  disabled={r.status !== 'awaiting_payment'}
                  aria-label={`${r.teamName ?? r.teamId} 일괄 선택`}
                  className="w-[18px] h-[18px] rounded border-[var(--border)] text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              <span className="truncate">{r.teamName ?? r.teamId}</span>
            </span>
          ),
          subtitle: formatRegistrationPaymentSubtitle(r.payment),
          status: r.status,
          meta: [
            {
              icon: <Users size={14} aria-hidden="true" />,
              label: r.playerCount > 0 ? `${r.playerCount}명` : '명단 미등록',
            },
            ...(r.depositorName
              ? [
                  {
                    icon: <User size={14} aria-hidden="true" />,
                    label: `입금자 ${r.depositorName}`,
                  },
                ]
              : []),
            {
              icon: <Clock size={14} aria-hidden="true" />,
              label: `신청 ${formatDate(r.createdAt)}`,
              wrap: true,
            },
            ...(r.cancelRequestedAt
              ? [{
                  icon: <Clock size={14} aria-hidden="true" />,
                  label: `취소 요청 ${formatDate(r.cancelRequestedAt)}`,
                  wrap: true,
                }]
              : []),
          ],
          description: r.cancelReason ? `취소 사유: ${r.cancelReason}` : undefined,
          tone:
            r.status === 'cancelled' || r.status === 'cancel_requested'
              ? 'danger'
              : r.status === 'awaiting_payment' || r.status === 'payment_checking'
              ? 'warning'
              : undefined,
        })}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '신청 목록을 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
        empty={<AdminEmpty title="신청이 없어요" description="아직 신청한 팀이 없어요." />}
        skeletonCards={8}
        minCardWidth="360px"
        renderActions={(reg) => {
          const isLocked = !!reg.rosterLockedAt;
          return (
            <>
              {reg.status === 'awaiting_payment' && (
                <ActionButton
                  onClick={() => handleConfirmPayment(reg)}
                  disabled={confirmPayment.isPending}
                  icon={<Check size={13} />}
                  label="입금 확인"
                  tone="blue"
                />
              )}
              {(reg.status === 'payment_checking' || reg.status === 'paid') && (
                <>
                  <ActionButton
                    onClick={() => void handleConfirmClick(reg)}
                    disabled={confirmRegistration.isPending}
                    icon={<Check size={13} />}
                    label="확정"
                    tone="blue"
                  />
                  <ActionButton
                    onClick={() => handleConfirm(reg, 'waitlist')}
                    disabled={confirmRegistration.isPending}
                    icon={<X size={13} />}
                    label="대기"
                    tone="gray"
                  />
                </>
              )}
              {reg.status === 'confirmed' &&
                (isLocked ? (
                  <ActionButton
                    onClick={() => handleRosterUnlock(reg)}
                    disabled={rosterUnlock.isPending}
                    icon={<Unlock size={13} />}
                    label="잠금 해제"
                    tone="gray"
                  />
                ) : (
                  <ActionButton
                    onClick={() => handleRosterLock(reg)}
                    disabled={rosterLock.isPending}
                    icon={<Lock size={13} />}
                    label="명단 잠금"
                    tone="gray"
                  />
                ))}
              {reg.status === 'confirmed' &&
                (reg.rosterDeadlineOverrideAt ? (
                  <ActionButton
                    onClick={() => handleRosterDeadlineOverrideRevoke(reg)}
                    disabled={rosterDeadlineOverrideRevoke.isPending}
                    icon={<TimerOff size={13} />}
                    label="예외 해제"
                    tone="gray"
                  />
                ) : (
                  <ActionButton
                    onClick={() => handleRosterDeadlineOverrideGrant(reg)}
                    disabled={rosterDeadlineOverrideGrant.isPending}
                    icon={<Timer size={13} />}
                    label="마감 예외 허용"
                    tone="gray"
                  />
                ))}
              {reg.status === 'cancel_requested' && (
                <ActionButton
                  onClick={() => void handleRejectCancel(reg)}
                  disabled={rejectCancelRequest.isPending}
                  icon={<Undo2 size={13} />}
                  label="취소 거부(잔류)"
                  tone="gray"
                />
              )}
              <ActionButton
                onClick={() => {
                  setRosterRegistration(reg);
                  setRosterOpen(true);
                }}
                icon={<ClipboardList size={13} />}
                label="명단 검토"
                tone="gray"
              />
              <ExportCsvButton registrationId={reg.id} showToast={showToast} />
              {ADMIN_CANCELLABLE.has(reg.status) && (
                <ActionButton
                  onClick={() => void handleCancel(reg)}
                  disabled={cancelRegistration.isPending}
                  icon={<X size={13} />}
                  label="취소"
                  tone="red"
                />
              )}
            </>
          );
        }}
      />

      {/* Roster modal */}
      <RosterModal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        registration={rosterRegistration}
        showToast={showToast}
        canWrite={canWrite}
      />

      {/* 신청 관리 confirm modal (취소·취소거부·참가확정·일괄처리 공용) */}
      {ConfirmModal}
    </>
  );
}
