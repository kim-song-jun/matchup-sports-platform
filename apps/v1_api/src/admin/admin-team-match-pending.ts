import type { Prisma } from '@prisma/client';

/**
 * Team matches whose `requested` applications the operator can still act on:
 * platform-managed, friendly (no league/tournament owner) and still recruiting.
 * Mirrors the "신청 N건 관리" button on the admin team-match list; keep them in sync here only.
 */
export const OPERATOR_ACTIONABLE_TEAM_MATCH_WHERE: Prisma.V1TeamMatchWhereInput = {
  platformManaged: true,
  leagueId: null,
  tournamentId: null,
  status: 'recruiting',
};

export const OPERATOR_ACTIONABLE_APPLICATION_WHERE: Prisma.V1TeamMatchApplicationWhereInput = {
  status: 'requested',
  teamMatch: OPERATOR_ACTIONABLE_TEAM_MATCH_WHERE,
};
