'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type {
  V1LeagueFixtureParticipantsResponse,
  V1LeagueResultParticipantStat,
} from '@/types/league-match';

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
  /**
   * 득점자 선택 목록(선택). 부모가 useV1LeagueFixtureParticipants 로 가져와 넘긴다 —
   * 없으면(로딩·실패 포함) 득점 기록 섹션 자체를 숨기고 기존 스코어-사유 흐름만 남긴다.
   */
  participants?: V1LeagueFixtureParticipantsResponse | null;
  onSubmit: (
    homeScore: number,
    awayScore: number,
    reason: string,
    participantStats: V1LeagueResultParticipantStat[],
  ) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

/** 모달 안에서 편집 중인 한 선수분 득점·도움 행. */
interface ScorerRowState {
  participantId: string;
  side: 'home' | 'away';
  name: string;
  goals: string;
  assists: string;
}

const REASON_MAX = 500;

const scoreInputClass =
  'h-[44px] w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-center text-lg font-semibold tabular-nums text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

const statInputClass =
  'h-[44px] w-16 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-2 text-center text-sm font-semibold tabular-nums text-[var(--text-strong)] placeholder:font-normal placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function LeagueResultEntryModal({
  open,
  mode,
  homeTeamName,
  awayTeamName,
  weekLabel,
  currentHomeScore,
  currentAwayScore,
  participants,
  onSubmit,
  onClose,
  pending = false,
}: LeagueResultEntryModalProps) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');
  const [scorerRows, setScorerRows] = useState<ScorerRowState[]>([]);

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
      setScorerRows([]);
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

  // 득점·도움 행 파싱 — 빈 문자열은 0으로 본다(행을 추가만 하고 안 채운 상태).
  // 상한 99는 서버 DTO(@Max(99))와 같은 값 — 클라이언트에서 미리 막아 400 왕복을 줄인다.
  const parseStat = (value: string) => {
    if (value.trim() === '') return 0;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
  };
  let scorerRowsInvalid = false;
  const sums = { home: { goals: 0, assists: 0 }, away: { goals: 0, assists: 0 } };
  for (const row of scorerRows) {
    const goals = parseStat(row.goals);
    const assists = parseStat(row.assists);
    if (goals === null || assists === null) {
      scorerRowsInvalid = true;
      continue;
    }
    sums[row.side].goals += goals;
    sums[row.side].assists += assists;
  }
  // 서버 검증과 동일 규칙(league-result-participants.ts): 득점 합은 팀 스코어를,
  // 도움 합은 **기록된 득점 합**을 넘을 수 없다(자책골·미기록 득점 여지로 미만은 허용).
  const scorerSumExceeds =
    scoresValid &&
    (sums.home.goals > parsedHome ||
      sums.away.goals > parsedAway ||
      sums.home.assists > sums.home.goals ||
      sums.away.assists > sums.away.goals);

  const canSubmit =
    scoresValid && trimmedReason.length > 0 && !pending && !scorerRowsInvalid && !scorerSumExceeds;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || parsedHome === null || parsedAway === null) return;
    const participantStats: V1LeagueResultParticipantStat[] = [];
    for (const row of scorerRows) {
      const goals = parseStat(row.goals) ?? 0;
      const assists = parseStat(row.assists) ?? 0;
      if (goals === 0 && assists === 0) continue;
      participantStats.push({
        participantId: row.participantId,
        goals,
        ...(assists === 0 ? {} : { assists }),
      });
    }
    onSubmit(parsedHome, parsedAway, trimmedReason, participantStats);
  };

  const addScorerRow = (side: 'home' | 'away', participantId: string) => {
    if (participantId === '' || participants == null) return;
    const pool = side === 'home' ? participants.home.players : participants.away.players;
    const player = pool.find((option) => option.participantId === participantId);
    if (player === undefined || scorerRows.some((row) => row.participantId === participantId)) return;
    setScorerRows((rows) => [...rows, { participantId, side, name: player.name, goals: '', assists: '' }]);
  };

  const updateScorerRow = (participantId: string, field: 'goals' | 'assists', value: string) => {
    setScorerRows((rows) =>
      rows.map((row) => (row.participantId === participantId ? { ...row, [field]: value } : row)),
    );
  };

  const removeScorerRow = (participantId: string) => {
    setScorerRows((rows) => rows.filter((row) => row.participantId !== participantId));
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
          {/* 득점자 행이 늘어나면 세로로 길어진다 — 본문만 스크롤하고 헤더·푸터는 고정. */}
          <div className="px-5 py-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
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

            {/* 득점·도움 기록 (선택) — 리그 득점왕·도움왕의 유일한 공급 경로(2026-08-25
                사용자 확정). participants 미제공(로딩·실패)이면 섹션을 숨겨 기존
                스코어-사유 흐름을 그대로 둔다. */}
            {participants != null && (
              <fieldset className="flex flex-col gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
                <legend className="px-1 text-[13px] font-semibold text-[var(--text-body)]">
                  득점·도움 기록 <span className="font-normal text-[var(--text-muted)]">(선택)</span>
                </legend>
                {(
                  [
                    ['home', participants.home],
                    ['away', participants.away],
                  ] as const
                ).map(([side, team]) => {
                  const addedIds = new Set(scorerRows.map((row) => row.participantId));
                  const options = team.players.filter((player) => !addedIds.has(player.participantId));
                  const sideRows = scorerRows.filter((row) => row.side === side);
                  return (
                    <div key={side} className="flex flex-col gap-2">
                      <p
                        className="truncate text-[12px] font-semibold text-[var(--text-muted)]"
                        title={team.teamName}
                      >
                        {team.teamName}
                      </p>
                      {sideRows.map((row) => (
                        <div key={row.participantId} className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-strong)]"
                            title={row.name}
                          >
                            {row.name}
                          </span>
                          <label className="sr-only" htmlFor={`scorer-goals-${row.participantId}`}>
                            {row.name} 득점
                          </label>
                          <input
                            id={`scorer-goals-${row.participantId}`}
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            inputMode="numeric"
                            placeholder="골"
                            value={row.goals}
                            onChange={(e) => updateScorerRow(row.participantId, 'goals', e.target.value)}
                            disabled={pending}
                            className={statInputClass}
                          />
                          <label className="sr-only" htmlFor={`scorer-assists-${row.participantId}`}>
                            {row.name} 도움
                          </label>
                          <input
                            id={`scorer-assists-${row.participantId}`}
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            inputMode="numeric"
                            placeholder="도움"
                            value={row.assists}
                            onChange={(e) => updateScorerRow(row.participantId, 'assists', e.target.value)}
                            disabled={pending}
                            className={statInputClass}
                          />
                          <button
                            type="button"
                            onClick={() => removeScorerRow(row.participantId)}
                            disabled={pending}
                            aria-label={`${row.name} 기록 제거`}
                            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-[var(--surface-soft)] hover:text-[var(--text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <label className="sr-only" htmlFor={`scorer-add-${side}`}>
                        {team.teamName} 선수 추가
                      </label>
                      <select
                        id={`scorer-add-${side}`}
                        value=""
                        disabled={pending || options.length === 0}
                        onChange={(e) => addScorerRow(side, e.target.value)}
                        className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                      >
                        <option value="">{options.length === 0 ? '추가할 선수가 없어요' : '선수 추가…'}</option>
                        {options.map((player) => (
                          <option key={player.participantId} value={player.participantId}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {scorerSumExceeds && (
                  <p className="text-[12px] text-[var(--red700)]" role="alert">
                    기록 합이 맞지 않아요 — 득점 합은 팀 스코어를, 도움 합은 기록된 득점 합을 넘을 수 없어요.
                  </p>
                )}
              </fieldset>
            )}

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
