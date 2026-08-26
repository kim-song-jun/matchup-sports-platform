'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';

// ── Types ─────────────────────────────────────────────────────────────────
export interface ReasonStatusOption {
  value: string;
  label: string;
}

interface AdminReasonModalProps {
  open: boolean;
  title: string;
  currentStatus?: string;
  statusOptions: ReasonStatusOption[];
  onSubmit: (status: string, reason: string) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

const REASON_MAX = 500;

// ── Component ─────────────────────────────────────────────────────────────
export function AdminReasonModal({
  open,
  title,
  currentStatus,
  statusOptions,
  onSubmit,
  onClose,
  pending = false,
}: AdminReasonModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(
    currentStatus ?? statusOptions[0]?.value ?? '',
  );
  const [reason, setReason] = useState('');

  // focus 저장·복원 / 첫 컨트롤 포커스 / ESC / focus trap / 스크롤 잠금 — 공용 훅.
  // 이 파일의 구현을 리그 모달 3종이 "그대로 본떠" 네 벌이 됐던 것을 한 벌로 모았다.
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLSelectElement>({
    open,
    onClose,
    pending,
  });

  // Reset form whenever the modal opens
  useEffect(() => {
    if (open) {
      setSelectedStatus(currentStatus ?? statusOptions[0]?.value ?? '');
      setReason('');
    }
  }, [open, currentStatus, statusOptions]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(selectedStatus, trimmedReason);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      aria-hidden={!open}
      onClick={onBackdropClick}
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-reason-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2
            id="admin-reason-modal-title"
            className="text-[16px] font-bold text-[var(--text-strong)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* Status selector */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="admin-reason-status"
                className="text-[13px] font-semibold text-[var(--text-body)]"
              >
                변경할 상태
              </label>
              <select
                id="admin-reason-status"
                ref={initialFocusRef}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={pending}
                className={[
                  'h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reason textarea */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="admin-reason-text"
                className="text-[13px] font-semibold text-[var(--text-body)]"
              >
                사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="admin-reason-text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={4}
                disabled={pending}
                placeholder="처리 사유를 입력해 주세요."
                className={[
                  'px-3 py-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedReason.length === 0 ? 'border-[var(--border)]' : 'border-[var(--border-strong)]',
                ].join(' ')}
                aria-required="true"
                aria-describedby="admin-reason-char-count"
              />
              <p
                id="admin-reason-char-count"
                className={[
                  'text-[length:var(--font-size-caption)] text-right tabular-nums',
                  reason.length >= REASON_MAX ? 'text-[var(--red700)]' : 'text-[var(--text-muted)]',
                ].join(' ')}
                aria-live="polite"
              >
                {reason.length} / {REASON_MAX}
              </p>
            </div>

            {/* Required hint */}
            {trimmedReason.length === 0 && reason.length > 0 && (
              <p className="text-[12px] text-[var(--red700)]" role="alert">
                공백만 입력하면 제출할 수 없어요.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {pending ? '처리 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
