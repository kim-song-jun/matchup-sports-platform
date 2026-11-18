/** Historical revisions use this marker; newer revisions use outcomeReason. */
export const FORFEIT_REASON_MARKER = '[LEAGUE_FORFEIT]';

export function resolveIsForfeit(revision: { reason: string | null; outcomeReason: string }): boolean {
  return revision.outcomeReason === 'FORFEIT' || (revision.reason?.includes(FORFEIT_REASON_MARKER) ?? false);
}

/** Game whose current official revision is a forfeit; a missing game or revision is not. */
export function isForfeitedGame(
  game: { currentOfficialRevision: { reason: string | null; outcomeReason: string } | null } | null | undefined,
): boolean {
  const revision = game?.currentOfficialRevision;
  return revision ? resolveIsForfeit(revision) : false;
}

/** Negation of `isForfeitedGame` as a `game` relation filter: keeps non-forfeited games and rows with no game. */
export const NOT_FORFEITED_GAME_WHERE = {
  isNot: {
    currentOfficialRevision: {
      is: { OR: [{ outcomeReason: 'FORFEIT' as const }, { reason: { contains: FORFEIT_REASON_MARKER } }] },
    },
  },
};

/**
 * Official forfeit score: the forfeiting team gets 0, the opponent gets 3 (3:0).
 * Changed from 1:0 on 2026-11-17 (user decision, docs/design/competition-canonical-flow.md §6). Forfeits
 * already confirmed as 1:0 are intentionally left as they are; readers must not assume a fixed margin
 * (`resolveStoredForfeit` only compares the two scores).
 */
export const FORFEIT_WINNER_SCORE = 3;
export const FORFEIT_LOSER_SCORE = 0;
/** A recorded score is kept on forfeit only when the opponent already leads by at least this many goals. */
export const FORFEIT_KEEP_RECORDED_MARGIN = FORFEIT_WINNER_SCORE - FORFEIT_LOSER_SCORE;
