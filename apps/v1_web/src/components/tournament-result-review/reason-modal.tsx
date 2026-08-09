'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type ReasonModalTone = 'default' | 'danger';

export type ReasonModalProps = {
  open: boolean;
  title: string;
  message: string;
  reasonLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ReasonModalTone;
  submitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

/**
 * ReasonModal -- reject/request_supplement/void all require an explicit
 * confirmation step that captures a non-empty reason (officialize's own
 * confirm is a lightweight yes/no via the shared `useConfirm()` from
 * `components/v1-ui/confirm-modal.tsx`, since officialize never takes a
 * `reason` field). Mirrors `ConfirmModal`'s a11y pattern
 * (`components/v1-ui/confirm-modal.tsx`: role="dialog", ESC-to-cancel, focus
 * trap, body scroll lock, focus restore) but with a free-text reason field
 * instead of a fixed confirmation phrase -- every affected backend mutation
 * (`ReviewDecisionGameResultRevisionDto`, `VoidGameResultRevisionDto`)
 * requires `reason` as a non-empty string.
 */
export function ReasonModal({
  open,
  title,
  message,
  reasonLabel = '사유',
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default',
  submitting = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ReasonModalProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-reason-title`;
  const messageId = `${idPrefix}-reason-message`;
  const reasonId = `${idPrefix}-reason-input`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [reason, setReason] = useState('');
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !submitting;

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setReason('');
      const id = setTimeout(() => reasonInputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    const el = previousFocusRef.current;
    if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    previousFocusRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-[420px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface, #fff)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '28px 24px 20px' }}>
          <p id={titleId} className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 10 }}>
            {title}
          </p>
          <p id={messageId} className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {message}
          </p>
          <div style={{ marginTop: 18 }}>
            <label htmlFor={reasonId} className="tm-text-label" style={{ display: 'block', color: 'var(--text-strong)', fontWeight: 600, marginBottom: 8 }}>
              {reasonLabel}
            </label>
            <textarea
              ref={reasonInputRef}
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="tm-input"
              style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
              placeholder="사유를 입력해 주세요"
            />
          </div>
          {errorMessage ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: 10 }}>
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 24px' }}>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`tm-btn tm-btn-md ${isDanger ? 'tm-btn-danger' : 'tm-btn-primary'}`}
            style={{ flex: 1, minHeight: 44 }}
            disabled={!canSubmit}
            aria-busy={submitting ? 'true' : undefined}
            onClick={() => {
              if (canSubmit) onConfirm(trimmedReason);
            }}
          >
            {submitting ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
