import { ConflictException } from '@nestjs/common';
import { V1GameSourceType, type Prisma } from '@prisma/client';

/** Shared by operator commands and clock expiry; relation IDs must satisfy the composite audit FK. */
export async function gameOperationAuditScope(
  tx: Prisma.TransactionClient,
  resourceId: string,
  notFound: (code?: string) => Error,
) {
  const game = await tx.v1Game.findUnique({
    where: { id: resourceId },
    select: {
      sourceType: true,
      teamMatch: {
        select: {
          id: true, deletedAt: true, tournamentId: true, leagueId: true, fieldId: true,
          tournament: { select: { kind: true } },
          league: { select: { kind: true } },
          tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
        },
      },
    },
  });
  if (game === null) throw notFound();
  if (game.sourceType !== V1GameSourceType.TEAM_MATCH) {
    throw new ConflictException({ code: 'GAME_AUDIT_SCOPE_INVALID', message: `Unsupported game source ${game.sourceType}.` });
  }
  const match = game.teamMatch;
  if (match === null) {
    throw new ConflictException({ code: 'GAME_AUDIT_SCOPE_INVALID', message: 'Team match game is missing its TeamMatch scope.' });
  }
  if (match.deletedAt !== null) throw notFound('TOURNAMENT_FIXTURE_GAME_NOT_FOUND');
  if (
    (match.tournamentId === null && match.leagueId !== null) ||
    (match.tournamentId !== null && match.leagueId !== null && match.tournamentId !== match.leagueId)
  ) {
    throw new ConflictException({ code: 'GAME_AUDIT_SCOPE_INVALID', message: 'TeamMatch competition ownership is inconsistent.' });
  }
  const competitionId = match.tournamentId ?? match.leagueId;
  const details = match.tournamentDetails;
  const isRegularLeague = match.tournament?.kind === 'regular_league' || match.league?.kind === 'regular_league';
  if (
    (isRegularLeague && (competitionId === null || details !== null)) ||
    (!isRegularLeague && competitionId !== null &&
      (match.leagueId !== null || details === null || details.tournamentId !== competitionId || details.teamMatchId !== match.id)) ||
    (competitionId === null && details !== null)
  ) {
    throw new ConflictException({ code: 'GAME_AUDIT_SCOPE_INVALID', message: 'TeamMatch tournament details do not match its ownership scope.' });
  }
  return {
    tournamentId: competitionId,
    teamMatchId: competitionId === null ? null : match.id,
    fieldId: competitionId === null ? null : match.fieldId,
  };
}
