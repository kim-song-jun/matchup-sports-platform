'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';
import type { V1LeagueMatchDisputeResolution } from '@/types/league-match';

// D2 (E4): 어드민 이의 수락 처리 모달 — 정정(홈/원정 스코어 입력 + 전→후 비교) / 무효
// (스코어 없음) 두 경로를 하나의 다이얼로그에서 고른다. accessibility 마크업(dialog/
// focus-trap/ESC/backdrop/포커스복원)은 league-result-entry-modal.tsx 를 그대로 본떴다
// — 정정 경로의 "전→후" 비교 카드도 그 모달의 패턴을 재사용한다(사용자 확정: 표준 UI).

interface LeagueDisputeResolveModalProps {
  open: boolean;
  leagueTitle: string;
  homeTeamName: string;
  awayTeamName: string;
  reason: string;
  /** 이의 제기 당시 걸려 있던 공식 스코어("전"). null이면 아직 공식 결과가 없다는 뜻이라
   *  비교 카드를 숨긴다. */
  currentHomeScore: number | null;
  currentAwayScore: number | null;
  onSubmit: (resolution: V1LeagueMatchDisputeResolution, note: string, homeScore?: number, awayScore?: number) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

const NOTE_MAX = 500;

const scoreInputClass =
  'h-[44px] w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-center text-lg font-semibold tabular-nums text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function LeagueDisputeResolveModal({
  open,
  leagueTitle,
  homeTeamName,
  awayTeamName,
  reason,
  currentHomeScore,
  currentAwayScore,
  onSubmit,
  onClose,
  pending = false,
}: LeagueDisputeResolveModalProps) {
  const [resolution, setResolution] = useState<V1LeagueMatchDisputeResolution>('correction');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [note, setNote] = useState('');

  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLButtonElement>({
    open,
    onClose,
    pending,
  });

  // Reset form whenever the modal opens
  useEffect(() => {
    if (open) {
      setResolution('correction');
      setHomeScore('');
      setAwayScore('');
      setNote('');
    }
  }, [open]);

  if (!open) return null;

  const trimmedNote = note.trim();
  const parsedHome = homeScore.trim() === '' ? null : Number(homeScore);
  const parsedAway = awayScore.trim() === '' ? null : Number(awayScore);
  const scoresValid =
    resolution === 'void' ||
    (parsedHome !== null &&
      Number.isInteger(parsedHome) &&
      parsedHome >= 0 &&
      parsedAway !== null &&
      Number.isInteger(parsedAway) &&
      parsedAway >= 0);
  const canSubmit = scoresValid && trimmedNote.length > 0 && !pending;
  const hasCurrentScore = resolution === 'correction' && currentHomeScore != null && currentAwayScore != null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (resolution === 'correction') {
      if (parsedHome === null || parsedAway === null) return;
      onSubmit('correction', trimmedNote, parsedHome, parsedAway);
    } else {
      onSubmit('void', trimmedNote);
    }
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
        aria-labelledby="league-dispute-resolve-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 id="league-dispute-resolve-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
              이의 수락 처리
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
            {/* 제기 사유 — 운영자가 무엇에 이의를 걸었는지 처리 전에 다시 확인한다. */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-3">
              <p className="text-[11px] font-semibold text-[var(--text-muted)]">제기 사유</p>
              <p className="mt-1 text-[13px] text-[var(--text-strong)] whitespace-pre-wrap break-words">{reason}</p>
            </div>

            {/* Resolution toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--text-body)]">처리 방식</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="처리 방식">
                <button
                  ref={initialFocusRef}
                  type="button"
                  role="radio"
                  aria-checked={resolution === 'correction'}
                  onClick={() => setResolution('correction')}
                  disabled={pending}
                  className={[
                    'h-[44px] rounded-xl text-[14px] font-semibold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    resolution === 'correction'
                      ? 'bg-blue-500 text-white'
                      : 'bg-[var(--surface-soft)] text-[var(--text-muted)] border border-[var(--border)]',
                    'disabled:opacity-50',
                  ].join(' ')}
                >
                  정정
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={resolution === 'void'}
                  onClick={() => setResolution('void')}
                  disabled={pending}
                  className={[
                    'h-[44px] rounded-xl text-[14px] font-semibold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    resolution === 'void'
                      ? 'bg-blue-500 text-white'
                      : 'bg-[var(--surface-soft)] text-[var(--text-muted)] border border-[var(--border)]',
                    'disabled:opacity-50',
                  ].join(' ')}
                >
                  무효
                </button>
              </div>
            </div>

            {resolution === 'correction' && (
              <>
                {/* 전→후 비교 — league-result-entry-modal.tsx 정정 모드와 같은 패턴 */}
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
                      htmlFor="league-dispute-home-score"
                      className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                      title={homeTeamName}
                    >
                      {homeTeamName}
                    </label>
                    <input
                      id="league-dispute-home-score"
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
                      htmlFor="league-dispute-away-score"
                      className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                      title={awayTeamName}
                    >
                      {awayTeamName}
                    </label>
                    <input
                      id="league-dispute-away-score"
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
              </>
            )}

            {resolution === 'void' && (
              <p className="text-[13px] text-[var(--text-muted)]">
                이 대진의 결과를 무효로 처리해요. 순위표에서 자동으로 빠져요.
              </p>
            )}

            {/* Note textarea */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="league-dispute-resolve-note" className="text-[13px] font-semibold text-[var(--text-body)]">
                처리 사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="league-dispute-resolve-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={3}
                disabled={pending}
                placeholder="처리 사유를 입력해 주세요."
                className={[
                  'px-3 py-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedNote.length === 0 ? 'border-[var(--border)]' : 'border-[var(--border-strong)]',
                ].join(' ')}
                aria-required="true"
                aria-describedby="league-dispute-resolve-note-char-count"
              />
              <p
                id="league-dispute-resolve-note-char-count"
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
                canSubmit ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-200 text-white cursor-not-allowed',
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
