import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import { GameResultProjectionWatermarkService } from './game-result-projection-watermark.service';
import { LeagueCompletionProjectionService } from '../league-matches/league-completion-projection.service';

type LockedVoidRevisionRow = {
  revisionId: string;
  gameId: string;
  revision: number;
  state: string;
  eventsHash: string;
  supersedesId: string | null;
  sourceType: string;
  tournamentId: string | null;
  tournamentFixtureId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

type SupersededRevisionRow = {
  score: Prisma.JsonValue;
};

type AdvancementEdgeRow = {
  sourceOutcome: 'WINNER' | 'LOSER';
  targetFixtureId: string;
  targetSide: 'HOME' | 'AWAY';
};

type FixtureSlotsRow = {
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
};

/**
 * Async compensation for `GAME_RESULT_VOIDED`: hides the prior OFFICIAL
 * public cache row (never re-derives a numeric score for the void itself),
 * reverses any bracket advancement this fixture's official result already
 * produced (best-effort compare-and-swap -- the synchronous void command
 * already blocked with 409 NEXT_FIXTURE_CONFLICT when a downstream fixture
 * had progressed past 'scheduled', so this is a defensive re-check, not the
 * primary gate), and writes projection watermarks so repair/reconciliation
 * recognizes the void as the currently-applied state. Team/player/standing
 * aggregates are compensated structurally: because
 * GameResultOfficialFactsService keys every fact row by revisionId and a
 * VOID revision never gets a fact row, any future reader that joins facts
 * through `game.currentOfficialRevisionId` sees nothing for this game the
 * moment the pointer swaps to the void revision -- no fact deletion is
 * needed or wanted (facts stay append-only for audit).
 *
 * `hidePublicCache` only ever UPDATEs existing rows -- it never INSERTs a
 * cache row keyed by the VOID revision's own id. The `v1_guard_game_
 * official_result_cache` BEFORE INSERT trigger (an invariant, not owned by
 * this lane) requires every inserted row's `revision_id` to reference a
 * revision whose `state = 'OFFICIAL'`; a VOID revision can never satisfy
 * that, so attempting such an insert always raises and rolls back the
 * *entire* handler transaction, including the UPDATE that correctly hid the
 * prior official row. "No OFFICIAL revision is current" is already fully
 * represented by every existing row for this game having `is_current =
 * false`; no additional marker row is needed or wanted.
 */
export class GameResultVoidProjectionService {
  private readonly watermarks = new GameResultProjectionWatermarkService();

  // GAME_RESULT_OFFICIAL 쪽이 LeagueCompletionProjectionService.project() 를 부르는 것과
  // 대칭. 무효도 "남은 대진 집합을 줄이는 조작"이라 완료 판정을 다시 돌려야 한다 --
  // 안 돌리면 이의 수락으로 무효 처리된 대진 하나가 그 리그를 영원히 active 로 묶고
  // 승강까지 영구히 막는다(적대 리뷰 지적). 이 클래스는 의존 없는 순수 클래스라
  // official 쪽과 같은 방식으로 필드에서 직접 만든다.
  private readonly leagueCompletion = new LeagueCompletionProjectionService();

  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockVoidRevision(tx, this.revisionId(claim.payload));
    await this.hidePublicCache(tx, revision);
    if (revision.tournamentFixtureId !== null) {
      await this.reverseBracketAdvancement(tx, revision);
    }
    const teamIds = [revision.homeTeamId, revision.awayTeamId].filter(
      (teamId): teamId is string => teamId !== null,
    );
    await this.writeWatermarks(tx, revision, teamIds);
    await this.settleLeagueIfNeeded(tx, revision);
  };

  /**
   * 무효 처리된 대진이 리그 소속이면 그 리그의 완료 판정을 다시 돌린다.
   * 리그가 아니거나(일반 팀매치·대회 픽스처) 아직 미확정 대진이 남았으면 no-op 이다
   * (settle 자체가 멱등하고 state='active' 조건부 UPDATE 로 보호된다).
   */
  private async settleLeagueIfNeeded(
    tx: Prisma.TransactionClient,
    revision: LockedVoidRevisionRow,
  ): Promise<void> {
    if (revision.sourceType !== 'TEAM_MATCH') return;
    const rows = await tx.$queryRaw<Array<{ leagueId: string | null }>>`
      SELECT team_match.league_id AS "leagueId"
      FROM v1_games game
      INNER JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
      WHERE game.id = ${revision.gameId}
      LIMIT 1
    `;
    const leagueId = rows[0]?.leagueId ?? null;
    if (leagueId === null) return;
    await this.leagueCompletion.settle(tx, leagueId, 'remaining_fixture_voided');
  }

  private revisionId(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('revisionId' in payload) ||
      typeof payload.revisionId !== 'string' ||
      payload.revisionId.trim().length === 0
    ) {
      throw new Error('GAME_RESULT_VOIDED payload requires a non-empty revisionId');
    }
    return payload.revisionId.trim();
  }

  private supersedesId(payload: unknown): string | null {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'supersedesId' in payload &&
      typeof payload.supersedesId === 'string' &&
      payload.supersedesId.trim().length > 0
    ) {
      return payload.supersedesId.trim();
    }
    return null;
  }

  private async lockVoidRevision(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ): Promise<LockedVoidRevisionRow> {
    const rows = await tx.$queryRaw<LockedVoidRevisionRow[]>`
      SELECT
        revision.id AS "revisionId",
        revision.game_id AS "gameId",
        revision.revision,
        revision.state::text AS state,
        revision.events_hash AS "eventsHash",
        revision.supersedes_id AS "supersedesId",
        game.source_type::text AS "sourceType",
        fixture.tournament_id AS "tournamentId",
        fixture.id AS "tournamentFixtureId",
        home_side.team_id AS "homeTeamId",
        away_side.team_id AS "awayTeamId"
      FROM v1_game_result_revisions revision
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
      LEFT JOIN v1_game_sides home_side ON home_side.game_id = game.id AND home_side.side_key = 'HOME'
      LEFT JOIN v1_game_sides away_side ON away_side.game_id = game.id AND away_side.side_key = 'AWAY'
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision, game
    `;
    const revision = rows[0];
    if (revision === undefined || revision.state !== 'VOID') {
      throw new Error(`GAME_RESULT_VOIDED revision ${revisionId} is not VOID`);
    }
    return revision;
  }

  private async hidePublicCache(
    tx: Prisma.TransactionClient,
    revision: LockedVoidRevisionRow,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE v1_game_official_result_cache
      SET is_current = false, updated_at = CURRENT_TIMESTAMP
      WHERE game_id = ${revision.gameId} AND is_current
    `;
  }

  private async reverseBracketAdvancement(
    tx: Prisma.TransactionClient,
    revision: LockedVoidRevisionRow,
  ): Promise<void> {
    const sourceFixtureId = revision.tournamentFixtureId;
    if (sourceFixtureId === null) return;
    const supersededId = this.supersedesId({ supersedesId: revision.supersedesId });
    if (supersededId === null) return;
    const superseded = await tx.$queryRaw<SupersededRevisionRow[]>`
      SELECT score FROM v1_game_result_revisions WHERE id = ${supersededId}
    `;
    const score = this.score(superseded[0]?.score);
    if (score === null) return;

    const edges = await tx.$queryRaw<AdvancementEdgeRow[]>`
      SELECT
        source_outcome::text AS "sourceOutcome",
        target_fixture_id AS "targetFixtureId",
        target_side::text AS "targetSide"
      FROM v1_tournament_fixture_advancement_edges
      WHERE source_fixture_id = ${sourceFixtureId}
      ORDER BY target_fixture_id ASC, target_side ASC, source_outcome ASC
      FOR UPDATE
    `;
    if (edges.length === 0) return;

    const source = await tx.$queryRaw<FixtureSlotsRow[]>`
      SELECT
        home_registration_id AS "homeRegistrationId",
        away_registration_id AS "awayRegistrationId"
      FROM v1_tournament_fixtures
      WHERE id = ${sourceFixtureId}
      FOR UPDATE
    `;
    const slots = source[0];
    if (slots === undefined || slots.homeRegistrationId === null || slots.awayRegistrationId === null) {
      return;
    }
    const winnerRegistrationId =
      score.home > score.away ? slots.homeRegistrationId : slots.awayRegistrationId;
    const loserRegistrationId =
      score.home > score.away ? slots.awayRegistrationId : slots.homeRegistrationId;

    for (const edge of edges) {
      const registrationId = edge.sourceOutcome === 'WINNER' ? winnerRegistrationId : loserRegistrationId;
      const target = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status::text AS status FROM v1_tournament_fixtures
        WHERE id = ${edge.targetFixtureId} FOR UPDATE
      `;
      if (target[0] === undefined || target[0].status !== 'scheduled') {
        // Already advanced past 'scheduled' downstream -- the sync command
        // already blocks this in the common case; a late/replayed worker
        // run must never clobber a fixture that has moved on.
        continue;
      }
      if (edge.targetSide === 'HOME') {
        await tx.$executeRaw`
          UPDATE v1_tournament_fixtures
          SET home_registration_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${edge.targetFixtureId} AND home_registration_id = ${registrationId}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE v1_tournament_fixtures
          SET away_registration_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${edge.targetFixtureId} AND away_registration_id = ${registrationId}
        `;
      }
    }
  }

  private score(value: Prisma.JsonValue | undefined): { home: number; away: number } | null {
    if (
      value === undefined ||
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      typeof value.home !== 'number' ||
      typeof value.away !== 'number'
    ) {
      return null;
    }
    return { home: value.home, away: value.away };
  }

  private async writeWatermarks(
    tx: Prisma.TransactionClient,
    revision: LockedVoidRevisionRow,
    teamIds: string[],
  ): Promise<void> {
    await this.watermarks.write(tx, {
      projection: 'PUBLIC_OFFICIAL_RESULT',
      entityType: 'GAME',
      entityId: revision.gameId,
      revisionId: revision.revisionId,
      sourceHash: revision.eventsHash,
    });
    for (const teamId of teamIds) {
      await this.watermarks.write(tx, {
        projection: 'TEAM_RECORD',
        entityType: 'TEAM',
        entityId: teamId,
        revisionId: revision.revisionId,
        sourceHash: revision.eventsHash,
      });
    }
    if (revision.tournamentId !== null) {
      await this.watermarks.write(tx, {
        projection: 'TOURNAMENT_RESULT',
        entityType: 'TOURNAMENT',
        entityId: revision.tournamentId,
        revisionId: revision.revisionId,
        sourceHash: revision.eventsHash,
      });
    }
  }
}
