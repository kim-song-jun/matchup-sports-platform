import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';

type AdvancementEdgeRow = {
  tournamentId: string;
  sourceFixtureId: string;
  sourceOutcome: 'WINNER' | 'LOSER';
  targetFixtureId: string;
  targetSide: 'HOME' | 'AWAY';
};

type LockedFixtureRow = {
  id: string;
  tournamentId: string;
  /**
   * `v1_tournament_fixtures.status` 컬럼 대신 쓰는 파생 판정. 그 컬럼은 생성 시
   * `scheduled`, officialize 시 `completed` 두 값만 기록되고 그 두 전이가 각각
   * "공식 리비전 없음/있음"과 정확히 대응한다(prod·alpha 복제본 전수 대조 mismatch 0).
   * 컬럼은 결국 이 사실의 비정규화 캐시라, 게이트는 원본을 직접 본다.
   */
  hasOfficialResult: boolean;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
};

type RegistrationRow = { id: string; tournamentId: string; status: string };

export class GameResultBracketProjectionService {
  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    score: OfficialScore,
  ): Promise<void> {
    if (revision.tournamentFixtureId === null) return;
    const edges = await this.lockEdges(tx, revision.tournamentFixtureId);
    if (edges.length === 0) return;
    const fixtureIds = [...new Set([
      revision.tournamentFixtureId,
      ...edges.map(({ targetFixtureId }) => targetFixtureId),
    ])].sort();
    // FOR UPDATE OF f: outer join 의 nullable 쪽(v1_games)은 Postgres 가 잠글 수 없다
    // ("FOR UPDATE cannot be applied to the nullable side of an outer join").
    // 잠금 대상은 원래도 픽스처 행이므로 의미는 그대로다.
    const fixtures = await tx.$queryRaw<LockedFixtureRow[]>`
      SELECT
        f.id,
        f.tournament_id AS "tournamentId",
        (g.current_official_revision_id IS NOT NULL) AS "hasOfficialResult",
        f.home_registration_id AS "homeRegistrationId",
        f.away_registration_id AS "awayRegistrationId"
      FROM v1_tournament_fixtures f
      LEFT JOIN v1_games g ON g.tournament_fixture_id = f.id
      WHERE f.id IN (${Prisma.join(fixtureIds)})
      ORDER BY f.id ASC
      FOR UPDATE OF f
    `;
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const source = fixtureById.get(revision.tournamentFixtureId);
    if (
      source === undefined ||
      revision.tournamentId === null ||
      source.tournamentId !== revision.tournamentId ||
      !source.hasOfficialResult ||
      source.homeRegistrationId === null ||
      source.awayRegistrationId === null ||
      source.homeRegistrationId === source.awayRegistrationId
    ) {
      throw new Error('BRACKET_SOURCE_STATE_INVALID');
    }
    const winnerSide = this.resolveWinnerSide(score);
    await this.assertRegistrations(
      tx,
      source.tournamentId,
      source.homeRegistrationId,
      source.awayRegistrationId,
    );

    const winnerRegistrationId = winnerSide === 'HOME'
      ? source.homeRegistrationId
      : source.awayRegistrationId;
    const loserRegistrationId = winnerSide === 'HOME'
      ? source.awayRegistrationId
      : source.homeRegistrationId;
    for (const edge of edges) {
      const target = fixtureById.get(edge.targetFixtureId);
      this.assertTarget(edge, source, target);
      const registrationId = edge.sourceOutcome === 'WINNER'
        ? winnerRegistrationId
        : loserRegistrationId;
      await this.assignTarget(tx, target!, edge.targetSide, registrationId);
    }
  }

  /**
   * Regulation decides it whenever the sides aren't level. A level
   * regulation score only resolves through `score.penalties` (the flat
   * `{home,away,penalties?:{home,away}}` shape `GamesService.applyPenalties`
   * writes for a knockout fixture's `end` command -- see that method's doc
   * for why penalties can only ever reach this projection already validated
   * as decisive, non-negative integers). Absent or itself-tied penalties
   * leave the draw unresolved -- same `BRACKET_RESULT_DRAW_UNSUPPORTED`
   * thrown before this method existed, now just reached through one more
   * branch instead of a bare score.home === score.away check.
   */
  private resolveWinnerSide(score: OfficialScore): 'HOME' | 'AWAY' {
    if (score.home !== score.away) return score.home > score.away ? 'HOME' : 'AWAY';
    if (score.penalties !== undefined && score.penalties.home !== score.penalties.away) {
      return score.penalties.home > score.penalties.away ? 'HOME' : 'AWAY';
    }
    throw new Error('BRACKET_RESULT_DRAW_UNSUPPORTED');
  }

  private async lockEdges(
    tx: Prisma.TransactionClient,
    sourceFixtureId: string,
  ): Promise<AdvancementEdgeRow[]> {
    return tx.$queryRaw<AdvancementEdgeRow[]>`
      SELECT
        tournament_id AS "tournamentId",
        source_fixture_id AS "sourceFixtureId",
        source_outcome::text AS "sourceOutcome",
        target_fixture_id AS "targetFixtureId",
        target_side::text AS "targetSide"
      FROM v1_tournament_fixture_advancement_edges
      WHERE source_fixture_id = ${sourceFixtureId}
      ORDER BY target_fixture_id ASC, target_side ASC, source_outcome ASC
      FOR UPDATE
    `;
  }

  private async assertRegistrations(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    homeRegistrationId: string,
    awayRegistrationId: string,
  ): Promise<void> {
    const ids = [homeRegistrationId, awayRegistrationId].sort();
    const registrations = await tx.$queryRaw<RegistrationRow[]>`
      SELECT id, tournament_id AS "tournamentId", status
      FROM v1_tournament_registrations
      WHERE id IN (${Prisma.join(ids)})
      ORDER BY id ASC
      FOR SHARE
    `;
    if (
      registrations.length !== 2 ||
      registrations.some(({ tournamentId: registrationTournamentId, status }) =>
        registrationTournamentId !== tournamentId || status !== 'confirmed'
      )
    ) {
      throw new Error('BRACKET_SOURCE_REGISTRATION_INVALID');
    }
  }

  private assertTarget(
    edge: AdvancementEdgeRow,
    source: LockedFixtureRow,
    target: LockedFixtureRow | undefined,
  ): void {
    if (
      edge.sourceFixtureId !== source.id ||
      edge.tournamentId !== source.tournamentId ||
      target === undefined ||
      target.tournamentId !== source.tournamentId ||
      target.id === source.id ||
      target.hasOfficialResult
    ) {
      throw new Error('BRACKET_TARGET_STATE_INVALID');
    }
  }

  private async assignTarget(
    tx: Prisma.TransactionClient,
    target: LockedFixtureRow,
    targetSide: 'HOME' | 'AWAY',
    registrationId: string,
  ): Promise<void> {
    const current = targetSide === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
    const other = targetSide === 'HOME' ? target.awayRegistrationId : target.homeRegistrationId;
    if ((current !== null && current !== registrationId) || other === registrationId) {
      throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
    }
    if (current === registrationId) return;
    const updated = targetSide === 'HOME'
      ? await tx.$executeRaw`
          UPDATE v1_tournament_fixtures
          SET home_registration_id = ${registrationId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${target.id} AND home_registration_id IS NULL
        `
      : await tx.$executeRaw`
          UPDATE v1_tournament_fixtures
          SET away_registration_id = ${registrationId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${target.id} AND away_registration_id IS NULL
        `;
    if (updated !== 1) throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
    if (targetSide === 'HOME') target.homeRegistrationId = registrationId;
    else target.awayRegistrationId = registrationId;
  }
}
