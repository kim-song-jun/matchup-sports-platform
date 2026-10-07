'use client';

import { useId, useState } from 'react';
import { GateConfirmModal } from '@/components/admin/operation-flag-gate-confirm-modal';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1HoldLeague, useV1ResumeLeague } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

type LeagueState = 'draft' | 'active' | 'completed' | 'on_hold';

/**
 * 리그 보류 — 리그 "취소" 대신 쓴다(2026-10-07 사용자 확정). 보류하면 리그와 경기가 공개 화면에서
 * 숨고 대진·결과·참가는 그대로 남는다. 보류 해제가 보류 전 상태와 공개 여부로 되돌린다.
 * 끝난(종료) 리그는 보류할 수 없어 카드를 그리지 않는다.
 */
export function LeagueHoldControl({
  leagueId,
  state,
  showToast,
}: {
  leagueId: string;
  state: LeagueState;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const hold = useV1HoldLeague(leagueId);
  const resume = useV1ResumeLeague(leagueId);
  const [modal, setModal] = useState<'hold' | 'resume' | null>(null);
  if (state === 'completed') return null;

  const onHold = state === 'on_hold';
  const mutation = modal === 'resume' ? resume : hold;
  const onConfirm = (reason: string) => {
    mutation.mutate(
      { reason: reason.trim() },
      {
        onSuccess: (result) => {
          setModal(null);
          showToast(
            result.alreadyProcessed
              ? onHold ? '이미 보류가 풀린 리그예요.' : '이미 보류된 리그예요.'
              : onHold ? '보류를 해제했어요. 보류 전 상태와 공개 설정으로 돌아갔어요.' : '리그를 보류했어요. 공개 화면에서 리그와 경기가 숨겨져요.',
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, onHold ? '보류를 해제하지 못했어요.' : '리그를 보류하지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <SectionTitle title="리그 보류" id={headingId} compact />
        <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">
          {onHold
            ? '보류 중이라 공개 화면에서 리그와 경기가 숨겨져 있어요. 대진·결과는 그대로 남아 있어요.'
            : '리그를 멈춰야 할 때 취소 대신 보류해요. 리그와 경기가 공개 화면에서 숨겨지고, 남은 경기는 취소되지 않아요.'}
        </p>
        {!canWrite && (
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">현재 계정은 리그 상태를 바꿀 권한이 없어요.</p>
        )}
      </div>
      <button
        type="button"
        disabled={!canWrite || hold.isPending || resume.isPending}
        onClick={() => setModal(onHold ? 'resume' : 'hold')}
        className="tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {onHold ? '보류 해제' : '리그 보류'}
      </button>
      <GateConfirmModal
        open={modal !== null}
        pending={mutation.isPending}
        title={modal === 'resume' ? '보류를 해제할까요?' : '리그를 보류할까요?'}
        description={
          modal === 'resume'
            ? '보류 전 상태와 공개 설정으로 돌아가요. 남아 있던 경기는 그대로 이어져요.'
            : '리그와 경기가 공개 화면에서 숨겨져요. 대진·결과·참가 팀은 그대로 남고, 나중에 보류를 해제할 수 있어요.'
        }
        confirmLabel={modal === 'resume' ? '해제하기' : '보류하기'}
        tone="amber"
        onConfirm={onConfirm}
        onClose={() => setModal(null)}
      />
    </section>
  );
}
