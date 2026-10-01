'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';

/** 팀 만들기·수정과 같은 상한(서버 DTO `@MaxLength(50)`). */
const NAME_MAX = 50;
const REASON_MAX = 500;

interface AdminTeamRenameModalProps {
  open: boolean;
  currentName: string;
  onSubmit: (name: string, reason: string) => void;
  onClose: () => void;
  pending?: boolean;
  /** 서버가 거절한 이유(같은 이름의 팀 등). */
  error?: ReactNode;
}

const FIELD_CLASS = [
  'text-[length:var(--font-size-body-sm)] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
  'placeholder:text-[var(--text-muted)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50',
].join(' ');

/** 보관된 팀의 이름 변경 — `AdminReasonModal` 과 같은 틀에 상태 선택 대신 새 이름 칸이 있다. */
export function AdminTeamRenameModal({ open, currentName, onSubmit, onClose, pending = false, error }: AdminTeamRenameModalProps) {
  const titleId = useId();
  const nameId = useId();
  const nameHintId = useId();
  const reasonId = useId();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLInputElement>({
    open,
    onClose,
    pending,
  });

  useEffect(() => {
    if (open) {
      setName(currentName);
      setReason('');
    }
  }, [open, currentName]);

  if (!mounted) return null;

  const trimmedName = name.trim();
  const trimmedReason = reason.trim();
  const unchanged = trimmedName === currentName.trim();
  const canSubmit = trimmedName.length > 0 && !unchanged && trimmedReason.length > 0 && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmedName, trimmedReason);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            보관 팀 이름 바꾸기
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={nameId} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                새 팀 이름 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <input
                id={nameId}
                ref={initialFocusRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                disabled={pending}
                aria-required="true"
                aria-describedby={nameHintId}
                className={`h-[44px] px-3 ${FIELD_CLASS}`}
              />
              <p id={nameHintId} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                {unchanged && trimmedName.length > 0
                  ? '지금 이름과 달라야 해요.'
                  : '같은 종목·지역에 이미 있는 이름은 쓸 수 없어요.'}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={reasonId} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                disabled={pending}
                placeholder="처리 사유를 입력해 주세요."
                aria-required="true"
                className={`px-3 py-3 resize-none ${FIELD_CLASS}`}
              />
            </div>

            {error ? (
              <div role="alert" className="rounded-xl bg-[var(--red50)] px-3 py-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="tm-on-tint flex-1 h-[48px] rounded-xl text-[length:var(--font-size-body)] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[length:var(--font-size-body)] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
            >
              {pending ? '처리 중…' : '이름 바꾸기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
