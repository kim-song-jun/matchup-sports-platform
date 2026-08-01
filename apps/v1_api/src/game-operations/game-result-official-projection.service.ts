import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationClaim, GameOperationHandler } from '../jobs/v1-game-operations-worker.service';

type OfficialRevisionRow = {
  revisionId: string;
  gameId: string;
  revision: number;
  state: string;
  score: Prisma.JsonValue;
  sourceHash: string;
  officialAt: Date | null;
  sourceType: string;
  currentOfficialRevisionId: string | null;
  tournamentId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

type ExistingWatermark = {
  sourceHash: string;
  status: string;
};

export class GameResultOfficialProjectionService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revisionId = this.revisionId(claim.payload);
    const revision = await this.lockOfficialRevision(tx, revisionId);
    const score = this.score(revision.score);
    const scoreJson = JSON.stringify(revision.score);

    await tx.$executeRaw`
      INSERT INTO v1_game_official_facts (
        id, revision_id, game_id, revision, source_type, tournament_id,
        home_team_id, away_team_id, home_score, away_score, score,
        events_hash, official_at, recorded_at
      ) VALUES (
        ${randomUUID()}, ${revision.revisionId}, ${revision.gameId}, ${revision.revision},
        ${revision.sourceType}::"V1GameSourceType", ${revision.tournamentId},
        ${revision.homeTeamId}, ${revision.awayTeamId}, ${score.home}, ${score.away},
        ${scoreJson}::jsonb, ${revision.sourceHash}, ${revision.officialAt}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (revision_id) DO NOTHING
    `;

    await this.insertTeamFacts(tx, revision, score);

    if (revision.currentOfficialRevisionId !== revision.revisionId) {
      return;
    }

    const teamIds = [revision.homeTeamId, revision.awayTeamId].filter(
      (teamId): teamId is string => teamId !== null,
    );
    const repairRequired = await this.repairRequired(tx, revision, teamIds);
    if (repairRequired) {
      await this.writeRepairAudit(tx, claim, revision);
    }

    for (const teamId of teamIds) {
      await this.writeWatermarkLast(tx, {
        projection: 'TEAM_RECORD',
        entityType: 'TEAM',
        entityId: teamId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    }
    if (revision.tournamentId !== null) {
      await this.writeWatermarkLast(tx, {
        projection: 'TOURNAMENT_RESULT',
        entityType: 'TOURNAMENT',
        entityId: revision.tournamentId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    } else {
      const tournamentIds = await this.sharedTournamentIds(tx, teamIds);
      for (const tournamentId of tournamentIds) {
        await this.writeWatermarkLast(tx, {
          projection: 'TOURNAMENT_RESULT',
          entityType: 'TOURNAMENT',
          entityId: tournamentId,
          revisionId: revision.revisionId,
          sourceHash: revision.sourceHash,
        });
      }
    }
  };

  private revisionId(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('revisionId' in payload) ||
      typeof payload.revisionId !== 'string' ||
      payload.revisionId.trim().length === 0
    ) {
      throw new Error('GAME_RESULT_OFFICIAL payload requires a non-empty revisionId');
    }
    return payload.revisionId.trim();
  }

  private async lockOfficialRevision(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ): Promise<OfficialRevisionRow> {
    const rows = await tx.$queryRaw<OfficialRevisionRow[]>`
      SELECT
        revision.id AS "revisionId",
        revision.game_id AS "gameId",
        revision.revision,
        revision.state::text AS state,
        revision.score,
        revision.events_hash AS "sourceHash",
        revision.official_at AS "officialAt",
        game.source_type::text AS "sourceType",
        game.current_official_revision_id AS "currentOfficialRevisionId",
        fixture.tournament_id AS "tournamentId",
        home_side.team_id AS "homeTeamId",
        away_side.team_id AS "awayTeamId"
      FROM v1_game_result_revisions revision
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
      LEFT JOIN v1_game_sides home_side ON home_side.game_id = game.id AND home_side.side_key = 'HOME'
      LEFT JOIN v1_game_sides away_side ON away_side.game_id = game.id AND away_side.side_key = 'AWAY'
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision
    `;
    const revision = rows[0];
    if (!revision || revision.state !== 'OFFICIAL' || revision.officialAt === null) {
      throw new Error(`GAME_RESULT_OFFICIAL revision ${revisionId} is not OFFICIAL`);
    }
    return revision;
  }

  private score(score: Prisma.JsonValue): { home: number; away: number } {
    if (
      typeof score !== 'object' ||
      score === null ||
      Array.isArray(score) ||
      typeof score.home !== 'number' ||
      !Number.isInteger(score.home) ||
      score.home < 0 ||
      typeof score.away !== 'number' ||
      !Number.isInteger(score.away) ||
      score.away < 0
    ) {
      throw new Error('OFFICIAL revision requires non-negative integer home and away scores');
    }
    return { home: score.home, away: score.away };
  }

  private async insertTeamFacts(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    score: { home: number; away: number },
  ): Promise<void> {
    const sides = [
      {
        teamId: revision.homeTeamId,
        opponentTeamId: revision.awayTeamId,
        goalsFor: score.home,
        goalsAgainst: score.away,
      },
      {
        teamId: revision.awayTeamId,
        opponentTeamId: revision.homeTeamId,
        goalsFor: score.away,
        goalsAgainst: score.home,
      },
    ];
    for (const side of sides) {
      if (side.teamId === null) continue;
      const result = side.goalsFor > side.goalsAgainst
        ? 'WON'
        : side.goalsFor < side.goalsAgainst
          ? 'LOST'
          : 'DRAWN';
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

  private async repairRequired(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    teamIds: string[],
  ): Promise<boolean> {
    if (teamIds.length === 0) return false;
    const rows = await tx.$queryRaw<ExistingWatermark[]>`
      SELECT source_hash AS "sourceHash", status::text AS status
      FROM v1_projection_watermarks
      WHERE projection = 'TEAM_RECORD'
        AND entity_type = 'TEAM'
        AND entity_id = ${teamIds[0]}
      FOR UPDATE
    `;
    const current = rows[0];
    return current !== undefined && (
      current.sourceHash !== revision.sourceHash || current.status !== 'APPLIED'
    );
  }

  private async writeRepairAudit(
    tx: Prisma.TransactionClient,
    claim: GameOperationClaim,
    revision: OfficialRevisionRow,
  ): Promise<void> {
    const after = JSON.stringify({ sourceHash: revision.sourceHash, status: 'APPLIED' });
    await tx.$executeRaw`
      INSERT INTO v1_operation_audits (
        id, actor_type, actor_user_id, system_actor, action, resource_type,
        resource_id, request_id, source_ip, before, after, reason, created_at
      )
      SELECT
        ${randomUUID()}, 'SYSTEM'::"V1OperationActorType", NULL,
        'V1_GAME_OPERATIONS_WORKER', 'GAME_PROJECTION_REPAIRED', 'GAME_RESULT_REVISION',
        ${revision.revisionId}, ${`projection-repair:${revision.revisionId}:${revision.sourceHash}`},
        NULL, NULL, ${after}::jsonb, ${`outbox:${claim.id}`}, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM v1_operation_audits
        WHERE action = 'GAME_PROJECTION_REPAIRED'
          AND resource_id = ${revision.revisionId}
          AND request_id = ${`projection-repair:${revision.revisionId}:${revision.sourceHash}`}
      )
    `;
  }

  private async sharedTournamentIds(
    tx: Prisma.TransactionClient,
    teamIds: string[],
  ): Promise<string[]> {
    if (teamIds.length !== 2) return [];
    const rows = await tx.$queryRaw<Array<{ tournamentId: string }>>`
      SELECT tournament_id AS "tournamentId"
      FROM v1_tournament_registrations
      WHERE team_id IN (${teamIds[0]}, ${teamIds[1]})
        AND status = 'confirmed'
      GROUP BY tournament_id
      HAVING COUNT(DISTINCT team_id) = 2
      ORDER BY tournament_id ASC
    `;
    return rows.map(({ tournamentId }) => tournamentId);
  }

  private async writeWatermarkLast(
    tx: Prisma.TransactionClient,
    input: {
      projection: string;
      entityType: string;
      entityId: string;
      revisionId: string;
      sourceHash: string;
    },
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO v1_projection_watermarks (
        id, projection, entity_type, entity_id, revision_id, source_hash, projected_at, status
      ) VALUES (
        ${randomUUID()}, ${input.projection}, ${input.entityType}, ${input.entityId},
        ${input.revisionId}, ${input.sourceHash}, CURRENT_TIMESTAMP, 'APPLIED'::"V1ProjectionStatus"
      )
      ON CONFLICT (projection, entity_type, entity_id) DO UPDATE
      SET revision_id = EXCLUDED.revision_id,
          source_hash = EXCLUDED.source_hash,
          projected_at = CURRENT_TIMESTAMP,
          status = 'APPLIED'::"V1ProjectionStatus"
      WHERE v1_projection_watermarks.revision_id = EXCLUDED.revision_id
         OR EXISTS (
           SELECT 1
           FROM v1_games current_game
           WHERE current_game.current_official_revision_id = EXCLUDED.revision_id
         )
    `;
  }
}
