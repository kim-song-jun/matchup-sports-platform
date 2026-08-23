import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import type { WebPushService } from '../notifications/web-push.service';
import { GameResultBracketProjectionService } from './game-result-bracket-projection.service';
import { GameResultEscalationTerminalService } from './game-result-escalation-terminal.service';
import { GameResultOfficialFactsService } from './game-result-official-facts.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { GameResultProjectionWatermarkService } from './game-result-projection-watermark.service';
import { GameResultPublicCacheService } from './game-result-public-cache.service';
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import { officialRevisionRowSelect } from './official-revision-row.query';
import { parseOfficialScore } from './parse-official-score';
import { TeamMatchCompletionNotificationService } from './team-match-completion-notification.service';
// 리그 도메인 소유(apps/v1_api/src/league-matches/) -- R6: 리그 대진(team-match)이
// 공식 결과를 얻을 때마다 그 리그가 자동으로 completed 전이할 수 있는지 확인한다.
// team-match가 아닌 게임(토너먼트 픽스처)에는 no-op이라 여기 추가해도 기존 흐름에
// 영향이 없다.
import { LeagueCompletionProjectionService } from '../league-matches/league-completion-projection.service';

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
  private readonly leagueCompletion = new LeagueCompletionProjectionService();
  // 리그 감사 그룹 A / R1: team_match_completed 알림을 공식 결과 확정 지점에 연결한다.
  // webPush는 optional — v1-game-operations-worker.service.ts가 DI로 받은 WebPushService를
  // 그대로 넘겨주지만, 이 클래스를 인자 없이 직접 `new`하는 기존 테스트 호출부(플레인 클래스,
  // DI 없음)는 하위호환으로 계속 동작한다(push는 그냥 no-op).
  private readonly teamMatchCompletion: TeamMatchCompletionNotificationService;

  constructor(webPush?: WebPushService) {
    this.teamMatchCompletion = new TeamMatchCompletionNotificationService(webPush);
  }

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
    await this.leagueCompletion.project(tx, revision);
    await this.teamMatchCompletion.project(tx, revision);
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
