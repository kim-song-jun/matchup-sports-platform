import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';
import { officialRecordResult, type OfficialSideKey } from './official-score-outcome';

export class GameResultOfficialFactsService {
  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    score: OfficialScore,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO v1_game_official_facts (
        id, revision_id, game_id, revision, source_type, tournament_id,
        home_team_id, away_team_id, home_score, away_score, score,
        events_hash, official_at, recorded_at
      ) VALUES (
        ${randomUUID()}, ${revision.revisionId}, ${revision.gameId}, ${revision.revision},
        ${revision.sourceType}::"V1GameSourceType", ${revision.tournamentId},
        ${revision.homeTeamId}, ${revision.awayTeamId}, ${score.home}, ${score.away},
        ${JSON.stringify(revision.score)}::jsonb, ${revision.sourceHash},
        ${revision.officialAt}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (revision_id) DO NOTHING
    `;

    const sides = [
      {
        sideKey: 'HOME' as OfficialSideKey,
        teamId: revision.homeTeamId,
        opponentTeamId: revision.awayTeamId,
        goalsFor: score.home,
        goalsAgainst: score.away,
      },
      {
        sideKey: 'AWAY' as OfficialSideKey,
        teamId: revision.awayTeamId,
        opponentTeamId: revision.homeTeamId,
        goalsFor: score.away,
        goalsAgainst: score.home,
      },
    ];
    for (const side of sides) {
      if (side.teamId === null) continue;
      const result = officialRecordResult(score, side.sideKey);
      await tx.$executeRaw`
        INSERT INTO v1_team_record_facts (
          id, revision_id, game_id, team_id, opponent_team_id, tournament_id,
          result, goals_for, goals_against, source_hash, official_at, recorded_at
        ) VALUES (
          ${randomUUID()}, ${revision.revisionId}, ${revision.gameId}, ${side.teamId},
          ${side.opponentTeamId}, ${revision.tournamentId}, ${result}, ${side.goalsFor},
          ${side.goalsAgainst}, ${revision.sourceHash}, ${revision.officialAt}, CURRENT_TIMESTAMP
        )
        ON CONFLICT (revision_id, team_id) DO NOTHING
      `;
    }
  }
}
