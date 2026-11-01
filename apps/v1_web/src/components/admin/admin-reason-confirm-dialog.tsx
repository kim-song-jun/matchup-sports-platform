'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';

interface AdminReasonConfirmDialogProps {
  open: boolean;
  title: string;
  /** 무엇이 바뀌는지 — 문장이나 목록. */
  description: ReactNode;
  reasonLabel: string;
  reasonPlaceholder: string;
  submitLabel: string;
  pendingLabel: string;
  /** danger 는 되돌리기 어려운 처리(붉은 버튼), primary 는 그 밖의 확정 처리. */
  tone?: 'danger' | 'primary';
  /** 요청이 진행 중인 동안 닫기·재제출을 잠근다. */
  pending: boolean;
  /** 앞뒤 공백을 뺀, 비어 있지 않은 사유로만 불린다. */
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

const REASON_MAX = 500;

const SUBMIT_TONE: Record<NonNullable<AdminReasonConfirmDialogProps['tone']>, string> = {
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-500',
  primary: 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-500',
};

/** 사유를 받아 한 번 더 확인하는 어드민 모달. 상태 선택이 필요하면 AdminReasonModal 을 쓴다. */
export function AdminReasonConfirmDialog({
  open,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  submitLabel,
  pendingLabel,
  tone = 'danger',
  pending,
  onSubmit,
  onClose,
}: AdminReasonConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [missingReason, setMissingReason] = useState(false);
  const titleId = useId();
  const reasonId = useId();
  const errorId = useId();
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLTextAreaElement, HTMLFormElement>({
    open,
    onClose,
    pending,
  });

  useEffect(() => {
    if (open) {
      setReason('');
      setMissingReason(false);
    }
  }, [open]);

  if (!mounted) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setMissingReason(true);
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div
      className={`tm-modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        noValidate
        className={`tm-modal-panel w-full max-w-[440px] rounded-2xl bg-[var(--card-surface)] p-5 shadow-[var(--shadow-modal)]${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
          {title}
        </h2>
        <div className="mt-2 text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]">{description}</div>
        <label className="mt-4 block text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]" htmlFor={reasonId}>
          {reasonLabel}
        </label>
        <textarea
          ref={initialFocusRef}
          id={reasonId}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setMissingReason(false);
          }}
          className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-[var(--border)] px-3 py-2 text-[length:var(--font-size-body-sm)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder={reasonPlaceholder}
          maxLength={REASON_MAX}
          disabled={pending}
          aria-required="true"
          aria-invalid={missingReason}
          aria-describedby={missingReason ? errorId : undefined}
        />
        {missingReason ? (
          <p id={errorId} role="alert" className="mt-1 text-[length:var(--font-size-caption)] text-[var(--red700)]">
            사유를 입력해 주세요.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`inline-flex h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${SUBMIT_TONE[tone]}`}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
