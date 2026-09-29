'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ApplyGameRosterBatch, type V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { extractErrorCode } from '@/lib/error-message';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { withFromPath } from '@/lib/session-storage';
import type { GameRosterAdjustmentReason } from '@/lib/v1-status-labels';
import { draftToChanges, type GameRosterDraft } from './game-roster-draft';
import { GAME_ROSTER_PLAYING_HINT, GameRosterPlayerRow, GameRosterPlayingCheckbox } from './game-roster-player-row';
import { GameRosterReasonChips } from './game-roster-reason-chips';

/** 빠질 선수 → 고른 사유(없으면 null). */
type Leaving = Readonly<Record<string, GameRosterAdjustmentReason | null>>;

/**
 * 빠른 선택 시트(Task 178 ③) — 경기 상세에서 "이번 경기 빠지는 선수"만 골라 저장한다.
 * 되돌리기·결장·출전정지처럼 긴 편집은 경기 명단 화면(②)의 몫이라 링크로 넘긴다.
 * 뒤로가기·ESC·배경으로 닫히고(저장 중엔 잠김), 포커스는 시트 안에 갇힌다.
 */
export function GameRosterQuickSheet({
  open,
  teamId,
  roster,
  onClose,
  onSaved,
  onStale,
}: {
  open: boolean;
  teamId: string;
  roster: V1GameRosterView;
  onClose: () => void;
  onSaved: (count: number) => void;
  /** 마감·명단 변경으로 화면이 낡았을 때 — 부모가 명단을 다시 받는다. */
  onStale: () => void;
}) {
  const batch = useV1ApplyGameRosterBatch(teamId);
  const currentHref = useCurrentHref();
  const [leaving, setLeaving] = useState<Leaving>({});
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLButtonElement, HTMLElement>({
    open,
    onClose,
    pending: batch.isPending,
    exitMs: 220, // .tm-filter-sheet.is-closing 과 같은 길이.
  });

  useEffect(() => {
    if (!open) return;
    setLeaving({});
    setError(null);
  }, [open]);

  const changes = useMemo(() => {
    const draft: GameRosterDraft = Object.fromEntries(
      Object.entries(leaving).map(([userId, reason]) => [userId, { op: 'EXCLUDE' as const, reason }]),
    );
    return draftToChanges(draft, roster);
  }, [leaving, roster]);

  if (!mounted) return null;

  function toggle(userId: string, leave: boolean) {
    setError(null);
    setLeaving((current) => {
      const next = { ...current };
      if (leave) next[userId] = null;
      else delete next[userId];
      return next;
    });
  }

  async function save() {
    setError(null);
    try {
      await batch.mutateAsync(changes);
      onSaved(changes.length);
    } catch (caught) {
      const code = extractErrorCode(caught);
      if (code === 'LINEUP_DEADLINE_PASSED' || code === 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER') {
        setLeaving({});
        onStale();
      }
      setError(gameRosterErrorMessage(caught, '명단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  return (
    <>
      <div aria-hidden="true" className={`tm-filter-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick} />
      <div className="tm-filter-layer">
        <section
          ref={dialogRef}
          className={`tm-filter-sheet${closing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tm-filter-sheet-handle" />
          <div className="tm-filter-sheet-head">
            <h2 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
              이번 경기 빠지는 선수
              <span className="tm-text-caption" style={{ marginLeft: 8, fontWeight: 400 }}>
                {changes.length}명
              </span>
            </h2>
            <button
              ref={initialFocusRef}
              type="button"
              aria-label="닫기"
              onClick={onClose}
              disabled={batch.isPending}
              className="tm-btn tm-btn-icon tm-btn-ghost"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {roster.participants.length === 0 ? (
            <p className="tm-text-caption" style={{ margin: '12px 0 0' }}>
              출전하는 선수가 없어요.
            </p>
          ) : (
            <>
              <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
                {GAME_ROSTER_PLAYING_HINT}
              </p>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {roster.participants.map((row) => {
                  const isLeaving = row.userId in leaving;
                  const reason = leaving[row.userId] ?? null;
                  return (
                    <li key={row.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <GameRosterPlayerRow
                        jerseyNumber={row.jerseyNumber}
                        displayName={row.displayName}
                        accountLinked={row.accountLinked}
                        status={isLeaving ? 'EXCLUDED' : 'PARTICIPATING'}
                        reason={reason}
                        trailing={
                          <GameRosterPlayingCheckbox
                            displayName={row.displayName}
                            playing={!isLeaving}
                            onChange={(playing) => toggle(row.userId, !playing)}
                          />
                        }
                      />
                      {isLeaving ? (
                        <GameRosterReasonChips
                          playerName={row.displayName}
                          value={reason}
                          onChange={(next) => setLeaving((current) => ({ ...current, [row.userId]: next }))}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="tm-text-caption" style={{ margin: '12px 0 0' }}>
            전체 명단은{' '}
            <Link
              href={withFromPath(gameRosterScreenPath(teamId, roster.gameId), currentHref)}
              style={{ color: 'var(--blue700)', fontWeight: 700, textDecoration: 'underline' }}
            >
              경기 명단
            </Link>
            에서 볼 수 있어요.
          </p>
          {error !== null ? (
            <div style={{ marginTop: 12 }}>
              <AlertBanner message={error} />
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Button
              variant="primary"
              size="lg"
              block
              loading={batch.isPending}
              disabled={changes.length === 0 || !roster.editable}
              onClick={() => void save()}
            >
              {changes.length === 0 ? '빠지는 선수를 골라 주세요' : `${changes.length}명 빼고 저장`}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
