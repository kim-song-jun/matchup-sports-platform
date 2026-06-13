'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

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

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLSelectElement>(null);
  /** Saved reference to the element that was focused before the modal opened (for focus restore on close) */
  const previousFocusRef = useRef<Element | null>(null);

  // Reset form whenever the modal opens
  useEffect(() => {
    if (open) {
      setSelectedStatus(currentStatus ?? statusOptions[0]?.value ?? '');
      setReason('');
    }
  }, [open, currentStatus, statusOptions]);

  // Save focus on open; restore it on close via every path (ESC / backdrop / Cancel / submit) (WCAG 2.4.3)
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  // Focus the first control on open
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => firstFocusableRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  // ESC to close (unless pending)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

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
      onClick={(e) => {
        // Close on backdrop click (not on panel click)
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-reason-modal-title"
        className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2
            id="admin-reason-modal-title"
            className="text-[16px] font-bold text-gray-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* Status selector */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-reason-status"
                className="text-[13px] font-semibold text-gray-700"
              >
                변경할 상태
              </label>
              <select
                id="admin-reason-status"
                ref={firstFocusableRef}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={pending}
                className={[
                  'h-[44px] px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
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
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-reason-text"
                className="text-[13px] font-semibold text-gray-700"
              >
                사유 <span className="text-red-500" aria-hidden="true">*</span>
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
                  'px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
                  'placeholder:text-gray-400',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedReason.length === 0 ? 'border-gray-200' : 'border-gray-300',
                ].join(' ')}
                aria-required="true"
                aria-describedby="admin-reason-char-count"
              />
              <p
                id="admin-reason-char-count"
                className={[
                  'text-[11px] text-right tabular-nums',
                  reason.length >= REASON_MAX ? 'text-red-500' : 'text-gray-400',
                ].join(' ')}
                aria-live="polite"
              >
                {reason.length} / {REASON_MAX}
              </p>
            </div>

            {/* Required hint */}
            {trimmedReason.length === 0 && reason.length > 0 && (
              <p className="text-[12px] text-red-500" role="alert">
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
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
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
                  : 'bg-blue-200 text-white cursor-not-allowed',
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
