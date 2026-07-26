'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { V1TournamentCampaignStatus } from '@/types/tournament-campaign';

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
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!target) return;
    setReason('');
    reasonRef.current?.focus();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending, target]);

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
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="campaign-status-dialog-title" className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(20,28,45,0.14)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="campaign-status-dialog-title" className="text-base font-bold text-gray-900">캠페인 상태 변경</h2>
            <p className="mt-1 text-xs text-gray-500">{targetLabel} 상태로 변경해요.</p>
          </div>
          <button type="button" aria-label="모달 닫기" disabled={pending} onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="grid gap-1.5 px-5 py-5">
            <label htmlFor="campaign-status-reason" className="text-[13px] font-semibold text-gray-700">사유 <span className="text-red-500" aria-hidden="true">*</span></label>
            <textarea
              id="campaign-status-reason"
              ref={reasonRef}
              autoFocus
              rows={4}
              maxLength={500}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              aria-required="true"
            />
            <p className="text-right text-[11px] text-gray-400 tabular-nums">{reason.length} / 500</p>
          </div>
          <div className="flex gap-2 px-5 pb-5">
            <button type="button" onClick={onClose} disabled={pending} className="h-[48px] flex-1 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50">취소</button>
            <button type="submit" disabled={!trimmedReason || pending} className="h-[48px] flex-1 rounded-xl bg-blue-500 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:bg-blue-200">
              {pending ? '처리 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
