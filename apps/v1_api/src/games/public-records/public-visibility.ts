import type { V1GameState, V1TournamentFixtureStatus, V1VisibilityMode } from '@prisma/client';
import type { PublicGameVisibilityMode } from '../games.types';

/**
 * Task 24 -- server-enforced "Public visibility output matrix" (frozen in
 * the plan and mirrored in `docs/api/domains/public-records.md`). This is a
 * deliberately separate, purpose-built serializer from
 * `games/core/visibility-serializer.ts` (Task 6's `serializeGameVisibility`,
 * used by the authenticated-or-anonymous single-game `/games/:id/visibility`
 * probe): that helper's output shape has no room for bracket/status,
 * corrected-revision history, MVP, standings, or next-match, which this
 * lane's public schedule/match DTOs need. Both independently implement the
 * same `hidden -> status_only -> live(gated by PUBLIC_LIVE) -> official_only`
 * precedence from D-06, so they cannot drift on the core rule even though
 * they are separate files.
 */

/** D-06: `PUBLIC_LIVE=off` can only ever demote `live` to `status_only`; it can never promote or hide. */
export function effectivePublicVisibilityMode(
  policyMode: V1VisibilityMode,
  publicLiveEnabled: boolean,
): PublicGameVisibilityMode {
  switch (policyMode) {
    case 'HIDDEN':
      return 'hidden';
    case 'OFFICIAL_ONLY':
      return 'official_only';
    case 'STATUS_ONLY':
      return 'status_only';
    case 'LIVE':
      return publicLiveEnabled ? 'live' : 'status_only';
    default:
      // Fail closed on any future/unknown enum value rather than leaking a
      // live/official view of an unrecognized policy state.
      return 'hidden';
  }
}

/**
 * D-02: `publicLineupAt = scheduledKickoffAt - 60m`; once published it is
 * never re-hidden solely because kickoff moved later. `V1GameVisibilityPolicy.lineupAt`
 * is the durable "already published" pin (set once and left alone by the
 * writer side); this read model additionally derives the instant from the
 * fixture's `scheduledAt` when that pin has not been written yet, so the
 * public default still fails closed (hidden) before kickoff-minus-60 even
 * when nothing has explicitly published it.
 */
export function isLineupPublished(
  input: { readonly lineupAt: Date | null; readonly scheduledAt: Date | null },
  now: Date,
): boolean {
  if (input.lineupAt !== null) {
    return input.lineupAt.getTime() <= now.getTime();
  }
  if (input.scheduledAt === null) return false;
  const derivedLineupAt = input.scheduledAt.getTime() - 60 * 60 * 1000;
  return derivedLineupAt <= now.getTime();
}

export type PublicResultState = 'pending' | 'official' | 'corrected' | 'void';

/**
 * "show live, pending, official, corrected, void ... states" from the todo.
 * `pending` covers both "no official revision yet" and "an OFFICIAL revision
 * exists but a newer correction draft is mid-review" -- the public surface
 * never shows a non-terminal draft, so both collapse to the same word.
 */
export function resolveResultState(input: {
  readonly currentRevisionState: 'OFFICIAL' | 'VOID' | null;
  readonly supersedesId: string | null;
}): PublicResultState {
  if (input.currentRevisionState === null) return 'pending';
  if (input.currentRevisionState === 'VOID') return 'void';
  return input.supersedesId === null ? 'official' : 'corrected';
}

const FIXTURE_STATUS_TO_PUBLIC_STATUS: Record<V1TournamentFixtureStatus, string> = {
  scheduled: 'scheduled',
  in_progress: 'live',
  completed: 'ended',
  cancelled: 'cancelled',
};

const GAME_STATE_TO_PUBLIC_STATUS: Record<V1GameState, string> = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  PAUSED: 'live',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
};

/**
 * The fixture-level lifecycle label shown under `hidden`/`status_only`
 * modes (matrix column "Bracket/status": "lifecycle only"). Prefers the
 * live `V1Game.state` once a game exists (it is authoritative the moment
 * the game starts); falls back to the fixture's own status before a game
 * has been created for it.
 */
export function publicFixtureStatus(input: {
  readonly gameState: V1GameState | null;
  readonly fixtureStatus: V1TournamentFixtureStatus;
}): string {
  if (input.gameState !== null) return GAME_STATE_TO_PUBLIC_STATUS[input.gameState];
  return FIXTURE_STATUS_TO_PUBLIC_STATUS[input.fixtureStatus];
}
