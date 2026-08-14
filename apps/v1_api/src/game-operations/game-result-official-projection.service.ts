import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import { GameResultBracketProjectionService } from './game-result-bracket-projection.service';
import { GameResultEscalationTerminalService } from './game-result-escalation-terminal.service';
import { GameResultOfficialFactsService } from './game-result-official-facts.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { GameResultProjectionWatermarkService } from './game-result-projection-watermark.service';
import { GameResultPublicCacheService } from './game-result-public-cache.service';
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import { officialRevisionRowSelect } from './official-revision-row.query';
import { parseOfficialScore } from './parse-official-score';

type LockedOfficialRevisionRow = Omit<OfficialRevisionRow, 'officialAt'> & {
  state: string;
  officialAt: Date | null;
};

export class GameResultOfficialProjectionService {
  private readonly facts = new GameResultOfficialFactsService();
  private readonly cache = new GameResultPublicCacheService();
  private readonly bracket = new GameResultBracketProjectionService();
  private readonly standings = new GameResultStandingsProjectionService();
  private readonly terminal = new GameResultEscalationTerminalService();
  private readonly watermarks = new GameResultProjectionWatermarkService();

  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockOfficialRevision(tx, this.revisionId(claim.payload));
    const score = parseOfficialScore(revision.score);
    const publicProjection = this.cache.build(revision, score);
    const teamIds = [revision.homeTeamId, revision.awayTeamId].filter(
      (teamId): teamId is string => teamId !== null,
    );

    await this.facts.project(tx, revision, score);
    const repairRequired = publicProjection.isCurrent && (
      await this.watermarks.repairRequired(tx, revision, teamIds) ||
      await this.cache.repairRequired(tx, revision, publicProjection)
    );
    await this.cache.project(tx, revision, publicProjection);
    if (!publicProjection.isCurrent) return;
    if (repairRequired) await this.watermarks.writeRepairAudit(tx, claim, revision);

    await this.bracket.project(tx, revision, score);
    await this.standings.project(tx, revision);
    await this.terminal.close(tx, revision);
    await this.writeAggregateWatermarks(tx, revision, teamIds);
    await this.watermarks.write(tx, {
      projection: 'PUBLIC_OFFICIAL_RESULT',
      entityType: 'GAME',
      entityId: revision.gameId,
      revisionId: revision.revisionId,
      sourceHash: publicProjection.payloadHash,
    });
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
    const rows = await tx.$queryRaw<LockedOfficialRevisionRow[]>`
      ${officialRevisionRowSelect()}
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision, game
    `;
    const revision = rows[0];
    if (revision === undefined || revision.state !== 'OFFICIAL' || revision.officialAt === null) {
      throw new Error(`GAME_RESULT_OFFICIAL revision ${revisionId} is not OFFICIAL`);
    }
    return { ...revision, officialAt: revision.officialAt };
  }

  private async writeAggregateWatermarks(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    teamIds: string[],
  ): Promise<void> {
    for (const teamId of teamIds) {
      await this.watermarks.write(tx, {
        projection: 'TEAM_RECORD',
        entityType: 'TEAM',
        entityId: teamId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    }
    const tournamentIds = revision.tournamentId === null
      ? await this.sharedTournamentIds(tx, teamIds)
      : [revision.tournamentId];
    for (const tournamentId of tournamentIds) {
      await this.watermarks.write(tx, {
        projection: 'TOURNAMENT_RESULT',
        entityType: 'TOURNAMENT',
        entityId: tournamentId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    }
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
}
