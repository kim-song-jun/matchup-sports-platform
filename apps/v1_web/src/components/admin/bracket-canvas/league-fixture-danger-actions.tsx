'use client';

import { useId } from 'react';
import {
  LEAGUE_FIXTURE_CANCEL_HINT,
  LEAGUE_FIXTURE_DELETE_HINT,
  leagueFixtureDeleteBlockedReason,
} from '@/lib/league-fixture-delete';
import type { V1GameState } from '@/types/api';

export interface LeagueFixtureDangerActionsProps {
  cancelled: boolean;
  live: boolean;
  gameState: V1GameState | undefined;
  hasResult: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

const MUTED = { color: 'var(--text-muted)' } as const;
const DANGER_BUTTON = { minHeight: 44, color: 'var(--red700)' } as const;

/** Cancel and delete entry points of a league fixture, shared by the board side panel and the mobile board sheet. */
export function LeagueFixtureDangerActions({ cancelled, live, gameState, hasResult, onCancel, onDelete }: LeagueFixtureDangerActionsProps) {
  const deleteReasonId = useId();
  const deleteBlockedReason = leagueFixtureDeleteBlockedReason({ cancelled, gameState, hasResult });
  return (
    <>
      {!cancelled && !live ? (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={onCancel} className="tm-btn tm-btn-sm tm-btn-outline self-start" style={DANGER_BUTTON}>
            경기 취소
          </button>
          <p className="tm-text-caption" style={MUTED}>{LEAGUE_FIXTURE_CANCEL_HINT}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteBlockedReason !== null}
          aria-describedby={deleteReasonId}
          className="tm-btn tm-btn-sm tm-btn-outline self-start"
          style={DANGER_BUTTON}
        >
          경기 삭제
        </button>
        <p id={deleteReasonId} className="tm-text-caption" style={MUTED}>
          {deleteBlockedReason ?? LEAGUE_FIXTURE_DELETE_HINT}
        </p>
      </div>
    </>
  );
}
