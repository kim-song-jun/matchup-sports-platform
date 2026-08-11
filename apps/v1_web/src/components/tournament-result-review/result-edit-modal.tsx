'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  GameResultParticipantInput,
  GameResultParticipantRecord,
  GameResultScore,
  TournamentGameSide,
} from '@/hooks/use-tournament-result-review';
import type { GameLineup } from '@/types/game-operations';

export type ResultEditSubmitInput = {
  score: GameResultScore;
  actualParticipants: GameResultParticipantInput[];
  mvpParticipantId?: string;
  reason: string;
};

export type ResultEditModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel?: string;
  base: {
    score: GameResultScore;
    participants: readonly GameResultParticipantRecord[];
    mvpParticipantId: string | null;
  };
  sides: readonly TournamentGameSide[];
  /** `GET /games/:gameId/lineups`(`GamesService.listLineups()`)의 라인업 스냅샷 --
   * 실명 표시에 쓴다. 아직 로딩 중이거나 없으면 빈 배열을 넘기면 된다(폴백은
   * `participantLabel`이 알아서 처리한다). */
  lineups: readonly GameLineup[];
  submitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (input: ResultEditSubmitInput) => void;
  onCancel: () => void;
};

type EditableParticipant = GameResultParticipantInput;

function sideLabel(sides: readonly TournamentGameSide[], sideId: string): string {
  const side = sides.find((candidate) => candidate.id === sideId);
  if (!side) return sideId.slice(-6);
  return side.sideKey === 'HOME' ? '홈' : '원정';
}

/**
 * 참가자 id -> "#등번호 이름" 표시 문자열 맵.
 *
 * `GET /games/:gameId/lineups`(라우트는 `apps/v1_api/src/games/games.controller.ts`의
 * `lineups()` -- Task 14가 찾던 별도 `games/lineups` 디렉터리가 아니라
 * `games.controller.ts` 안에 이미 있다)가 돌려주는 각 라인업의 `participants[].id`는
 * 결과 기록 쪽 `GameResultParticipantRecord.participantId`와 같은 값을 가리킨다 --
 * `GamesService`가 결과 참가자 행을 만들 때 `participantId: participant.id`로
 * `V1GameParticipant.id`를 그대로 복사해서 저장하기 때문(`games.service.ts`의
 * `submitResult`류 메서드 참고). 운영 콘솔의 `recorded-event-list.tsx`가 같은
 * 라인업 응답으로 `playerName` 맵을 만드는 것과 동일한 관례를 따른다.
 */
function buildParticipantNameMap(lineups: readonly GameLineup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lineup of lineups) {
    for (const participant of lineup.participants) {
      const jersey = participant.jerseyNumber !== null ? `#${participant.jerseyNumber} ` : '';
      map.set(participant.id, `${jersey}${participant.displayNameSnapshot}`);
    }
  }
  return map;
}

/** 라인업에 없는 참가자(팀 이탈 등으로 로스터에서 빠졌거나, 아직 라인업 응답이
 * 로딩 중인 경우)는 이름을 지어내지 않고 기존 폴백(사이드 + id 뒷자리)을 쓰되,
 * 폴백임이 드러나도록 안내 문구를 덧붙인다 -- 조용히 빈칸으로 두지 않는다. */
function participantLabel(
  sides: readonly TournamentGameSide[],
  nameMap: ReadonlyMap<string, string>,
  participantId: string,
  sideId: string,
): string {
  const name = nameMap.get(participantId);
  if (name) return `${sideLabel(sides, sideId)} · ${name}`;
  return `${sideLabel(sides, sideId)} · 참가자 ${participantId.slice(-6)} (라인업에 없음)`;
}

function toEditable(record: GameResultParticipantRecord): EditableParticipant {
  return {
    participantId: record.participantId,
    sideId: record.sideId,
    started: record.started,
    minutesPlayed: record.minutesPlayed ?? undefined,
    goals: record.goals,
    cards: { ...record.cards },
    goalkeeper: record.goalkeeper,
  };
}

/**
 * ResultEditModal -- shared score + per-participant stat + MVP + reason form
 * for both `POST /games/:gameId/corrections` (correction) and
 * `POST .../supersede-and-submit` (resubmission after reject/
 * supplement_requested). Pre-populated from the base revision being
 * corrected/resubmitted so the operator edits an existing, known-good
 * participant set rather than assembling one from scratch -- adding/removing
 * roster members is out of scope for this pass (it needs a full roster
 * listing endpoint this lane does not own; see the implementation report).
 *
 * Always shows a before -> after diff summary for the score and any changed
 * participant stat before the confirm button is enabled, satisfying "every
 * correction always captures reason and diff".
 */
export function ResultEditModal({
  open,
  title,
  message,
  confirmLabel,
  reasonLabel = '사유',
  base,
  sides,
  lineups,
  submitting = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ResultEditModalProps) {
  const idPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Lazy initial state seeded from `base` exactly once at mount. This modal
  // is always conditionally rendered by its callers (`{correctionFormOpen &&
  // currentOfficial ? <ResultEditModal .../> : null}` /
  // `{resubmitTarget ? <ResultEditModal .../> : null}`), so a fresh instance
  // -- and therefore a fresh `useState` seed -- is created every time it
  // opens. Resetting these fields from an effect keyed on the `base` PROP
  // (rather than only at mount) would be actively wrong here: `base` is a new
  // object literal on every parent re-render (e.g. while a mutation's
  // `isPending` flips true/false during submit), so such an effect would
  // silently discard in-progress edits on any unrelated parent re-render
  // while this modal stays mounted.
  const [home, setHome] = useState(base.score.home);
  const [away, setAway] = useState(base.score.away);
  const [participants, setParticipants] = useState<EditableParticipant[]>(() =>
    base.participants.map(toEditable),
  );
  const [mvpParticipantId, setMvpParticipantId] = useState<string>(base.mvpParticipantId ?? '');
  const [reason, setReason] = useState('');

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const id = setTimeout(() => {
      // Guard against clobbering focus the user (or the focus trap) has
      // already moved into the dialog by the time this fires -- e.g. typing
      // straight into the reason textarea right after the dialog opens.
      // Without this check, this unconditional `.focus()` steals focus back
      // to the home-score input mid-keystroke, silently dropping the tail of
      // whatever the user was typing elsewhere in the form.
      if (dialogRef.current?.contains(document.activeElement)) return;
      firstFieldRef.current?.focus();
    }, 60);
    return () => {
      clearTimeout(id);
      // Restore focus on unmount (WCAG 2.4.3) -- this component is always
      // conditionally rendered by its caller (see the state-initialization
      // comment above), so unmount IS the "closed" transition; there is no
      // separate `open:true->false` prop toggle to key this off of.
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    };
    // Mount-only: see the state-initialization comment above for why this
    // must not re-run when `base` changes identity on an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const participantNameMap = useMemo(() => buildParticipantNameMap(lineups), [lineups]);

  const trimmedReason = reason.trim();
  const scoreChanged = home !== base.score.home || away !== base.score.away;
  const participantDiffs = useMemo(
    () =>
      participants.filter((participant, index) => {
        const original = base.participants[index];
        if (!original) return true;
        return (
          participant.goals !== original.goals ||
          participant.cards.yellow !== original.cards.yellow ||
          participant.cards.red !== original.cards.red ||
          participant.started !== original.started ||
          participant.goalkeeper !== original.goalkeeper ||
          (participant.minutesPlayed ?? null) !== (original.minutesPlayed ?? null)
        );
      }),
    [participants, base.participants],
  );
  const canSubmit = trimmedReason.length > 0 && !submitting;

  function updateParticipant(index: number, patch: Partial<EditableParticipant>) {
    setParticipants((current) =>
      current.map((participant, i) => (i === index ? { ...participant, ...patch } : participant)),
    );
  }

  if (!open) return null;

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
        aria-labelledby={`${idPrefix}-title`}
        aria-describedby={`${idPrefix}-message`}
        className="w-full max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface, #fff)',
          boxShadow: '0 8px 32px rgba(20,28,45,0.14)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <p id={`${idPrefix}-title`} className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 8 }}>
            {title}
          </p>
          <p id={`${idPrefix}-message`} className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor={`${idPrefix}-home`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                홈 점수
              </label>
              <input
                ref={firstFieldRef}
                id={`${idPrefix}-home`}
                type="number"
                inputMode="numeric"
                min={0}
                className="tm-input"
                style={{ width: '100%', minHeight: 44 }}
                value={home}
                onChange={(event) => setHome(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor={`${idPrefix}-away`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                원정 점수
              </label>
              <input
                id={`${idPrefix}-away`}
                type="number"
                inputMode="numeric"
                min={0}
                className="tm-input"
                style={{ width: '100%', minHeight: 44 }}
                value={away}
                onChange={(event) => setAway(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </div>

          {scoreChanged ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue500)', marginBottom: 16 }}>
              점수 변경: {base.score.home}:{base.score.away} → {home}:{away}
            </p>
          ) : null}

          <p className="tm-text-label" style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>
            참가자별 기록
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {participants.map((participant, index) => (
              <div key={participant.participantId} className="tm-card" style={{ padding: 12 }}>
                <p className="tm-text-caption" style={{ fontWeight: 600, marginBottom: 8 }}>
                  {participantLabel(sides, participantNameMap, participant.participantId, participant.sideId)}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    득점
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="tm-input"
                      style={{ width: 56, minHeight: 40 }}
                      value={participant.goals}
                      onChange={(event) =>
                        updateParticipant(index, { goals: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                  </label>
                  <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    경고
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="tm-input"
                      style={{ width: 56, minHeight: 40 }}
                      value={participant.cards.yellow}
                      onChange={(event) =>
                        updateParticipant(index, {
                          cards: { ...participant.cards, yellow: Math.max(0, Number(event.target.value) || 0) },
                        })
                      }
                    />
                  </label>
                  <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    퇴장
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="tm-input"
                      style={{ width: 56, minHeight: 40 }}
                      value={participant.cards.red}
                      onChange={(event) =>
                        updateParticipant(index, {
                          cards: { ...participant.cards, red: Math.max(0, Number(event.target.value) || 0) },
                        })
                      }
                    />
                  </label>
                  <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={participant.started}
                      onChange={(event) => updateParticipant(index, { started: event.target.checked })}
                    />
                    선발
                  </label>
                  <label className="tm-text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={participant.goalkeeper}
                      onChange={(event) => updateParticipant(index, { goalkeeper: event.target.checked })}
                    />
                    골키퍼
                  </label>
                </div>
              </div>
            ))}
          </div>

          {participantDiffs.length > 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue500)', marginBottom: 16 }}>
              참가자 기록 변경: {participantDiffs.length}명
            </p>
          ) : null}

          <div style={{ marginBottom: 20 }}>
            <label htmlFor={`${idPrefix}-mvp`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
              MVP (선택)
            </label>
            <select
              id={`${idPrefix}-mvp`}
              className="tm-input"
              style={{ width: '100%', minHeight: 44 }}
              value={mvpParticipantId}
              onChange={(event) => setMvpParticipantId(event.target.value)}
            >
              <option value="">선정 안 함</option>
              {participants.map((participant) => (
                <option key={participant.participantId} value={participant.participantId}>
                  {participantLabel(sides, participantNameMap, participant.participantId, participant.sideId)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${idPrefix}-reason`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
              {reasonLabel}
            </label>
            <textarea
              id={`${idPrefix}-reason`}
              rows={3}
              className="tm-input"
              style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="사유를 입력해 주세요"
            />
          </div>

          {errorMessage ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: 12 }}>
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '16px 24px 24px', flexShrink: 0 }}>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-primary"
            style={{ flex: 1, minHeight: 44 }}
            disabled={!canSubmit}
            aria-busy={submitting ? 'true' : undefined}
            onClick={() => {
              if (!canSubmit) return;
              onConfirm({
                score: home === base.score.home && away === base.score.away
                  ? base.score
                  : { ...base.score, home, away },
                actualParticipants: participants,
                ...(mvpParticipantId ? { mvpParticipantId } : {}),
                reason: trimmedReason,
              });
            }}
          >
            {submitting ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
