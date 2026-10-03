import type { Prisma } from '@prisma/client';

/** Competition fixtures and deleted listings cannot open a team's recruiting-only inbox. */
export function contactRecruitingWhere(hostTeamId: string): Prisma.V1TeamMatchWhereInput {
  return { hostTeamId, status: 'recruiting', deletedAt: null, leagueId: null, tournamentId: null };
}
