import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';
import { resolveTeamRecordResult } from './team-record-result';

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
        teamId: revision.homeTeamId,
        opponentTeamId: revision.awayTeamId,
        goalsFor: score.home,
        goalsAgainst: score.away,
        penaltiesFor: score.penalties?.home,
        penaltiesAgainst: score.penalties?.away,
      },
      {
        teamId: revision.awayTeamId,
        opponentTeamId: revision.homeTeamId,
        goalsFor: score.away,
        goalsAgainst: score.home,
        penaltiesFor: score.penalties?.away,
        penaltiesAgainst: score.penalties?.home,
      },
    ];
    for (const side of sides) {
      if (side.teamId === null) continue;
      // goals_for/goals_against 컬럼엔 정규시간 스코어만 저장한다(계약) -- 승부차기는
      // 오직 result(WON/DRAWN/LOST) 판정에만 반영된다. 프로덕션 실측: 정규시간 1:1,
      // 승부차기 2:3 이었던 결승이 여기서 항상 DRAWN 으로 잘못 기록됐었다.
      const result = resolveTeamRecordResult(
        side.goalsFor,
        side.goalsAgainst,
        side.penaltiesFor,
        side.penaltiesAgainst,
      );
      await tx.$executeRaw`
        INSERT INTO v1_team_record_facts (
          id, revision_id, game_id, team_id, opponent_team_id, tournament_id,
          result, goals_for, goals_against, source_hash, played_at, official_at, recorded_at
        ) VALUES (
          ${randomUUID()}, ${revision.revisionId}, ${revision.gameId}, ${side.teamId},
          ${side.opponentTeamId}, ${revision.tournamentId}, ${result}, ${side.goalsFor},
          ${side.goalsAgainst}, ${revision.sourceHash}, ${revision.playedAt}, ${revision.officialAt}, CURRENT_TIMESTAMP
        )
        ON CONFLICT (revision_id, team_id) DO NOTHING
      `;
    }
  }
}
