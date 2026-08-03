import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { compareGameResultSnapshots } from '../../games/migration/compare-game-result-reads';
import type { GameReadAuthorityPort, GameReadAuthorityResult } from './game-read-authority.port';
import { canonicalizeForHash } from './tournament-operations-board.service';

/**
 * Real (Task 26) `GAME_READ_AUTHORITY` implementation, bound at the composition root
 * (`app.module.ts`) via `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY,
 * useClass: CompareGameReadAuthorityService })`. Replaces the fail-closed
 * `DirectGameReadAuthorityService` stub so `GAME_READ === 'compare'` mode actually compares
 * something instead of unconditionally throwing `500 GAME_READ_AUTHORITY_NOT_CONFIGURED`.
 *
 * `resolve()` is only ever called by the board for `TOURNAMENT_FIXTURE` rows (see
 * `game-read-authority.port.ts` -- `detail.entity` is always `TOURNAMENT_FIXTURE:<fixtureId>`), so
 * this class only ever reads `V1TournamentFixtureResult` as the legacy source. It deliberately does
 * NOT read `V1TeamMatch` at all -- there is no port contract that would ever route a team-match
 * entity through this method, and guessing at one would be exactly the kind of silently-invented
 * behavior the project's "No Ambiguous Skipping" rule forbids.
 *
 * ## Two independent responsibilities, in order
 * 1. **Fresh-read-wins race detection**: the caller (the board) hands in `expectedGameVersion` /
 *    `expectedRevisionId` / `expectedScoreHash` captured at ITS read time. This method re-reads
 *    `V1Game` right now and, if ANY of those three disagree with what it just observed, returns
 *    `{ outcome: 'mismatch' }` immediately -- this is a concurrent-write race, not a "let me decide
 *    which value is right" situation (see the port's doc comment, "A conforming implementation of
 *    `resolve()` MUST treat..."). No legacy/projected content comparison happens in this branch
 *    because there is nothing yet to trust a comparison against.
 * 2. **Legacy-vs-projected content comparison**: only once identity is confirmed fresh does this
 *    method read the legacy `V1TournamentFixtureResult` (+ goals) for the same fixture, shape it
 *    into the same `{ regulation, penalty, goals, incomplete, provenance }` score envelope the
 *    Task-10/11 backfill (`games/migration/game-result-backfill.ts`) persists into
 *    `V1GameResultRevision.score` for `TOURNAMENT_FIXTURE`-sourced games, and diffs it against the
 *    just-read projected score via Task 10's own `compareGameResultSnapshots()` -- the same
 *    field-level differ the backfill's own evidence/gate tooling uses, so a content mismatch here
 *    reports the identical dotted `field` path (e.g. `'score.regulation.home'`) a human would see
 *    in the backfill's own comparison output.
 *
 * This class intentionally does NOT reuse `compare-game-result-reads.ts`'s `selectGameReadAuthority`
 * compare-mode branch: that function is designed for the BATCH backfill/cutover tool, where
 * `mode: 'compare'` means "keep serving the legacy response and surface the mismatch as evidence,
 * never throw" (see its own doc comment). This port's `resolve()` contract for the LIVE board read
 * path is the opposite -- fail closed on mismatch even in compare mode -- so this class builds its
 * own `SnapshotPair` per request and inspects `comparison.counts.mismatched` itself rather than
 * delegating outcome selection to that function.
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

    // Race: the game the board's snapshot pointed at is gone by the time we look. Never treated
    // as "nothing to compare, so approve" -- an absent game is strictly less trustworthy than a
    // present-but-different one.
    if (freshGame === null) {
      return mismatch(entity, input.expectedRevisionId, '$gameMissing');
    }
    // Defensive identity binding: `gameId` and `tournamentFixtureId` are two independent inputs
    // the caller supplied. Nothing upstream guarantees they were read together atomically by the
    // TIME this method runs (the board's own snapshot could theoretically be stitched from stale
    // state by a caller bug), so verify the fresh row's own FK actually agrees with the fixture id
    // the caller claims, instead of blindly trusting the pairing.
    if (freshGame.tournamentFixtureId !== input.tournamentFixtureId) {
      return mismatch(entity, input.expectedRevisionId, '$tournamentFixtureId');
    }
    if (freshGame.version !== input.expectedGameVersion) {
      return mismatch(entity, input.expectedRevisionId, '$gameVersion');
    }
    if (freshGame.currentOfficialRevisionId !== input.expectedRevisionId) {
      return mismatch(entity, input.expectedRevisionId, '$currentOfficialRevisionId');
    }
    const projectedScore = freshGame.currentOfficialRevision?.score ?? null;
    const freshScoreHash = createHash('sha256')
      .update(JSON.stringify(canonicalizeForHash(projectedScore)))
      .digest('hex');
    if (freshScoreHash !== input.expectedScoreHash) {
      // A same-revision-id, different-payload drift (see game-read-authority.port.ts) -- the
      // revision id survived but its score content changed underneath it.
      return mismatch(entity, input.expectedRevisionId, '$scoreHash');
    }

    // Identity confirmed fresh and unchanged from what the board is about to serialize. Now, and
    // only now, is a legacy-vs-projected content comparison meaningful.
    const legacyResult = await this.prisma.v1TournamentFixtureResult.findUnique({
      where: { fixtureId: input.tournamentFixtureId },
      select: {
        homeScore: true,
        awayScore: true,
        hasPenalty: true,
        homePenaltyScore: true,
        awayPenaltyScore: true,
        goals: {
          // Same ordering as games/migration/game-result-backfill.ts's inventorySources() so a
          // reordered-but-otherwise-identical goal list never reports a false field-index mismatch.
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { team: true, playerId: true, playerName: true, minute: true },
        },
      },
    });

    // No requirement #7: a missing legacy row is never a quiet 'ok'. A V1Game with an official
    // revision but no corresponding legacy result row is itself a data-integrity anomaly worth
    // failing closed on, not something to paper over as "nothing to compare against".
    if (legacyResult === null) {
      return mismatch(entity, input.expectedRevisionId, '$legacyResultMissing');
    }

    const legacyPenalty = penaltyScore(legacyResult);
    if (legacyPenalty === 'CORRUPT') {
      // A `hasPenalty: true` row with a null/negative penalty score can never be legitimately
      // represented as a comparable score envelope -- reported as its own sentinel field instead
      // of throwing, so it stays inside this port's exhaustive `{ outcome }` contract (the board
      // narrows the RUNTIME outcome value, not just the TS union) rather than becoming an opaque
      // unhandled 500 with none of this method's own diagnostic detail attached.
      return mismatch(entity, input.expectedRevisionId, '$legacyResultCorrupt');
    }

    const legacyScore = {
      regulation: { home: legacyResult.homeScore, away: legacyResult.awayScore },
      penalty: legacyPenalty,
      goals: legacyResult.goals.map((goal) => ({
        team: goal.team,
        playerId: goal.playerId,
        playerName: goal.playerName,
        minute: goal.minute,
      })),
      incomplete: false,
      provenance: 'TOURNAMENT_FIXTURE_RESULT' as const,
    };

    const comparison = compareGameResultSnapshots({
      // Not a batch run -- there is no meaningful "population" here, only this one request's
      // identity. Reusing the already-computed score hash keeps this deterministic per call
      // without fabricating a value that looks like (but isn't) a real batch-run population hash.
      populationHash: freshScoreHash,
      sourceRows: 1,
      partial: 0,
      quarantined: 0,
      pairs: [
        {
          identity: {
            entityType: 'TOURNAMENT_FIXTURE',
            entityId: input.tournamentFixtureId,
            revisionId: input.expectedRevisionId,
          },
          legacy: { score: legacyScore },
          projected: { score: projectedScore },
        },
      ],
    });

    const [firstMismatch] = comparison.mismatches;
    if (firstMismatch !== undefined) {
      return mismatch(entity, input.expectedRevisionId, firstMismatch.field);
    }

    return { outcome: 'ok' };
  }
}

function mismatch(entity: string, revision: string, field: string): GameReadAuthorityResult {
  return { outcome: 'mismatch', detail: { entity, revision, field } };
}

function isNonnegativeInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Mirrors `penaltyScore()` in `games/migration/game-result-backfill.ts`, but returns a `'CORRUPT'`
 * sentinel instead of throwing -- that file is a batch tool operating on already-`isValidFixture()`-
 * filtered rows, where an invalid penalty score can only mean a programming bug worth crashing the
 * whole run over. This method runs per live request against whatever is in the database right now
 * and must stay inside the port's `{ outcome }` contract instead of taking down a request with an
 * uncaught exception.
 */
function penaltyScore(result: {
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}): { home: number; away: number } | null | 'CORRUPT' {
  if (!result.hasPenalty) return null;
  if (!isNonnegativeInteger(result.homePenaltyScore) || !isNonnegativeInteger(result.awayPenaltyScore)) {
    return 'CORRUPT';
  }
  return { home: result.homePenaltyScore, away: result.awayPenaltyScore };
}
