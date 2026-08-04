import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { runGameResultBackfillEvidence } from '../../games/migration/game-result-backfill';
import type { GameResultMismatch } from '../../games/migration/compare-game-result-reads';
import type { GameReadAuthorityPort, GameReadAuthorityResult } from './game-read-authority.port';
import { canonicalizeForHash } from './tournament-operations-board.service';

/**
 * Real `GAME_READ_AUTHORITY` implementation, bound at the composition root (`app.module.ts`) via
 * `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass:
 * CompareGameReadAuthorityService })`. Replaces the fail-closed `DirectGameReadAuthorityService`
 * stub so `GAME_READ === 'compare'` actually compares something instead of unconditionally
 * throwing `500 GAME_READ_AUTHORITY_NOT_CONFIGURED`.
 *
 * ## Two responsibilities with DIFFERENT failure contracts
 *
 * 1. **Per-row identity freshness** (the port's own documented job). The board hands in
 *    `expectedGameVersion` / `expectedRevisionId` / `expectedScoreHash` captured at ITS read time;
 *    this method re-reads `V1Game` now and returns `{ outcome: 'mismatch' }` if any of them moved.
 *    That is a concurrent-write race, and the board turns it into its own
 *    `409 GAME_RESULT_READ_MISMATCH` — the contract Task 18 documents, tests
 *    (`test/tournaments/tournament-operations-board.integration-spec.ts`) and publishes in
 *    `docs/api/domains/tournament-operations.md`. Nothing here changes that.
 *
 * 2. **Population-wide legacy-vs-projected divergence** (Task 10's cutover kill switch). This is
 *    NOT a property of the row being rendered. `scripts/qa/verify-game-result-cutover.mjs` proves
 *    it by mutating a row in the backfill fixture's `10000000-…` id space and then asserting the
 *    board — which only ever renders the runtime manifest's deliberately disjoint `20000000-…`
 *    tournament (see the namespacing comment in `games/migration/task10-runtime-manifest.cli.ts`)
 *    — starts failing with the entity/field the comparator flagged. A per-row comparison can never
 *    satisfy that, because the diverging row is not on the board. So compare mode asks Task 10's
 *    real comparator about the WHOLE eligible population and fails every read closed while any
 *    divergence exists anywhere.
 *
 * That second failure is raised as a thrown `ConflictException` rather than an `{ outcome:
 * 'mismatch' }` return, for two reasons. It carries a different meaning than a per-row race, so it
 * needs its own code (`GAME_RESULT_COMPARISON_MISMATCH`) and the comparator's own
 * `{ entity, revision, field }` detail shape, which the board's own `details: { mismatch }`
 * envelope does not produce. And throwing from `resolve()` is this seam's established pattern —
 * the DEFAULT binding, `DirectGameReadAuthorityService`, does exactly that. Returning a
 * `mismatch` here instead would relabel a cutover-wide data-integrity stop as a transient
 * "try again" race, which is the opposite of what an operator must be told.
 *
 * ## Deliberately NOT here: reconstructing the legacy row per request
 *
 * An earlier revision of this class rebuilt the legacy `V1TournamentFixtureResult` envelope inline
 * and diffed it against the rendered row, treating a missing legacy row as a mismatch. That was
 * wrong twice over: it cannot see the divergence the harness injects (above), and a game with no
 * legacy counterpart is NORMAL — anything born in the new system, including the runtime manifest's
 * own seeded game, has an official revision and no `V1TournamentFixtureResult` at all. Failing
 * those closed made every clean compare-mode read 409. The eligible population is defined by the
 * backfill's own inventory, so deciding who is comparable is delegated to it rather than
 * re-derived here.
 */
@Injectable()
export class CompareGameReadAuthorityService implements GameReadAuthorityPort {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: {
    readonly gameId: string;
    readonly tournamentFixtureId: string;
    readonly expectedGameVersion: number;
    readonly expectedRevisionId: string;
    readonly expectedScoreHash: string;
  }): Promise<GameReadAuthorityResult> {
    const entity = `TOURNAMENT_FIXTURE:${input.tournamentFixtureId}`;

    const freshGame = await this.prisma.v1Game.findUnique({
      where: { id: input.gameId },
      select: {
        version: true,
        currentOfficialRevisionId: true,
        tournamentFixtureId: true,
        currentOfficialRevision: { select: { score: true } },
      },
    });

    // An absent game is strictly less trustworthy than a present-but-different one, so it is a
    // mismatch rather than a quiet approval.
    if (freshGame === null) {
      return mismatch(entity, input.expectedRevisionId, '$gameMissing');
    }
    // `gameId` and `tournamentFixtureId` arrive as two independent inputs. Nothing guarantees the
    // caller read them together atomically, so confirm the fresh row's own FK agrees with the
    // fixture id claimed rather than trusting the pairing.
    if (freshGame.tournamentFixtureId !== input.tournamentFixtureId) {
      return mismatch(entity, input.expectedRevisionId, '$tournamentFixtureId');
    }
    if (freshGame.version !== input.expectedGameVersion) {
      return mismatch(entity, input.expectedRevisionId, '$gameVersion');
    }
    if (freshGame.currentOfficialRevisionId !== input.expectedRevisionId) {
      return mismatch(entity, input.expectedRevisionId, '$currentOfficialRevisionId');
    }
    // Hashed with the board's own `canonicalizeForHash` (imported, never re-implemented): two
    // copies of a canonicalization whose entire purpose is drift detection would themselves drift
    // and report canonicalization differences as data differences.
    const freshScoreHash = createHash('sha256')
      .update(JSON.stringify(canonicalizeForHash(freshGame.currentOfficialRevision?.score ?? null)))
      .digest('hex');
    if (freshScoreHash !== input.expectedScoreHash) {
      // Same revision id, different payload underneath it — see game-read-authority.port.ts.
      return mismatch(entity, input.expectedRevisionId, '$scoreHash');
    }

    await this.assertPopulationConverged();
    return { outcome: 'ok' };
  }

  /**
   * Runs Task 10's real comparator over the eligible population and stops the read if anything
   * diverges. `mode: 'dry-run'` is read-only — it takes one inventory snapshot and compares; it
   * never inserts, so a live board read cannot mutate migration state.
   *
   * Intentionally NOT memoized across calls. The board invokes `resolve()` once per row, so a
   * cache would be the cheaper choice, but a cached verdict can only ever be wrong in the
   * dangerous direction: serving `ok` from a snapshot taken before a divergence appeared is
   * precisely the failure this kill switch exists to prevent. Compare mode is a transitional
   * cutover state, so paying the scan per row is the correct trade until `GAME_READ` moves to
   * `new` and this authority stops being consulted at all.
   */
  private async assertPopulationConverged(): Promise<void> {
    const evidence = await runGameResultBackfillEvidence(this.prisma, { mode: 'dry-run' });
    const [first] = evidence.comparison.mismatches;
    if (first === undefined) {
      return;
    }
    throw new ConflictException({
      code: 'GAME_RESULT_COMPARISON_MISMATCH',
      message: '레거시 결과와 새 결과가 달라서 조회를 중단했어요. 운영팀에 문의해주세요.',
      details: toComparisonDetail(first),
    });
  }
}

function mismatch(entity: string, revision: string, field: string): GameReadAuthorityResult {
  return { outcome: 'mismatch', detail: { entity, revision, field } };
}

/**
 * Mirrors `toCliMismatches()` in `games/migration/game-result-backfill.cli.ts` so an operator sees
 * the SAME `entity` / `revision` / `field` triple here that the backfill CLI's own evidence prints
 * for the same divergence — the harness asserts the two agree exactly.
 */
function toComparisonDetail(value: GameResultMismatch): {
  entity: string;
  revision: string;
  field: string;
} {
  return {
    entity: `${value.entityType}:${value.entityId}`,
    revision: value.revisionId,
    field: value.field,
  };
}
