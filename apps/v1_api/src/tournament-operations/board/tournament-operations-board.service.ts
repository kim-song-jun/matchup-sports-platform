import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, V1EscalationStatus, V1GameSideKey, V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ListTournamentOperationsQueryDto,
  StableWarningCode,
  TimeRelativeWarningCode,
} from './dto/list-operations-query.dto';
import {
  GAME_READ_AUTHORITY,
  type GameReadAuthorityPort,
} from './game-read-authority.port';

/**
 * Operations board snapshot/filter service (Task 18).
 *
 * ## Warning codes (sensible default, Decision #3 -- not defined by the plan or
 * docs/api/global-contract.md)
 * - `NO_FIELD_ASSIGNED`      -- `V1TournamentFixture.fieldId` is null. (stable)
 * - `NO_STAFF_ASSIGNED`      -- no live `FIELD_OPERATOR` assignment scopes this fixture's field
 *                               or fixture id directly (`tournament_director`/`support_readonly`
 *                               assignments are tournament-wide by policy and never carry a
 *                               field/fixture scope -- see tournament-staff-policy.ts's
 *                               `parseAssignment` invariant -- so they do not "cover" a specific
 *                               fixture for this warning). (time-relative -- `expiresAt` vs `now`)
 * - `LINEUP_NOT_SUBMITTED`   -- `scheduledAt - 60m` has passed (mirrors the D-02
 *                               `publicLineupAt` lock window) but either side's latest
 *                               `V1GameLineup.state` is still `DRAFT` (or missing entirely).
 *                               (time-relative -- `scheduledAt - 60m` vs `now`)
 * - `MISSING_SCORER`         -- the current/official `V1GameResultRevision.missingScorer` is
 *                               `true` (D-07). (stable)
 * - `RESULT_REVIEW_OVERDUE`  -- an open (`PENDING`|`ACKNOWLEDGED`) `V1ResultEscalation` exists
 *                               for the fixture's game (any of its result revisions). (stable)
 *
 * `warning=<code>` filters the *returned* items/liveWarnings to fixtures whose computed warning
 * set (stable ∪ time-relative) contains that code; the underlying keyset page (and therefore
 * `nextCursor`) is unaffected by this filter, so a filtered page can legitimately return fewer
 * than `limit` items while more remain on later pages -- callers must keep paging until
 * `nextCursor` is null. Filtering by a time-relative code means the *filtered* response is no
 * longer guaranteed clock-stable -- see the "stable body" section below.
 *
 * ## Stable body vs. time-relative part (D3 determinism hardening)
 * The response is split into a **hash-stable body** -- `{items, nextCursor, watermark}`, every
 * field of which is a pure function of persisted columns only, listed field-by-field below -- and
 * a separate **`liveWarnings`** array that is explicitly NOT part of the stable snapshot (its
 * content is a function of persisted state AND the wall-clock instant the request was served at).
 * A determinism oracle comparing two reads separated by real time with zero intervening writes
 * must compare `{items, nextCursor, watermark}` only and may ignore `liveWarnings`.
 *
 * Stable body field -> persisted source:
 * - `items[].fixtureId`            <- `V1TournamentFixture.id`
 * - `items[].tournamentId`         <- `V1TournamentFixture.tournamentId`
 * - `items[].round`                <- `V1TournamentFixture.round`
 * - `items[].fixtureNumber`        <- `V1TournamentFixture.fixtureNumber`
 * - `items[].gameId`               <- `V1Game.id` (via the fixture's `game` relation, nullable)
 * - `items[].gameState`            <- `V1Game.state`
 * - `items[].fieldId`              <- `V1TournamentFixture.fieldId`
 * - `items[].fieldName`            <- `V1TournamentField.name` (via `fixture.field`)
 * - `items[].homeRegistrationId`   <- `V1TournamentFixture.homeRegistrationId`
 * - `items[].awayRegistrationId`   <- `V1TournamentFixture.awayRegistrationId`
 * - `items[].scheduledAt`          <- `V1TournamentFixture.scheduledAt`
 * - `items[].currentScore`         <- `V1GameResultRevision.score` (via `game.currentOfficialRevision`)
 * - `items[].warnings`             <- `STABLE_WARNING_CODES` only, each computed from persisted
 *                                     columns alone (`NO_FIELD_ASSIGNED` <- `fieldId`,
 *                                     `MISSING_SCORER` <- `currentOfficialRevision.missingScorer`,
 *                                     `RESULT_REVIEW_OVERDUE` <- `V1ResultEscalation.status`)
 * - `items[].version`              <- `V1Game.version`
 * - `items[].revisionId`           <- `V1Game.currentOfficialRevisionId`
 * - `nextCursor`                   <- `V1TournamentFixture.id` of the last page row (keyset cursor)
 * - `watermark`                    <- `max(V1Game.version, V1Game.updatedAt, V1TournamentFixture.updatedAt)`
 *                                     across the page -- all persisted columns, no clock read
 *
 * `liveWarnings[].fixtureId` correlates back to `items[].fixtureId` (not new information);
 * `liveWarnings[].warnings` holds `TIME_RELATIVE_WARNING_CODES` only, each a function of
 * persisted state AND `now` (`NO_STAFF_ASSIGNED` <- `V1TournamentStaffAssignment.expiresAt` vs
 * `now`; `LINEUP_NOT_SUBMITTED` <- `V1TournamentFixture.scheduledAt - 60m` vs `now`, plus the
 * latest `V1GameLineup.state` per side).
 *
 * ## status filter
 * Reads `V1Game.state`, NOT `V1TournamentFixture.status` (`V1TournamentFixtureStatus`) --
 * `GamesService` never writes that column once the Game model became authoritative, so it is
 * dead/unmaintained and would silently under/over-match.
 *
 * ## Pagination
 * Deterministic keyset cursor on `(round, fixtureNumber, id)` via Prisma's native unique-id
 * cursor (`cursor: { id }, skip: 1`), so a 100-fixture tournament streams without
 * duplicate/loss and without N+1 -- exactly 4 bounded queries run per page regardless of page
 * size: (1) the fixture page itself, (2) lineups for the page's games, (3) open escalations for
 * the page's games, (4) live field_operator staff assignments for the tournament.
 *
 * ## watermark
 * NOT the Task-9 `V1ProjectionWatermark` table -- that model is reserved for the async official-
 * result projection pipeline (a distinct, already-shipped purpose) and reusing it here would
 * collide semantically. Sensible default (Decision #3): an opaque per-response token derived
 * from the max `(V1Game.version, V1Game.updatedAt)` (and fixture `updatedAt`, so a field
 * reassignment with no game change still moves the watermark) observed across the page. This is
 * unrelated to and does not vary with the `GAME_READ` flag -- content is always drawn from
 * V1Game/V1GameResultRevision regardless of flag, so watermark and body bytes stay identical
 * across legacy/compare/rollback (scripts/qa/verify-game-result-cutover.mjs's `liveCutover()`
 * hash-equality assertions).
 *
 * ## Time-relative warnings are a pure function of (persisted state, `now`)
 * `LINEUP_NOT_SUBMITTED` (scheduledAt-60m deadline) and staff-assignment coverage for
 * `NO_STAFF_ASSIGNED` (`expiresAt`) are genuinely time-relative business rules -- whether they
 * fire legitimately depends on the current instant, not solely on data written to the DB. Calling
 * `Date.now()`/`new Date()` freshly for *each row* (an earlier implementation) additionally let
 * the reference instant drift *within a single response* if row processing took any wall-clock
 * time. Both are eliminated by resolving `now` exactly ONCE per `list()` call and threading it
 * explicitly into `isLineupOverdue()`/`staffCoverage()` as a parameter (never read from inside
 * those functions) -- every row in one response is judged against the identical instant, and the
 * function becomes a pure function of its arguments (`now` included) rather than of ambient wall-
 * clock state. `now` defaults to `new Date()` (re-evaluated on every HTTP call, since the
 * controller never pins it -- so production behavior is unchanged, the board still reflects live
 * time) but can be pinned by a caller (see the "swap GAME_READ_AUTHORITY" HTTP test and the
 * "stable body is a pure function of persisted state" test in the Task 18 integration spec) for
 * exact reproducibility.
 *
 * Per-response internal consistency is NOT the same guarantee as cross-response determinism: two
 * `list()` calls separated by real wall-clock time, with ZERO intervening DB writes, CAN still
 * legitimately disagree on `LINEUP_NOT_SUBMITTED`/`NO_STAFF_ASSIGNED` if a fixture/assignment
 * straddles the `scheduledAt-60m`/`expiresAt` boundary between those calls -- that is correct,
 * live behavior, not a bug. Rather than requiring every caller to keep fixtures "safely away" from
 * those boundaries by convention, the two time-relative codes are structurally kept OUT of the
 * hash-stable body: they live only in the separate `liveWarnings` array (see the "Stable body vs.
 * time-relative part" section above), so `{items, nextCursor, watermark}` is provably invariant
 * under `now` alone. Any hash-equality check spanning real time (e.g.
 * scripts/qa/verify-game-result-cutover.mjs's `liveCutover()`, which hashes the *whole* response
 * body) still requires fixtures/assignments held away from those two boundaries so that
 * `liveWarnings` itself doesn't change either -- exactly as this spec's own fixtures already are
 * (`overdueFixture.scheduledAt` is 3h in the past; the seeded staff assignment has
 * `expiresAt: null`) -- but the *architectural* guarantee (stable body provably pure) no longer
 * depends on that convention being followed correctly.
 *
 * ## GAME_READ authority seam
 * The current `GAME_READ` value is read via a plain `findUnique` against the
 * `V1GameOperationFlag` Prisma model (mirrors the pattern already used in
 * games.service.ts:494 for `PUBLIC_LIVE`) -- NOT via `GameOperationFlagsService.getFlag()`,
 * which hard-gates to `platform_ops` (`assertPlatformOps`) and would wrongly 403 a
 * field_operator/support_readonly board viewer. Only when the flag is `'compare'` does the board
 * call `GAME_READ_AUTHORITY.resolve()` once per page row that has a current/official result; on
 * the first `'mismatch'` outcome it aborts building the response entirely and throws
 * `ConflictException` with `GAME_RESULT_READ_MISMATCH` before any partial body is serialized
 * (fail-closed for the whole page, not a per-row omission). Under `'legacy'`/`'new'` the
 * comparator is never called and the response is built identically to `'compare'`-with-no-
 * mismatch.
 */
@Injectable()
export class TournamentOperationsBoardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GAME_READ_AUTHORITY) private readonly readAuthority: GameReadAuthorityPort,
  ) {}

  /**
   * `now` is resolved ONCE here (defaulting to the real current instant) and threaded explicitly
   * into every time-relative computation below -- see the "Time-relative warnings" doc section
   * above for why this parameter exists instead of `isLineupOverdue()`/`staffCoverage()` each
   * calling `Date.now()`/`new Date()` internally.
   */
  async list(tournamentId: string, query: ListTournamentOperationsQueryDto, now: Date = new Date()) {
    const limit = query.limit ?? 20;

    const where: Prisma.V1TournamentFixtureWhereInput = {
      tournamentId,
      ...(query.fieldId ? { fieldId: query.fieldId } : {}),
      ...(query.status ? { game: { is: { state: query.status } } } : {}),
    };

    const rawRows = await this.prisma.v1TournamentFixture.findMany({
      where,
      orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tournamentId: true,
        round: true,
        fixtureNumber: true,
        fieldId: true,
        field: { select: { name: true } },
        homeRegistrationId: true,
        awayRegistrationId: true,
        scheduledAt: true,
        updatedAt: true,
        game: {
          select: {
            id: true,
            state: true,
            version: true,
            updatedAt: true,
            currentOfficialRevisionId: true,
            currentOfficialRevision: {
              select: { id: true, score: true, missingScorer: true },
            },
          },
        },
      },
    });

    const hasNext = rawRows.length > limit;
    const pageRows = hasNext ? rawRows.slice(0, limit) : rawRows;
    const nextCursor = hasNext ? pageRows[pageRows.length - 1].id : null;

    const gameIds = pageRows
      .map((row) => row.game?.id)
      .filter((gameId): gameId is string => gameId !== undefined);

    const [lineupLatestBySideKey, overdueGameIds, staffCoverage, gameReadFlag] = await Promise.all([
      this.latestLineupStateBySide(gameIds),
      this.overdueEscalationGameIds(gameIds),
      this.staffCoverage(tournamentId, now),
      this.prisma.v1GameOperationFlag.findUnique({
        where: { key: 'GAME_READ' },
        select: { value: true },
      }),
    ]);

    // Table is only ever populated by GameOperationFlagsService.ensureDefaults(); if that has
    // never run (e.g. a fresh environment), fall back to the documented default of 'legacy'
    // (GAME_OPERATION_FLAG_DEFAULTS.GAME_READ in config/game-operation-flags.ts).
    const isCompareMode = (gameReadFlag?.value ?? 'legacy') === 'compare';

    if (isCompareMode) {
      for (const row of pageRows) {
        if (row.game === null || row.game.currentOfficialRevisionId === null) continue;
        const result = await this.readAuthority.resolve({
          gameId: row.game.id,
          tournamentFixtureId: row.id,
        });
        if (result.outcome === 'mismatch') {
          throw new ConflictException({
            code: 'GAME_RESULT_READ_MISMATCH',
            message: '경기 결과 조회 값이 일치하지 않아 안전하게 처리했어요. 잠시 후 다시 시도해주세요.',
            details: { mismatch: result.detail },
          });
        }
      }
    }

    let maxVersion = 0;
    let maxUpdatedAtMs = 0;
    // Built as one array of {item, liveWarnings} pairs (rather than two independently-mapped
    // arrays) so the stable/time-relative split can never drift out of (fixtureId) alignment with
    // each other or with `pageRows`' deterministic order.
    const rows = pageRows.map((row) => {
      maxUpdatedAtMs = Math.max(maxUpdatedAtMs, row.updatedAt.getTime());
      if (row.game !== null) {
        maxVersion = Math.max(maxVersion, row.game.version);
        maxUpdatedAtMs = Math.max(maxUpdatedAtMs, row.game.updatedAt.getTime());
      }

      // Stable: a pure function of persisted columns alone -- see the "Stable body vs.
      // time-relative part" doc section for the field-by-field persisted source of each code.
      const warnings: StableWarningCode[] = [];
      if (row.fieldId === null) warnings.push('NO_FIELD_ASSIGNED');
      if (row.game?.currentOfficialRevision?.missingScorer === true) {
        warnings.push('MISSING_SCORER');
      }
      if (row.game !== null && overdueGameIds.has(row.game.id)) {
        warnings.push('RESULT_REVIEW_OVERDUE');
      }

      // Time-relative: additionally a function of `now` -- deliberately kept OUT of `warnings`
      // above and surfaced only via the separate `liveWarnings` array below.
      const liveWarnings: TimeRelativeWarningCode[] = [];
      if (!this.isStaffCovered(row.id, row.fieldId, staffCoverage)) {
        liveWarnings.push('NO_STAFF_ASSIGNED');
      }
      if (row.game !== null && this.isLineupOverdue(row.scheduledAt, row.game.id, lineupLatestBySideKey, now)) {
        liveWarnings.push('LINEUP_NOT_SUBMITTED');
      }

      return {
        item: {
          fixtureId: row.id,
          tournamentId: row.tournamentId,
          round: row.round,
          fixtureNumber: row.fixtureNumber,
          gameId: row.game?.id ?? null,
          gameState: row.game?.state ?? null,
          fieldId: row.fieldId,
          fieldName: row.field?.name ?? null,
          homeRegistrationId: row.homeRegistrationId,
          awayRegistrationId: row.awayRegistrationId,
          scheduledAt: row.scheduledAt,
          currentScore: row.game?.currentOfficialRevision?.score ?? null,
          warnings,
          version: row.game?.version ?? null,
          revisionId: row.game?.currentOfficialRevisionId ?? null,
        },
        liveWarningEntry: { fixtureId: row.id, warnings: liveWarnings },
      };
    });

    // `?warning=` matches against the UNION of stable + time-relative codes per fixture (Decision:
    // the filter must keep working across both groups), but filtering never mutates which group a
    // code is reported under -- a fixture matched only via a time-relative code still reports that
    // code in `liveWarnings`, never copied into the stable `items[].warnings`.
    const warningFilter: string | undefined = query.warning;
    const matchesWarningFilter = warningFilter
      ? ({ item, liveWarningEntry }: (typeof rows)[number]) =>
          (item.warnings as readonly string[]).includes(warningFilter) ||
          (liveWarningEntry.warnings as readonly string[]).includes(warningFilter)
      : () => true;
    const filteredRows = rows.filter(matchesWarningFilter);

    return {
      items: filteredRows.map((row) => row.item),
      nextCursor,
      watermark: this.encodeWatermark(maxVersion, maxUpdatedAtMs),
      // NOT part of the stable snapshot -- see the "Stable body vs. time-relative part" doc
      // section above. May legitimately differ between two reads separated by real wall-clock
      // time even with zero intervening DB writes.
      liveWarnings: filteredRows.map((row) => row.liveWarningEntry),
    };
  }

  private encodeWatermark(version: number, updatedAtMs: number): string {
    return Buffer.from(
      JSON.stringify({ v: version, t: new Date(updatedAtMs).toISOString() }),
    ).toString('base64url');
  }

  private async latestLineupStateBySide(
    gameIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (gameIds.length === 0) return new Map();
    const rows = await this.prisma.v1GameLineup.findMany({
      where: { gameId: { in: [...gameIds] } },
      orderBy: [{ gameId: 'asc' }, { sideId: 'asc' }, { revision: 'desc' }],
      select: { gameId: true, sideId: true, state: true },
    });
    const latest = new Map<string, string>();
    // Ordered by revision desc within (gameId, sideId), so the first row seen per key is latest.
    for (const row of rows) {
      const key = `${row.gameId}:${row.sideId}`;
      if (!latest.has(key)) latest.set(key, row.state);
    }
    return latest;
  }

  private isLineupOverdue(
    scheduledAt: Date | null,
    gameId: string,
    lineupLatestBySideKey: Map<string, string>,
    now: Date,
  ): boolean {
    if (scheduledAt === null) return false;
    const deadline = scheduledAt.getTime() - 60 * 60 * 1000;
    if (now.getTime() < deadline) return false;
    const homeState = lineupLatestBySideKey.get(`${gameId}:${V1GameSideKey.HOME}`);
    const awayState = lineupLatestBySideKey.get(`${gameId}:${V1GameSideKey.AWAY}`);
    return homeState === undefined || homeState === 'DRAFT' || awayState === undefined || awayState === 'DRAFT';
  }

  private async overdueEscalationGameIds(gameIds: readonly string[]): Promise<Set<string>> {
    if (gameIds.length === 0) return new Set();
    const rows = await this.prisma.v1ResultEscalation.findMany({
      where: {
        status: { in: [V1EscalationStatus.PENDING, V1EscalationStatus.ACKNOWLEDGED] },
        resultRevision: { gameId: { in: [...gameIds] } },
      },
      select: { resultRevision: { select: { gameId: true } } },
    });
    return new Set(rows.map((row) => row.resultRevision.gameId));
  }

  private async staffCoverage(
    tournamentId: string,
    now: Date,
  ): Promise<{ fieldIds: Set<string>; fixtureIds: Set<string> }> {
    const assignments = await this.prisma.v1TournamentStaffAssignment.findMany({
      where: {
        tournamentId,
        role: V1TournamentStaffRole.FIELD_OPERATOR,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { fieldId: true, fixtureScopes: { select: { fixtureId: true } } },
    });
    const fieldIds = new Set<string>();
    const fixtureIds = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.fieldId !== null) fieldIds.add(assignment.fieldId);
      for (const scope of assignment.fixtureScopes) fixtureIds.add(scope.fixtureId);
    }
    return { fieldIds, fixtureIds };
  }

  private isStaffCovered(
    fixtureId: string,
    fieldId: string | null,
    coverage: { fieldIds: Set<string>; fixtureIds: Set<string> },
  ): boolean {
    if (fieldId !== null && coverage.fieldIds.has(fieldId)) return true;
    return coverage.fixtureIds.has(fixtureId);
  }
}
