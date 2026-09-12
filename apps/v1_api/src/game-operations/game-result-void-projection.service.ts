import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import { GameResultProjectionWatermarkService } from './game-result-projection-watermark.service';
import { LeagueCompletionProjectionService } from '../league-matches/league-completion-projection.service';
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import type { OfficialRevisionRow, OfficialRevisionRowRaw } from './game-result-official-projection.types';
import { normalizeOfficialRevisionRow } from './official-revision-row.normalizer';
import { officialRevisionRowSelect } from './official-revision-row.query';
import { parseOfficialScore } from './parse-official-score';
import * as canonicalAdvancement from './tournament-team-match-advancement';

type LockedVoidRevisionRow = OfficialRevisionRow & {
  state: string;
  supersedesId: string | null;
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
  // GAME_RESULT_OFFICIAL 쪽이 standings.project()를 부르는 것과 대칭
  // (game-result-official-projection.service.ts:66). 무효도 조 순위표에 반영된
  // 승점·득실을 되돌려야 하는 "조 구성을 바꾸는 조작"이라, 안 돌리면 무효 처리한
  // 경기의 승점이 공개 순위표에 영구히 남는다(감사 지적).
  private readonly standings = new GameResultStandingsProjectionService();

  // GAME_RESULT_OFFICIAL 쪽이 LeagueCompletionProjectionService.project() 를 부르는 것과
  // 대칭. 무효도 "남은 대진 집합을 줄이는 조작"이라 완료 판정을 다시 돌려야 한다 --
  // 안 돌리면 이의 수락으로 무효 처리된 대진 하나가 그 리그를 영원히 active 로 묶고
  // 승강까지 영구히 막는다(적대 리뷰 지적). 이 클래스는 의존 없는 순수 클래스라
  // official 쪽과 같은 방식으로 필드에서 직접 만든다.
  private readonly leagueCompletion = new LeagueCompletionProjectionService();

  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockVoidRevision(tx, this.revisionId(claim.payload));
    // A delayed void job must not hide or undo a newer official correction.
    if (revision.currentOfficialRevisionId !== revision.revisionId) return;
    if (revision.supersedesId === null) {
      throw new Error('GAME_RESULT_VOIDED_SUPERSEDES_REQUIRED');
    }
    await this.hidePublicCache(tx, revision);
    if (revision.tournamentTeamMatchId !== null) {
      if (revision.supersedesId !== null) {
        const previous = await tx.v1GameResultRevision.findUniqueOrThrow({
          where: { id: revision.supersedesId }, select: { gameId: true, score: true },
        });
        if (previous.gameId !== revision.gameId) throw new Error('BRACKET_SUPERSEDED_GAME_MISMATCH');
        await canonicalAdvancement.reverseCanonicalAdvancement(tx, revision, parseOfficialScore(previous.score));
      }
      // Use the same canonical normalized row for standings and advancement.
      await this.standings.project(tx, revision);
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
    if (revision.sourceType !== 'TEAM_MATCH' || revision.leagueId === null) return;
    await this.leagueCompletion.settle(tx, revision.leagueId, 'remaining_fixture_voided');
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

  private async lockVoidRevision(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ): Promise<LockedVoidRevisionRow> {
    const rows = await tx.$queryRaw<Array<Omit<OfficialRevisionRowRaw, 'officialAt'> & {
      state: string;
      officialAt: Date | null;
    }>>`
      ${officialRevisionRowSelect()}
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision, game
    `;
    const raw = rows[0];
    const officialAt = raw?.officialAt;
    if (raw === undefined || raw.state !== 'VOID' || officialAt === null || officialAt === undefined) {
      throw new Error(`GAME_RESULT_VOIDED revision ${revisionId} is not VOID`);
    }
    const normalized = normalizeOfficialRevisionRow({ ...raw, officialAt });
    if (normalized.teamMatchId === null) throw new Error('CANONICAL_MATCH_REQUIRED');
    const superseded = await tx.v1GameResultRevision.findUnique({
      where: { id: revisionId },
      select: { supersedesId: true },
    });
    if (superseded === null) throw new Error(`GAME_RESULT_VOIDED revision ${revisionId} not found`);
    const match = await tx.v1TeamMatch.findUnique({
      where: { id: normalized.teamMatchId },
      select: { deletedAt: true },
    });
    if (match === null || match.deletedAt !== null) {
      throw new Error('CANONICAL_MATCH_REQUIRED');
    }
    return { ...normalized, state: raw.state, supersedesId: superseded.supersedesId };
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
      sourceHash: revision.sourceHash,
    });
    for (const teamId of teamIds) {
      await this.watermarks.write(tx, {
        projection: 'TEAM_RECORD',
        entityType: 'TEAM',
        entityId: teamId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    }
    if (revision.tournamentId !== null) {
      await this.watermarks.write(tx, {
        projection: 'TOURNAMENT_RESULT',
        entityType: 'TOURNAMENT',
        entityId: revision.tournamentId,
        revisionId: revision.revisionId,
        sourceHash: revision.sourceHash,
      });
    }
  }
}
