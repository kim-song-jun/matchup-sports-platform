'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1CloseLeagueRegistration } from '@/hooks/use-v1-api';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { describeLeagueRegistrationWindow } from '@/lib/league-registration-copy';

type LeagueState = 'draft' | 'active' | 'completed' | 'on_hold';

const OUTLINE_BUTTON =
  'tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * 신청 즉시 마감 — 마감 시각을 지금으로 당긴다. 다시 열기는 신청 관리의 `open-registration` 경로 하나뿐이라
 * 닫힌 상태에서는 그쪽으로 보내는 링크만 둔다. 보류 중에도 신청은 열려 있을 수 있어 그대로 그린다.
 */
export function LeagueCloseRegistrationControl({
  leagueId,
  state,
  registrationOpen,
  registrationDeadlineAt,
  activeRegistrationCount,
  confirmedCount,
  showToast,
}: {
  leagueId: string;
  state: LeagueState;
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
  activeRegistrationCount: number;
  confirmedCount: number;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const close = useV1CloseLeagueRegistration(leagueId);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (state === 'completed') return null;

  const deadlineText = registrationDeadlineAt ? formatTournamentDateTimeShort(registrationDeadlineAt) ?? '' : '';
  const waitingCount = Math.max(activeRegistrationCount - confirmedCount, 0);

  const closeModal = () => {
    setModalOpen(false);
    setError(null);
  };
  const onConfirm = () => {
    const trimmed = reason.trim();
    setError(null);
    close.mutate(trimmed === '' ? {} : { reason: trimmed }, {
      onSuccess: (result) => {
        setModalOpen(false);
        setReason('');
        showToast(result.alreadyProcessed ? '이미 신청이 마감된 리그예요.' : '신청을 마감했어요. 새 신청은 받지 않아요.', 'success');
      },
      onError: (err) => setError(extractErrorMessage(err, '신청을 마감하지 못했어요.')),
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <SectionTitle title="신청 마감" id={headingId} compact />
        {registrationOpen ? (
          <>
            <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">
              마감 시각을 지금으로 당겨 신청을 바로 닫아요. 이미 낸 신청은 그대로 남아요.
            </p>
            <p className="tm-text-caption mt-2 font-medium text-[var(--text-muted)]" aria-live="polite">
              현재 상태: 모집 중 · {deadlineText}까지
            </p>
          </>
        ) : (
          <>
            <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">
              {describeLeagueRegistrationWindow({
                state,
                registrationOpen,
                registrationDeadlineAt,
                noDeadlineHint: '마감을 정해야 신청을 받아요. 신청 관리에서 정해 주세요.',
              })}
            </p>
            <p className="tm-text-caption mt-2 font-medium text-[var(--text-muted)]" aria-live="polite">
              현재 상태: 신청 안 받는 중
            </p>
          </>
        )}
        {registrationOpen && !canWrite && (
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">현재 계정은 신청을 마감할 권한이 없어요.</p>
        )}
      </div>
      {registrationOpen ? (
        <button
          type="button"
          disabled={!canWrite || close.isPending}
          onClick={() => setModalOpen(true)}
          className={OUTLINE_BUTTON}
        >
          지금 마감하기
        </button>
      ) : (
        <Link href={`/admin/league-matches/${leagueId}/registrations`} className={OUTLINE_BUTTON}>
          {registrationDeadlineAt === null ? '신청 관리에서 열기' : '신청 관리에서 다시 열기'}
        </Link>
      )}
      <ConfirmModal
        open={modalOpen}
        title="신청을 지금 마감할까요?"
        message="지금부터 새 신청을 받지 않아요. 이미 낸 신청은 그대로 남고, 나중에 다시 열 수 있어요."
        details={
          <div className="tm-card" style={{ padding: 0 }}>
            <div className="tm-info-row" style={{ padding: '0 16px' }}>
              <div className="tm-text-caption">현재 마감</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{deadlineText}</div>
            </div>
            <div className="tm-info-row" style={{ padding: '0 16px' }}>
              <div className="tm-text-caption">팀이 직접 낸 신청</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {activeRegistrationCount}팀 (확정 {confirmedCount} · 대기 {waitingCount})
              </div>
            </div>
            <div className="tm-info-row" style={{ padding: '0 16px', borderBottom: 'none' }}>
              <div className="tm-text-caption">마감 후</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                지금 시각으로 마감돼요
                {waitingCount > 0 ? ` · 대기 중인 ${waitingCount}팀은 마감 뒤에도 처리할 수 있어요` : ''}
              </div>
            </div>
          </div>
        }
        reasonField={{ label: '사유 (선택)', value: reason, onChange: setReason, maxLength: 200, hint: '감사 기록에만 남아요.' }}
        confirmLabel="지금 마감"
        cancelLabel="취소"
        busy={close.isPending}
        error={error}
        onConfirm={onConfirm}
        onCancel={closeModal}
      />
    </section>
  );
}
