import { Prisma, PrismaClient } from '@prisma/client';
import { GameResultOfficialFactsService } from '../../game-operations/game-result-official-facts.service';
import type { OfficialRevisionRow } from '../../game-operations/game-result-official-projection.types';
import { officialRevisionRowSelect } from '../../game-operations/official-revision-row.query';
import { parseOfficialScore } from '../../game-operations/parse-official-score';

/**
 * Operational backfill for the "team record screen shows 0 games while the
 * standings table shows real wins" bug (alpha finding): `v1_team_record_facts`
 * (and its sibling `v1_game_official_facts`) are written by
 * `GameResultOfficialFactsService.project()`, but that method is only ever
 * called from `GameResultOfficialProjectionService.handler` — the async
 * `GAME_RESULT_OFFICIAL` outbox handler. Games created directly by
 * `game-result-backfill.ts`'s `createImportedGame()` (the 21 tournament
 * results Task 10 imported) never go through the outbox at all: that
 * function inserts the Game + sides + OFFICIAL revision straight into the
 * DB in one transaction (confirmed by reading it — no `v1_outbox_events`
 * write anywhere in that file), so `GameResultOfficialFactsService.project()`
 * never ran for them. The tournament standings screen doesn't show the same
 * gap because it reads a different source (not `v1_team_record_facts`) —
 * see `public-team-records.service.ts` vs the standings projection for the
 * split.
 *
 * This module re-runs exactly the live path's fact-computation for every
 * revision that's missing it — it does NOT reimplement the WON/LOST/DRAWN
 * or goals-for/against calculation. `GameResultOfficialFactsService` is
 * imported and called directly (see `runTeamRecordFactsBackfill`'s apply
 * branch), so a future change to that calculation only has to happen once.
 * The candidate SELECT itself also reuses `officialRevisionRowSelect()` —
 * the exact same column list `GameResultOfficialProjectionService.
 * lockOfficialRevision()` uses for the live path — so a revision row here
 * has the identical shape the live handler would have produced.
 *
 * ## Current-official only (no double-counting superseded revisions)
 * The candidate query starts from `v1_games.current_official_revision_id`,
 * not from `v1_game_result_revisions.state = 'OFFICIAL'` alone — a game can
 * have MULTIPLE revisions that were once OFFICIAL (a correction supersedes
 * the prior one; see `decideResultRevision`/`createResultCorrection`), but
 * only the one `game.currentOfficialRevisionId` currently points at should
 * ever produce a team record fact. Scanning `state = 'OFFICIAL'` alone would
 * find every historical OFFICIAL revision, including ones a later correction
 * already superseded, and double-count that team's record. Requiring
 * `game.current_official_revision_id = revision.id` in the WHERE clause
 * structurally excludes every superseded revision — there is no separate
 * "is this superseded" flag to get wrong.
 *
 * ## Idempotency
 * A revision is a candidate only while it has no `v1_game_official_facts`
 * row yet (`LEFT JOIN ... WHERE fact.id IS NULL`) — the exact same
 * existence-gate `GameResultOfficialFactsService.project()` itself relies on
 * (`ON CONFLICT (revision_id) DO NOTHING` / `ON CONFLICT (revision_id,
 * team_id) DO NOTHING`, backed by the `@@unique` constraints on both
 * tables). The first successful `apply` run inserts both fact rows for a
 * revision inside the SAME transaction the candidate query ran in
 * (Serializable isolation), so that revision permanently leaves the
 * candidate set — a second `apply` run finds zero rows for anything the
 * first run touched and reports the same non-negative counts. A revision
 * that already has facts (e.g. it went through the live `GAME_RESULT_
 * OFFICIAL` handler normally) was never a candidate in the first place, for
 * the same reason — this backfill only ever fills the specific gap, never
 * revisits work already done.
 *
 * ## No fabrication
 * `parseOfficialScore()` is the same strict validator the live handler
 * uses. A revision whose `score` JSON doesn't parse (shouldn't happen for
 * anything that ever reached `OFFICIAL`, but the live handler doesn't
 * silently coerce it either — it throws, which fails the outbox job and
 * retries) is quarantined here (`CORRUPT_SCORE`) instead of guessing a
 * score or skipping silently. Nothing else in this module computes or
 * infers a fact field the live path wouldn't have — `GameResultOfficialFactsService.
 * project()` is the single source of truth for every column written.
 */

export type TeamRecordFactsBackfillQuarantineReason = 'CORRUPT_SCORE';

export type TeamRecordFactsBackfillQuarantine = {
  revisionId: string;
  gameId: string;
  reason: TeamRecordFactsBackfillQuarantineReason;
};

export type TeamRecordFactsBackfillCounts = {
  revisionsEligible: number;
  revisionsProjected: number;
  quarantined: number;
};

export type TeamRecordFactsBackfillResult = {
  counts: TeamRecordFactsBackfillCounts;
  quarantine: TeamRecordFactsBackfillQuarantine[];
};

// Row shape returned by the candidate query below -- officialAt/state are
// narrower once the WHERE clause has filtered to `state = 'OFFICIAL' AND
// official_at IS NOT NULL`, mirroring `GameResultOfficialProjectionService`'s
// own `LockedOfficialRevisionRow` / `lockOfficialRevision()` narrowing.
type CandidateRow = Omit<OfficialRevisionRow, 'officialAt'> & {
  state: string;
  officialAt: Date | null;
};

// Structural subset of PrismaClient satisfied by both PrismaClient itself
// (dry-run) and a Prisma.TransactionClient (inside the apply transaction) --
// mirrors goal-event-backfill.ts's MigrationReadClient split.
type MigrationReadClient = Pick<PrismaClient, '$queryRaw'>;

type CollectedCandidates = {
  revisionsEligible: number;
  toProject: OfficialRevisionRow[];
  quarantine: TeamRecordFactsBackfillQuarantine[];
};

/**
 * Single source of truth for what needs doing, read (never written) by both
 * the dry-run path and the first step of the apply transaction -- so the
 * two can never report different counts for the same database state (same
 * convention as fixture-game-backfill.ts / goal-event-backfill.ts's
 * collectCandidates()).
 */
async function collectCandidates(client: MigrationReadClient): Promise<CollectedCandidates> {
  const rows = await client.$queryRaw<CandidateRow[]>`
    ${officialRevisionRowSelect()}
    LEFT JOIN v1_game_official_facts fact ON fact.revision_id = revision.id
    WHERE game.current_official_revision_id = revision.id
      AND revision.state = 'OFFICIAL'
      AND revision.official_at IS NOT NULL
      AND fact.id IS NULL
    ORDER BY revision.id ASC
  `;

  const toProject: OfficialRevisionRow[] = [];
  const quarantine: TeamRecordFactsBackfillQuarantine[] = [];
  for (const row of rows) {
    try {
      parseOfficialScore(row.score);
    } catch {
      quarantine.push({ revisionId: row.revisionId, gameId: row.gameId, reason: 'CORRUPT_SCORE' });
      continue;
    }
    const officialAt = row.officialAt;
    // The WHERE clause above already asserts `revision.official_at IS NOT
    // NULL`, so this always resolves in practice -- kept as a defensive skip
    // (never expected to trigger) rather than a non-null assertion, mirroring
    // lockOfficialRevision()'s equivalent narrowing.
    if (officialAt === null) continue;
    toProject.push({
      revisionId: row.revisionId,
      gameId: row.gameId,
      revision: row.revision,
      score: row.score,
      sourceHash: row.sourceHash,
      officialAt,
      reason: row.reason,
      sourceType: row.sourceType,
      currentOfficialRevisionId: row.currentOfficialRevisionId,
      tournamentId: row.tournamentId,
      tournamentFixtureId: row.tournamentFixtureId,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      visibility: row.visibility,
    });
  }

  return { revisionsEligible: rows.length, toProject, quarantine };
}

function toResult(collected: CollectedCandidates): TeamRecordFactsBackfillResult {
  return {
    counts: {
      revisionsEligible: collected.revisionsEligible,
      revisionsProjected: collected.toProject.length,
      quarantined: collected.quarantine.length,
    },
    quarantine: collected.quarantine,
  };
}

const SERIALIZABLE_RETRY_LIMIT = 3;

export async function runTeamRecordFactsBackfill(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<TeamRecordFactsBackfillResult> {
  if (input.mode === 'dry-run') {
    return toResult(await collectCandidates(prisma));
  }

  return withSerializableRetry(prisma, async (tx) => {
    const collected = await collectCandidates(tx);
    const facts = new GameResultOfficialFactsService();
    for (const revision of collected.toProject) {
      // Re-parsing here (collectCandidates() already parsed once to decide
      // eligibility) rather than threading the parsed score through
      // CollectedCandidates keeps `toProject`'s element type exactly
      // `OfficialRevisionRow` -- the same shape GameResultOfficialFactsService.project()
      // takes on the live path -- instead of a backfill-only variant.
      // Cannot throw here: any row that would fail was already routed to
      // `quarantine` above and is absent from `toProject`.
      await facts.project(tx, revision, parseOfficialScore(revision.score));
    }
    return toResult(collected);
  });
}

async function withSerializableRetry<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === SERIALIZABLE_RETRY_LIMIT) {
        throw error;
      }
    }
  }
  throw new Error('Serializable team-record-facts backfill retry limit was exhausted');
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}
