/** Historical revisions use this marker; newer revisions use outcomeReason. */
export const FORFEIT_REASON_MARKER = '[LEAGUE_FORFEIT]';

export function resolveIsForfeit(revision: { reason: string | null; outcomeReason: string }): boolean {
  return revision.outcomeReason === 'FORFEIT' || (revision.reason?.includes(FORFEIT_REASON_MARKER) ?? false);
}
