/** Default opponent lineup publication time is one hour before kickoff (D-02). */
export const DEFAULT_PUBLIC_LINEUP_LEAD_MS = 60 * 60 * 1000;

export function resolvePublicLineupAt(startAt: Date, policyLineupAt: Date | null): Date {
  return policyLineupAt ?? new Date(startAt.getTime() - DEFAULT_PUBLIC_LINEUP_LEAD_MS);
}
