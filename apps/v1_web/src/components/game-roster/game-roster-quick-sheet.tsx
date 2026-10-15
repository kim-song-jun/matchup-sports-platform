'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ApplyGameRosterBatch, type V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { gameRosterErrorMessage, isStaleGameRosterWrite } from '@/lib/game-roster-errors';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { withFromPath } from '@/lib/session-storage';
import { compareRosterPlayers, GAME_ROSTER_SCOPE, GAME_ROSTER_TITLE, ROSTER_SAVE_LABEL } from '@/lib/roster-presentation';
import { draftToChanges, type GameRosterDraft } from './game-roster-draft';
import { GAME_ROSTER_PLAYING_HINT, GameRosterPlayerRow, GameRosterPlayingCheckbox } from './game-roster-player-row';
import { GameRosterReasonChips } from './game-roster-reason-chips';

/**
 * 경기 상세의 간편 출전 명단. 체크 해제와 복귀를 전체 명단과 같은 일괄 API 로 저장한다.
 * 기간 결장·출전정지는 여기서 되돌릴 수 없고 전체 명단에서 확인한다.
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
  const [draft, setDraft] = useState<GameRosterDraft>({});
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
    setDraft({});
    setError(null);
  }, [open]);

  const changes = useMemo(() => draftToChanges(draft, roster), [draft, roster]);
  const players = [...roster.participants, ...roster.excluded].sort(compareRosterPlayers);
  const excludedIds = new Set(roster.excluded.map((row) => row.userId));
  const participatingCount = roster.participants.length
    - changes.filter((change) => change.op === 'EXCLUDE').length
    + changes.filter((change) => change.op === 'REVOKE').length;

  if (!mounted) return null;

  function toggle(userId: string, playing: boolean) {
    setError(null);
    setDraft((current) => {
      const next = { ...current };
      if (playing === !excludedIds.has(userId)) delete next[userId];
      else next[userId] = playing ? { op: 'REVOKE' } : { op: 'EXCLUDE', reason: null };
      return next;
    });
  }

  async function save() {
    setError(null);
    try {
      await batch.mutateAsync(changes);
      onSaved(changes.length);
    } catch (caught) {
      if (isStaleGameRosterWrite(caught)) {
        setDraft({});
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
          style={{ touchAction: 'pan-y' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tm-filter-sheet-handle" />
          <div className="tm-filter-sheet-head">
            <h2 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
              {GAME_ROSTER_TITLE}
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
          <p className="tm-text-caption" style={{ margin: '4px 0 8px' }} aria-live="polite">
            출전 {participatingCount}명 · 제외 {players.length - participatingCount}명
          </p>
          <p className="tm-text-caption" style={{ margin: '4px 0 8px' }}>{GAME_ROSTER_SCOPE}</p>
          {players.length === 0 ? (
            <p className="tm-text-caption" style={{ margin: '12px 0 0' }}>
              출전하는 선수가 없어요.
            </p>
          ) : (
            <>
              <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
                {GAME_ROSTER_PLAYING_HINT}
              </p>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {players.map((row) => {
                  const entry = draft[row.userId];
                  const playing = entry === undefined ? !excludedIds.has(row.userId) : entry.op === 'REVOKE';
                  const leaving = entry?.op === 'EXCLUDE' ? entry : null;
                  const reason = leaving?.reason ?? ('reason' in row ? row.reason : null);
                  return (
                    <li key={row.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <GameRosterPlayerRow
                        jerseyNumber={row.jerseyNumber}
                        displayName={row.displayName}
                        accountLinked={row.accountLinked}
                        status={playing ? 'PARTICIPATING' : 'EXCLUDED'}
                        reason={reason}
                        extraBadges={row.goalkeeper ? <span className="tm-text-caption">GK</span> : undefined}
                        trailing={
                          <GameRosterPlayingCheckbox
                            displayName={row.displayName}
                            playing={playing}
                            disabled={batch.isPending || !roster.editable}
                            onChange={(next) => toggle(row.userId, next)}
                          />
                        }
                      />
                      {leaving ? (
                        <GameRosterReasonChips
                          playerName={row.displayName}
                          value={leaving.reason}
                          onChange={(next) => setDraft((current) => ({ ...current, [row.userId]: { op: 'EXCLUDE', reason: next } }))}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="tm-text-caption" style={{ margin: '12px 0 0' }}>
            {roster.unavailable.length + roster.suspended.length > 0
              ? `기간 결장 ${roster.unavailable.length}명 · 출전정지 ${roster.suspended.length}명은 변경할 수 없어요. ` : ''}
            <Link
              href={withFromPath(gameRosterScreenPath(teamId, roster.gameId), currentHref)}
              style={{ color: 'var(--blue700)', fontWeight: 700, textDecoration: 'underline' }}
            >
              등번호·GK와 전체 명단 보기
            </Link>
          </p>
          {error !== null ? (
            <div style={{ marginTop: 12 }}>
              <AlertBanner message={error} />
            </div>
          ) : null}
          <div className="tm-filter-actions" style={{ gridTemplateColumns: '1fr' }}>
            <Button
              variant="primary"
              size="lg"
              block
              loading={batch.isPending}
              disabled={changes.length === 0 || !roster.editable}
              onClick={() => void save()}
            >
              {ROSTER_SAVE_LABEL}{changes.length > 0 ? ` (${changes.length}건)` : ''}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
