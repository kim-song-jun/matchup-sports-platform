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

/** Prisma predicate equivalent to `isForfeitedGame` for a `game` relation filter (matches rows with no game). */
export const NOT_FORFEITED_GAME_WHERE = {
  isNot: {
    currentOfficialRevision: {
      is: { OR: [{ outcomeReason: 'FORFEIT' as const }, { reason: { contains: FORFEIT_REASON_MARKER } }] },
    },
  },
};

/** Score assigned to a forfeit: the opponent wins by this margin. */
export const FORFEIT_WINNER_SCORE = 1;
export const FORFEIT_LOSER_SCORE = 0;
