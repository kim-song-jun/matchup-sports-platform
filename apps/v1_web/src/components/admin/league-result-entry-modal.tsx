'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// U1(A안 "확정 다이얼로그") — 리그 대진 결과 입력·정정 모달. admin-reason-modal.tsx의
// dialog/focus-trap/ESC/backdrop/포커스복원 마크업을 그대로 본떠 만들되, select 대신
// 홈/원정 44px 숫자 입력 2개를 쓴다. 정정 모드에서는 확정 전 "전 → 후" 비교를 보여준다
// — 사용자가 확정한 이 안의 존재 이유라 빼먹으면 안 된다.

interface LeagueResultEntryModalProps {
  open: boolean;
  /** 'entry' — 아직 결과가 없는 대진에 신규 입력. 'correction' — 이미 OFFICIAL 인 결과를 정정. */
  mode: 'entry' | 'correction';
  homeTeamName: string;
  awayTeamName: string;
  /** 대진 표의 title(예: "가을 풋살 리그 1주차"). 헤더에 매치업과 함께 보여준다. */
  weekLabel: string;
  /** 정정 모드일 때만 의미가 있다 — 현재 공식 스코어("전"). */
  currentHomeScore?: number | null;
  currentAwayScore?: number | null;
  onSubmit: (homeScore: number, awayScore: number, reason: string) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

const REASON_MAX = 500;

const scoreInputClass =
  'h-[44px] w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-center text-lg font-semibold tabular-nums text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function LeagueResultEntryModal({
  open,
  mode,
  homeTeamName,
  awayTeamName,
  weekLabel,
  currentHomeScore,
  currentAwayScore,
  onSubmit,
  onClose,
  pending = false,
}: LeagueResultEntryModalProps) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);
  /** Saved reference to the element that was focused before the modal opened (for focus restore on close) */
  const previousFocusRef = useRef<Element | null>(null);

  // Reset form whenever the modal opens (또는 모드가 바뀌면 — 같은 대진이라도 신규↔정정
  // 전환 시 이전 입력값이 새 모드에 새어 들어가면 안 된다).
  useEffect(() => {
    if (open) {
      setHomeScore('');
      setAwayScore('');
      setReason('');
    }
  }, [open, mode]);

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
  const parsedHome = homeScore.trim() === '' ? null : Number(homeScore);
  const parsedAway = awayScore.trim() === '' ? null : Number(awayScore);
  const scoresValid =
    parsedHome !== null &&
    Number.isInteger(parsedHome) &&
    parsedHome >= 0 &&
    parsedAway !== null &&
    Number.isInteger(parsedAway) &&
    parsedAway >= 0;
  const canSubmit = scoresValid && trimmedReason.length > 0 && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || parsedHome === null || parsedAway === null) return;
    onSubmit(parsedHome, parsedAway, trimmedReason);
  };

  const title = mode === 'correction' ? '결과 정정' : '결과 입력';
  const hasCurrentScore = mode === 'correction' && currentHomeScore != null && currentAwayScore != null;

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
        aria-labelledby="league-result-entry-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 id="league-result-entry-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
              {title}
            </h2>
            {/* 요구사항 4: 헤더에 '{홈팀} vs {원정팀}' + 주차. */}
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {homeTeamName} vs {awayTeamName} · {weekLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex shrink-0 items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* 요구사항 3: 정정 모드는 확정 전 전→후 비교를 보여준다 — 이 안의 존재 이유. */}
            {hasCurrentScore && (
              <div className="rounded-xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] px-4 py-3">
                <p className="mb-2 text-[13px] font-semibold text-[var(--orange700)]">현재 공식 스코어와 비교</p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-[var(--text-muted)]">전</span>
                    <span className="text-lg font-semibold tabular-nums text-[var(--text-strong)]">
                      {currentHomeScore} : {currentAwayScore}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    →
                  </span>
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-[var(--blue700)]">후</span>
                    <span className="text-lg font-semibold tabular-nums text-[var(--blue700)]">
                      {scoresValid ? `${parsedHome} : ${parsedAway}` : '— : —'}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Score inputs */}
            <div className="flex items-end justify-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <label
                  htmlFor="league-result-home-score"
                  className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                  title={homeTeamName}
                >
                  {homeTeamName}
                </label>
                <input
                  id="league-result-home-score"
                  ref={firstFocusableRef}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  disabled={pending}
                  className={scoreInputClass}
                />
              </div>
              <span className="pb-3 text-lg font-semibold text-[var(--text-muted)]" aria-hidden="true">
                :
              </span>
              <div className="flex flex-col items-center gap-1.5">
                <label
                  htmlFor="league-result-away-score"
                  className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                  title={awayTeamName}
                >
                  {awayTeamName}
                </label>
                <input
                  id="league-result-away-score"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  disabled={pending}
                  className={scoreInputClass}
                />
              </div>
            </div>

            {/* Reason textarea */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="league-result-reason" className="text-[13px] font-semibold text-[var(--text-body)]">
                사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="league-result-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                disabled={pending}
                placeholder={mode === 'correction' ? '정정 사유를 입력해 주세요.' : '결과 입력 사유를 입력해 주세요.'}
                className={[
                  'px-3 py-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-gray-400',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedReason.length === 0 ? 'border-[var(--border)]' : 'border-[var(--border-strong)]',
                ].join(' ')}
                aria-required="true"
                aria-describedby="league-result-reason-char-count"
              />
              <p
                id="league-result-reason-char-count"
                className={[
                  'text-[length:var(--font-size-caption)] text-right tabular-nums',
                  reason.length >= REASON_MAX ? 'text-[var(--red700)]' : 'text-gray-400',
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
