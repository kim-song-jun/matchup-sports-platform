import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';
import { projectCanonicalAdvancement } from './tournament-team-match-advancement';

export class GameResultBracketProjectionService {
  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    score: OfficialScore,
  ): Promise<void> {
    if (revision.sourceType !== 'TEAM_MATCH') {
      throw new Error('BRACKET_CANONICAL_SOURCE_REQUIRED');
    }
    // Friendly and regular-league TeamMatches have no bracket topology. A
    // non-league tournament owner without Details is malformed and must fail
    // closed rather than silently skipping advancement.
    if (revision.tournamentTeamMatchId === null) {
      if (revision.teamMatchTournamentId === null || revision.teamMatchTournamentId === revision.leagueId) return;
      throw new Error('BRACKET_CANONICAL_SOURCE_INVALID');
    }
    if (revision.tournamentTeamMatchId !== revision.teamMatchId || revision.tournamentId === null) {
      throw new Error('BRACKET_CANONICAL_SOURCE_INVALID');
    }
    await projectCanonicalAdvancement(tx, revision, score);
  }
}
