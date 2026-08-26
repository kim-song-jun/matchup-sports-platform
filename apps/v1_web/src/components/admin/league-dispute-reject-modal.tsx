'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';

// D2 (E4): 어드민 이의 거부 모달 — 사유만 받는다(결과에는 영향이 없으므로 스코어 입력이
// 필요 없다). 상태 select 를 빼서 "이건 결과를 바꾸지 않는다"는 것을 화면에서도 드러낸다.
// dialog/focus-trap/ESC/backdrop 동작은 useModalA11y 공용 훅.

interface LeagueDisputeRejectModalProps {
  open: boolean;
  leagueTitle: string;
  homeTeamName: string;
  awayTeamName: string;
  reason: string;
  onSubmit: (note: string) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

const NOTE_MAX = 500;

export function LeagueDisputeRejectModal({
  open,
  leagueTitle,
  homeTeamName,
  awayTeamName,
  reason,
  onSubmit,
  onClose,
  pending = false,
}: LeagueDisputeRejectModalProps) {
  const [note, setNote] = useState('');

  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLTextAreaElement>({
    open,
    onClose,
    pending,
  });

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open) return null;

  const trimmedNote = note.trim();
  const canSubmit = trimmedNote.length > 0 && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmedNote);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      aria-hidden={!open}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="league-dispute-reject-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 id="league-dispute-reject-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
              이의 거부
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {homeTeamName} vs {awayTeamName} · {leagueTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex shrink-0 items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-3">
              <p className="text-[11px] font-semibold text-[var(--text-muted)]">제기 사유</p>
              <p className="mt-1 text-[13px] text-[var(--text-strong)] whitespace-pre-wrap break-words">{reason}</p>
            </div>

            <p className="text-[13px] text-[var(--text-muted)]">이의를 거부해요. 결과는 그대로 유지돼요.</p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="league-dispute-reject-note" className="text-[13px] font-semibold text-[var(--text-body)]">
                거부 사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="league-dispute-reject-note"
                ref={initialFocusRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={3}
                disabled={pending}
                placeholder="거부 사유를 입력해 주세요."
                className={[
                  'px-3 py-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedNote.length === 0 ? 'border-[var(--border)]' : 'border-[var(--border-strong)]',
                ].join(' ')}
                aria-required="true"
                aria-describedby="league-dispute-reject-note-char-count"
              />
              <p
                id="league-dispute-reject-note-char-count"
                className={[
                  'text-[length:var(--font-size-caption)] text-right tabular-nums',
                  note.length >= NOTE_MAX ? 'text-[var(--red700)]' : 'text-[var(--text-muted)]',
                ].join(' ')}
                aria-live="polite"
              >
                {note.length} / {NOTE_MAX}
              </p>
            </div>

            {trimmedNote.length === 0 && note.length > 0 && (
              <p className="text-[12px] text-[var(--red700)]" role="alert">
                공백만 입력하면 제출할 수 없어요.
              </p>
            )}
          </div>

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
                canSubmit ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {pending ? '처리 중…' : '거부하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
