/** Historical revisions use this marker; newer revisions use outcomeReason. */
export const FORFEIT_REASON_MARKER = '[LEAGUE_FORFEIT]';

export function resolveIsForfeit(revision: { reason: string | null; outcomeReason: string }): boolean {
  return revision.outcomeReason === 'FORFEIT' || (revision.reason?.includes(FORFEIT_REASON_MARKER) ?? false);
}

/** Score assigned to a forfeit: the opponent wins by this margin. */
export const FORFEIT_WINNER_SCORE = 1;
export const FORFEIT_LOSER_SCORE = 0;
