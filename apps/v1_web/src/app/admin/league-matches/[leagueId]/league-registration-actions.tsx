'use client';

import { useId, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useV1CloseLeagueRegistration, useV1OpenLeagueRegistration, useV1UpdateLeagueEntryFee } from '@/hooks/use-v1-api';
import { formatEntryFee, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type { V1AdminLeagueDetail, V1UpdateLeagueEntryFeePayload } from '@/types/league-match';

type ShowToast = (message: string, variant?: 'success' | 'error') => void;

export type LeagueRegistrationSource = Pick<
  V1AdminLeagueDetail,
  | 'lifecycleStatus'
  | 'registrationDeadlineAt'
  | 'entryFee'
  | 'entryFeeConfiguredAt'
  | 'bankName'
  | 'bankAccount'
  | 'bankHolder'
  | 'activeRegistrationCount'
  | 'confirmedRegistrationCount'
>;

/** 대회 상단 상태 버튼과 같은 모양(파란 채움) — 앞으로 나아가는 전이다. */
const ACTION_BUTTON =
  'inline-flex min-h-[var(--size-touch-min)] items-center whitespace-nowrap rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-label)] font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/**
 * 리그 상단의 '접수 시작하기 / 접수 마감하기' — 대회 어드민과 같은 자리·같은 말이다(2026-10-27 사용자 선택).
 * 시작 전(초안·마감)이면 시작하기, 접수 중이면 마감하기를 그리고, 시작했거나 끝난 리그에는 없다.
 */
export function LeagueRegistrationActions({ leagueId, league, showToast }: {
  leagueId: string;
  league: LeagueRegistrationSource;
  showToast: ShowToast;
}) {
  const status = league.lifecycleStatus;
  if (status === 'draft' || status === 'closed') return <OpenRegistrationAction leagueId={leagueId} league={league} showToast={showToast} />;
  if (status === 'open') return <CloseRegistrationAction leagueId={leagueId} league={league} showToast={showToast} />;
  return null;
}

function futureDeadlineLocal(iso: string | null): string {
  return iso !== null && Date.parse(iso) > Date.now() ? isoToKstDatetimeLocal(iso) : '';
}

function OpenRegistrationAction({ leagueId, league, showToast }: {
  leagueId: string;
  league: LeagueRegistrationSource;
  showToast: ShowToast;
}) {
  const deadlineId = useId();
  const noDeadlineId = useId();
  const openRegistration = useV1OpenLeagueRegistration(leagueId);
  const updateFee = useV1UpdateLeagueEntryFee(leagueId);
  const [modalOpen, setModalOpen] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [noDeadline, setNoDeadline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feeUnconfigured = league.entryFeeConfiguredAt === null;
  const inheritedFee = feeUnconfigured && league.entryFee > 0;
  const busy = openRegistration.isPending || updateFee.isPending;

  const openModal = () => {
    // 이미 정해 둔 미래 마감이 있으면 그대로 채운다. 없으면 비워 두고 '마감 없이 받기'를 직접 고르게 한다.
    setDeadline(futureDeadlineLocal(league.registrationDeadlineAt));
    setNoDeadline(false);
    setError(null);
    setModalOpen(true);
  };

  const onConfirm = async () => {
    let registrationDeadlineAt: string | null = null;
    if (!noDeadline) {
      const iso = kstDatetimeLocalToIso(deadline);
      if (iso === null) {
        setError("신청 마감을 정하거나 '마감 없이 받기'를 골라 주세요.");
        return;
      }
      // 서버와 같은 부등호(`<=`) — 지금과 같은 순간으로 열면 서버가 422 로 막는다.
      if (Date.parse(iso) <= Date.now()) {
        setError('신청 마감은 지금 이후여야 해요.');
        return;
      }
      registrationDeadlineAt = iso;
    }
    setError(null);
    // 참가비를 확정하지 않았으면 여는 순간 확정한다 — 이어받은 금액은 그대로, 없던 값은 0원(무료). 실패하면 열지 않는다.
    if (feeUnconfigured) {
      const payload: V1UpdateLeagueEntryFeePayload = { entryFee: inheritedFee ? league.entryFee : 0 };
      if (inheritedFee) {
        if (league.bankName) payload.bankName = league.bankName;
        if (league.bankAccount) payload.bankAccount = league.bankAccount;
        if (league.bankHolder) payload.bankHolder = league.bankHolder;
      }
      try {
        await updateFee.mutateAsync(payload);
      } catch (feeError) {
        setError(extractErrorMessage(feeError, '참가비를 저장하지 못했어요.'));
        return;
      }
    }
    openRegistration.mutate({ registrationDeadlineAt }, {
      onSuccess: () => {
        setModalOpen(false);
        showToast('접수를 시작했어요. 팀장이 리그 화면에서 신청할 수 있어요.', 'success');
      },
      onError: (openError) => setError(extractErrorMessage(openError, '접수를 시작하지 못했어요.')),
    });
  };

  const feeLine = inheritedFee
    ? `직전 시즌에서 이어받은 참가비 ${formatEntryFee(league.entryFee)}으로 열려요. 맞는지 확인해 주세요.`
    : feeUnconfigured
      ? '참가비를 정하지 않아 무료로 열려요. 유료 리그라면 신청 관리에서 먼저 정해 주세요.'
      : `참가비 ${formatEntryFee(league.entryFee)}`;

  return (
    <>
      <button type="button" onClick={openModal} className={ACTION_BUTTON}>접수 시작하기</button>
      <ConfirmModal
        open={modalOpen}
        title="접수를 시작할까요?"
        message="팀장이 리그 화면에서 참가 신청을 할 수 있어요. 리그를 시작하면 신청이 닫혀요."
        details={
          <div className="space-y-3">
            <div>
              <label htmlFor={deadlineId} className="mb-1 block text-[length:var(--font-size-label)] font-medium text-[var(--text-strong)]">
                신청 마감 (한국 시간)
              </label>
              <input
                id={deadlineId}
                type="datetime-local"
                max="9999-12-31T23:59"
                value={deadline}
                disabled={noDeadline || busy}
                onChange={(event) => setDeadline(event.target.value)}
                className="block min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] disabled:opacity-50"
              />
            </div>
            <label htmlFor={noDeadlineId} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[length:var(--font-size-label)] text-[var(--text-strong)]">
              <input
                id={noDeadlineId}
                type="checkbox"
                checked={noDeadline}
                disabled={busy}
                onChange={(event) => setNoDeadline(event.target.checked)}
                className="h-5 w-5"
              />
              마감 없이 받기 — &lsquo;접수 마감하기&rsquo;를 누를 때까지 받아요
            </label>
            <p className={`text-[length:var(--font-size-caption)] ${feeUnconfigured ? 'text-[var(--orange700)]' : 'text-[var(--text-muted)]'}`}>{feeLine}</p>
          </div>
        }
        confirmLabel={inheritedFee ? '이 참가비로 접수 시작' : feeUnconfigured ? '무료로 접수 시작' : '접수 시작'}
        cancelLabel="닫기"
        busy={busy}
        error={error}
        onConfirm={() => void onConfirm()}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}

function CloseRegistrationAction({ leagueId, league, showToast }: {
  leagueId: string;
  league: LeagueRegistrationSource;
  showToast: ShowToast;
}) {
  const close = useV1CloseLeagueRegistration(leagueId);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deadlineText = league.registrationDeadlineAt ? formatTournamentDateTimeShort(league.registrationDeadlineAt) ?? '' : '마감 없음';
  const waitingCount = Math.max(league.activeRegistrationCount - league.confirmedRegistrationCount, 0);

  const onConfirm = () => {
    const trimmed = reason.trim();
    setError(null);
    close.mutate(trimmed === '' ? {} : { reason: trimmed }, {
      onSuccess: (result) => {
        setModalOpen(false);
        setReason('');
        showToast(result.alreadyProcessed ? '이미 접수가 끝난 리그예요.' : '접수를 마감했어요. 새 신청은 받지 않아요.', 'success');
      },
      onError: (closeError) => setError(extractErrorMessage(closeError, '접수를 마감하지 못했어요.')),
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setError(null); setModalOpen(true); }} className={ACTION_BUTTON}>접수 마감하기</button>
      <ConfirmModal
        open={modalOpen}
        title="접수를 마감할까요?"
        message="지금부터 새 신청을 받지 않아요. 이미 낸 신청은 그대로 남고, 리그를 시작하기 전에는 다시 접수를 시작할 수 있어요."
        details={
          <div className="tm-card" style={{ padding: 0 }}>
            <div className="tm-info-row" style={{ padding: '0 16px' }}>
              <div className="tm-text-caption">지금 마감</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{deadlineText}</div>
            </div>
            <div className="tm-info-row" style={{ padding: '0 16px', borderBottom: 'none' }}>
              <div className="tm-text-caption">팀이 직접 낸 신청</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {league.activeRegistrationCount}팀 (확정 {league.confirmedRegistrationCount} · 대기 {waitingCount})
              </div>
            </div>
          </div>
        }
        reasonField={{ label: '사유 (선택)', value: reason, onChange: setReason, maxLength: 200, hint: '감사 기록에만 남아요.' }}
        confirmLabel="접수 마감"
        cancelLabel="닫기"
        busy={close.isPending}
        error={error}
        onConfirm={onConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}
