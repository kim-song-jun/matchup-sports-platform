'use client';

import { useState } from 'react';
import { AdminEmpty, AdminListSkeleton } from '@/components/admin';
import { useV1AdminTournamentRegistrations, useV1ConfirmPayment, useV1ConfirmRegistration, useV1CancelRegistrationAdmin, useV1RejectCancelRequest } from '@/hooks/use-v1-api';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useUnsavedChangesGuard } from '@/components/v1-ui/use-unsaved-changes-guard';
import { RosterLockControls } from './registration-roster-lock-controls';
import { RosterModal } from './registration-roster-modal';
import { CancelRequestSheet } from './registrations-cancel-request';
import { RegistrationsDraftSection, RegistrationsWaitlistCancelledSection } from './registrations-collapsed-sections';
import { RegistrationsConfirmedSection } from './registrations-confirmed-section';
import {
  groupRegistrations,
  type RegistrationHandlers,
  type RegistrationViewContext,
  type ShowToast,
} from './registrations-model';
import { RegistrationsTodoSection } from './registrations-todo-section';
import { SimpleModal, textareaCls } from './tournament-detail-shared';

type CancelSurface = 'modal' | 'sheet';

// ── Tab: Registrations ────────────────────────────────────────────────────

// exported for component-level testing — see tournament-detail-registrations-tab.test.tsx
export function RegistrationsTab({
  tournamentId,
  showToast,
  tournamentTeamCount,
  canWrite,
  admissionsBlockedReason = null,
  requireCancelReason = false,
  isFreeEntry = false,
  rosterDeadlineAt = null,
}: {
  tournamentId: string;
  showToast: ShowToast;
  /** 정원(팀 수) — 참가 확정 시 정원 초과 경고에 사용. 로딩 중이면 undefined */
  tournamentTeamCount?: number;
  canWrite: boolean;
  admissionsBlockedReason?: string | null;
  /**
   * 거부 사유를 **반드시** 받아야 하는가. 정규 리그가 그렇다(D9 — 서버가
   * `LEAGUE_CANCEL_REASON_REQUIRED` 로 400 을 준다). 대회는 선택 그대로다.
   *
   * `kind` 를 새로 조회하지 않고 prop 으로 받는 이유는 **호출부가 이미 안다**는 것이다 —
   * 리그 화면이 이 탭을 리그 id 로 렌더하고, 대회 화면이 대회 id 로 렌더한다.
   */
  requireCancelReason?: boolean;
  isFreeEntry?: boolean;
  /**
   * 명단 제출 마감. 없으면(리그는 늘 없다) 마감 예외가 아무 차이를 만들지 않으므로 '마감 예외 허용'을
   * 숨긴다(MD-QA #202). 이미 준 예외를 거두는 '예외 해제'는 그대로 보인다.
   */
  rosterDeadlineAt?: string | null;
}) {
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentRegistrations(tournamentId);
  const confirmPayment = useV1ConfirmPayment();
  const confirmRegistration = useV1ConfirmRegistration();
  const cancelRegistration = useV1CancelRegistrationAdmin();
  const rejectCancelRequest = useV1RejectCancelRequest();
  // 창은 id 로 신청을 찾는다 — 잠금처럼 목록을 다시 받는 조작 뒤에도 낡은 신청을 들고 있지 않고, 신청이 사라지면 닫힌다.
  const [rosterRegistrationId, setRosterRegistrationId] = useState<string | null>(null);
  // 경기별 명단 펼침(Task 179) — 한 번에 한 팀만 연다.
  const [gameRostersRegistrationId, setGameRostersRegistrationId] = useState<string | null>(null);
  // 펼친 표의 저장 전 칸 변경 — 펼침을 닫거나(다른 팀·접기) 화면을 떠나면 사라진다.
  const [gameRostersDirty, setGameRostersDirty] = useState(false);
  const { confirm: confirmDialog, ConfirmModal } = useConfirm();
  const { UnsavedChangesModal } = useUnsavedChangesGuard(gameRostersDirty);
  // 취소 처리 대상 — 데스크톱은 사유 창, 폰은 아래 시트가 같은 상태를 쓴다.
  const [cancelTarget, setCancelTarget] = useState<V1AdminTournamentRegistration | null>(null);
  const [cancelSurface, setCancelSurface] = useState<CancelSurface>('modal');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // P2-7: 일괄 입금 확인 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const registrations = data?.items ?? [];
  const groups = groupRegistrations(registrations);
  const rosterRegistration = registrations.find((r) => r.id === rosterRegistrationId) ?? null;
  // 무료 대회에는 확인할 입금이 없다 — 같은 awaiting_payment 처리를 「신청 확인」으로 부른다.
  const confirmNoun = isFreeEntry ? '신청 확인' : '입금 확인';

  /** 펼친 경기별 명단을 닫게 되는 조작 — 저장 전 변경이 있으면 버릴지 물은 뒤에만 한다. */
  const closingGameRosters = (apply: () => void) => {
    if (!gameRostersDirty) {
      apply();
      return;
    }
    void confirmDialog({
      title: '저장하지 않은 명단 변경이 있어요',
      message: '펼친 팀의 경기별 명단에서 바꾼 칸이 저장되지 않고 사라져요.',
      confirmLabel: '버리기',
      cancelLabel: '계속 편집',
      tone: 'danger',
    }).then((discard) => {
      if (discard) apply();
    });
  };

  const toggleGameRosters = (registrationId: string) =>
    closingGameRosters(() => setGameRostersRegistrationId((current) => (current === registrationId ? null : registrationId)));

  const handleConfirmPayment = (reg: V1AdminTournamentRegistration) => {
    confirmPayment.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast(isFreeEntry ? '신청을 확인했어요.' : '입금을 확인했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, `${confirmNoun}에 실패했어요.`), 'error'),
      },
    );
  };

  const handleConfirm = (reg: V1AdminTournamentRegistration, decision: 'confirm' | 'waitlist') => {
    if (admissionsBlockedReason) {
      showToast(admissionsBlockedReason, 'error');
      return;
    }
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
    if (admissionsBlockedReason) {
      showToast(admissionsBlockedReason, 'error');
      return;
    }
    const confirmedCount = groups.confirmed.length;
    const nextCount = confirmedCount + 1;
    const capacityLine =
      tournamentTeamCount != null
        ? `현재 ${confirmedCount}/${tournamentTeamCount}팀 확정 — 이 팀을 확정하면 ${nextCount}/${tournamentTeamCount}팀이 돼요.`
        : `현재 ${confirmedCount}팀이 확정됐어요.`;
    const overCapacity = tournamentTeamCount != null && nextCount > tournamentTeamCount;
    // 정원 초과일 땐 서버가 409 TOURNAMENT_CAPACITY_FULL 로 확정을 거절한다 — 확인 버튼 자체를
    // "대기로 처리"로 바꿔 버튼 라벨과 실제 동작(waitlist 결정)을 일치시킨다.
    const message = overCapacity
      ? `${capacityLine} 정원을 초과해 확정할 수 없어요 — 대신 대기 명단으로 처리할까요?`
      : capacityLine;
    const ok = await confirmDialog({
      title: overCapacity ? '정원 초과 — 대기 처리' : '참가 확정',
      message,
      confirmLabel: overCapacity ? '대기로 처리' : '확정',
      tone: overCapacity ? 'danger' : 'default',
    });
    if (!ok) return;
    handleConfirm(reg, overCapacity ? 'waitlist' : 'confirm');
  };

  // **사유를 받는 전용 창(폰은 시트)을 연다.** 리그는 서버가 사유를 필수로 요구해서(`LEAGUE_CANCEL_REASON_REQUIRED`)
  // 예/아니오 확인만으로는 신청을 거부할 방법이 없다.
  // 팀이 낸 취소 요청(cancel_requested)을 받아 주는 것은 거부가 아니라 승인이다 — 같은 API 를
  // 쓰지만 문구와 사유 필수 여부(승인은 선택)가 갈린다.
  const isCancelApproval = cancelTarget?.status === 'cancel_requested';
  const handleCancel = (reg: V1AdminTournamentRegistration, surface: CancelSurface = 'modal') => {
    setCancelTarget(reg);
    setCancelSurface(surface);
    setCancelReason('');
    setCancelError(null);
  };

  const submitCancel = () => {
    const target = cancelTarget;
    if (target === null || cancelRegistration.isPending) return;
    const reason = cancelReason.trim();
    if (requireCancelReason && !isCancelApproval && reason === '') {
      // 서버도 막지만, 저장 순간에야 알면 운영자는 무엇이 빠졌는지 폼을 다시 훑어야 한다.
      setCancelError('리그 참가를 거부하려면 사유를 입력해 주세요.');
      return;
    }
    cancelRegistration.mutate(
      // 빈 사유는 보내지 않는다 — 서버가 빈 문자열을 그대로 어드민 사유로 저장한다.
      { registrationId: target.id, ...(reason === '' ? {} : { reason }) },
      {
        onSuccess: () => {
          setCancelTarget(null);
          showToast(isCancelApproval ? '취소를 승인했어요.' : '거부했어요.', 'success');
        },
        onError: (err) =>
          setCancelError(extractErrorMessage(err, isCancelApproval ? '취소를 승인하지 못했어요.' : '거부하지 못했어요.')),
      },
    );
  };

  const keepRegistration = (reg: V1AdminTournamentRegistration, onFailure: (message: string) => void, onDone: () => void) => {
    rejectCancelRequest.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => {
          onDone();
          showToast('참가를 유지했어요.', 'success');
        },
        onError: (err) => onFailure(extractErrorMessage(err, '참가 유지 처리에 실패했어요.')),
      },
    );
  };

  // 데스크톱은 인라인 선택 뒤 한 번 더 확인한다. 폰 시트는 고른 뒤 확정 버튼이 그 확인이다.
  const handleKeepRegistration = async (reg: V1AdminTournamentRegistration) => {
    const ok = await confirmDialog({
      title: '참가 유지',
      message: '취소 요청을 거절하고 이전 상태로 돌릴까요? 팀이 남긴 취소 사유는 기록에 남아요.',
      confirmLabel: '참가 유지하기',
    });
    if (!ok) return;
    keepRegistration(reg, (message) => showToast(message, 'error'), () => undefined);
  };

  const keepFromSheet = () => {
    const target = cancelTarget;
    if (target === null || rejectCancelRequest.isPending) return;
    keepRegistration(target, setCancelError, () => setCancelTarget(null));
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
      title: `일괄 ${confirmNoun}`,
      message: `선택한 ${targets.length}건을 ${confirmNoun} 처리할까요?`,
      confirmLabel: confirmNoun,
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
          showToast(extractErrorMessage(err, `${teamLabel} ${confirmNoun}에 실패했어요.`), 'error');
        }
      }
    } finally {
      setIsBatchProcessing(false);
      setSelectedIds(new Set());
    }
    if (successCount > 0) {
      showToast(`${successCount}건 ${confirmNoun} 완료`, 'success');
    }
  };

  const ctx: RegistrationViewContext = {
    canWrite,
    isFreeEntry,
    confirmNoun,
    admissionsBlockedReason,
    busy:
      confirmPayment.isPending ||
      confirmRegistration.isPending ||
      cancelRegistration.isPending ||
      rejectCancelRequest.isPending ||
      isBatchProcessing,
    showToast,
  };

  const handlers: RegistrationHandlers = {
    onViewRoster: (reg) => setRosterRegistrationId(reg.id),
    onConfirmPayment: handleConfirmPayment,
    onConfirm: (reg) => void handleConfirmClick(reg),
    onWaitlist: (reg) => handleConfirm(reg, 'waitlist'),
    onApproveCancel: (reg) => handleCancel(reg),
    onKeepRegistration: (reg) => void handleKeepRegistration(reg),
    onOpenCancelSheet: (reg) => handleCancel(reg, 'sheet'),
    onReject: (reg) => handleCancel(reg),
    onToggleGameRosters: (reg) => toggleGameRosters(reg.id),
  };

  return (
    <>
      {admissionsBlockedReason && <p role="status" className="mb-3 text-[length:var(--font-size-body-sm)] text-[var(--text-caption)]">{admissionsBlockedReason}</p>}
      {/* 전량 로더의 안전 상한(1,000건)에 걸린 경우 — 조용한 잘림 금지, 정직하게 알린다 */}
      {data?.truncated && (
        <p className="mb-3 rounded-xl bg-[var(--tint-orange)] px-4 py-3 text-[length:var(--font-size-label)] font-medium text-[var(--orange700)]">
          신청이 1,000건을 넘어 일부만 불러왔어요. 아래 목록과 카운트가 전체보다 적을 수 있어요.
        </p>
      )}

      {isError ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
          <p className="text-[length:var(--font-size-body-sm)] text-[var(--red700)] font-medium">{extractErrorMessage(error, '신청 목록을 불러오지 못했어요.')}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-[length:var(--font-size-body-sm)] text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 시도하기
          </button>
        </div>
      ) : isPending ? (
        <div aria-busy="true" aria-live="polite" className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminListSkeleton rows={4} />
        </div>
      ) : registrations.length === 0 ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty title="신청이 없어요" description="아직 신청한 팀이 없어요." />
        </div>
      ) : (
        <div className="tm-content-enter flex flex-col gap-7">
          <RegistrationsTodoSection
            rows={groups.todo}
            ctx={ctx}
            handlers={handlers}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onClearSelected={() => setSelectedIds(new Set())}
            onBatchConfirm={() => void handleBatchConfirmPayment()}
          />
          <RegistrationsConfirmedSection
            rows={groups.confirmed}
            teamCapacity={tournamentTeamCount}
            tournamentId={tournamentId}
            ctx={ctx}
            handlers={handlers}
            expandedGameRostersId={gameRostersRegistrationId}
            onGameRostersDirtyChange={setGameRostersDirty}
          />
          <RegistrationsWaitlistCancelledSection rows={[...groups.waitlisted, ...groups.cancelled]} ctx={ctx} handlers={handlers} />
          <RegistrationsDraftSection rows={groups.drafts} ctx={ctx} handlers={handlers} />
        </div>
      )}

      {/* 신청 거부·취소 승인 창 — 사유를 받는다(리그의 거부는 필수). 폰의 취소 요청은 아래 시트가 맡는다. */}
      <SimpleModal
        open={cancelTarget !== null && cancelSurface === 'modal'}
        title={isCancelApproval ? '취소 승인' : '신청 거부'}
        onClose={() => setCancelTarget(null)}
        pending={cancelRegistration.isPending}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {isCancelApproval
              ? `${cancelTarget?.teamName ?? cancelTarget?.teamId}의 참가 취소 요청을 승인할까요? 승인하면 신청이 취소되고 되돌릴 수 없어요.`
              : `${cancelTarget?.teamName ?? cancelTarget?.teamId}의 신청을 거부할까요? 되돌릴 수 없어요.`}
          </p>
          {isCancelApproval && cancelTarget?.cancelReason ? (
            <p className="text-xs text-[var(--text-muted)]">
              팀이 남긴 취소 사유: “{cancelTarget.cancelReason}”
            </p>
          ) : null}
          <label className="text-sm font-medium text-[var(--text-strong)]" htmlFor="cancel-reason">
            {isCancelApproval ? '운영진 사유' : '사유'}{requireCancelReason && !isCancelApproval ? '' : ' (선택)'}
          </label>
          <textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={(event) => {
              setCancelReason(event.target.value);
              setCancelError(null);
            }}
            rows={3}
            placeholder={
              requireCancelReason && !isCancelApproval
                ? '왜 거부하는지 적어 주세요. 팀에게 남는 기록이에요.'
                : '필요하면 적어 주세요.'
            }
            className={textareaCls}
          />
          {cancelError !== null ? (
            <p role="alert" className="text-xs text-[var(--red700)]">
              {cancelError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={cancelRegistration.isPending}
              className="tm-btn tm-btn-sm tm-btn-ghost"
              style={{ minHeight: 44 }}
            >
              닫기
            </button>
            <button
              type="button"
              onClick={submitCancel}
              disabled={cancelRegistration.isPending}
              className="tm-btn tm-btn-sm tm-btn-danger"
              style={{ minHeight: 44 }}
            >
              {cancelRegistration.isPending ? '처리 중…' : isCancelApproval ? '취소 승인' : '거부'}
            </button>
          </div>
        </div>
      </SimpleModal>

      <CancelRequestSheet
        open={cancelTarget !== null && cancelSurface === 'sheet'}
        registration={cancelTarget}
        reason={cancelReason}
        error={cancelError}
        busy={cancelRegistration.isPending || rejectCancelRequest.isPending}
        onReasonChange={(value) => {
          setCancelReason(value);
          setCancelError(null);
        }}
        onApprove={submitCancel}
        onKeep={keepFromSheet}
        onClose={() => setCancelTarget(null)}
      />

      <RosterModal
        open={rosterRegistration !== null}
        onClose={() => setRosterRegistrationId(null)}
        registration={rosterRegistration}
        showToast={showToast}
        canWrite={canWrite}
        footer={
          rosterRegistration ? (
            <RosterLockControls
              registration={rosterRegistration}
              canWrite={canWrite}
              rosterDeadlineAt={rosterDeadlineAt}
              showToast={showToast}
            />
          ) : null
        }
      />

      {/* 신청 관리 confirm modal (참가확정·참가유지·일괄처리 공용) */}
      {ConfirmModal}
      {UnsavedChangesModal}
    </>
  );
}
