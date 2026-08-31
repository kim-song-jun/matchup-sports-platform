'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { V1TournamentCampaignStatus } from '@/types/tournament-campaign';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';

type StatusDialogProps = {
  readonly target: V1TournamentCampaignStatus | null;
  readonly targetLabel: string;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (status: V1TournamentCampaignStatus, reason: string) => void;
};

export function TournamentCampaignStatusDialog({
  target,
  targetLabel,
  pending,
  onClose,
  onSubmit,
}: StatusDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!target) return;
    setReason('');
  }, [target]);

  // ESC 닫기·focus trap·스크롤 잠금·포커스 저장/복원을 공용 훅에 위임
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLTextAreaElement, HTMLDivElement>({
    open: !!target,
    onClose,
    pending,
  });

  if (!target) return null;
  const trimmedReason = reason.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedReason || pending) return;
    onSubmit(target, trimmedReason);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onMouseDown={onBackdropClick}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="campaign-status-dialog-title" className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-[var(--card-surface)] shadow-[var(--shadow-modal)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="campaign-status-dialog-title" className="text-base font-bold text-[var(--text-strong)]">캠페인 상태 변경</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{targetLabel} 상태로 변경해요.</p>
          </div>
          <button type="button" aria-label="모달 닫기" disabled={pending} onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] disabled:opacity-40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="grid gap-2 px-5 py-5">
            <label htmlFor="campaign-status-reason" className="text-[13px] font-semibold text-[var(--text-body)]">사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span></label>
            <textarea
              id="campaign-status-reason"
              ref={initialFocusRef}
              rows={4}
              maxLength={500}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              aria-required="true"
            />
            <p className="text-right text-[length:var(--font-size-caption)] text-[var(--text-muted)] tabular-nums">{reason.length} / 500</p>
          </div>
          <div className="flex gap-2 px-5 pb-5">
            <button type="button" onClick={onClose} disabled={pending} className="h-[48px] flex-1 rounded-xl bg-[var(--surface-soft)] text-sm font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--border)] disabled:opacity-50">취소</button>
            <button type="submit" disabled={!trimmedReason || pending} className="h-[48px] flex-1 rounded-xl bg-blue-500 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:bg-blue-200">
              {pending ? '처리 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
