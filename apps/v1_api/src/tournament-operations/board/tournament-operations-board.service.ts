import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, V1EscalationStatus, V1GameSideKey, V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffPrincipal } from '../../tournaments/staff/tournament-staff-access.service';
import type {
  ListTournamentOperationsQueryDto,
  StableWarningCode,
  TimeRelativeWarningCode,
} from './dto/list-operations-query.dto';
import { STABLE_WARNING_CODES } from './dto/list-operations-query.dto';
import {
  GAME_READ_AUTHORITY,
  type GameReadAuthorityPort,
} from './game-read-authority.port';

type Tx = Prisma.TransactionClient;

const GAME_READ_MODES = ['legacy', 'compare', 'new'] as const;
type GameReadMode = (typeof GAME_READ_MODES)[number];

/** Review finding #2: type guard so a `?warning=` value can be narrowed (and rejected when it
 * isn't stable) without an unchecked cast -- see `list()`'s use near the top of the method. */
function isStableWarningCode(code: string): code is StableWarningCode {
  return (STABLE_WARNING_CODES as readonly string[]).includes(code);
}

/** Recursively sorts object keys (alphabetically, `localeCompare`) so `JSON.stringify` of the
 * result is independent of the source's own key order -- mirrors `canonicalize()` in
 * `../../games/games.service.ts`. This matters specifically for `expectedScoreHash` below: Postgres
 * `jsonb` normalizes key order on storage, so `row.game.currentOfficialRevision.score` read back
 * from the DB can have keys in a different order than whatever order the score was originally
 * written in. Hashing the raw (non-canonical) `JSON.stringify` of that value would make
 * `expectedScoreHash` -- and therefore the GAME_READ=compare authority check and the board's own
 * hash-stable-body guarantee -- silently depend on jsonb key ordering, which is not part of the
 * actual data contract (two reads of an UNCHANGED score must hash identically; changing only key
 * order is not a change). */
function canonicalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForHash);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeForHash(nested)]),
    );
  }
  return value;
}

/**
 * Opaque, self-describing keyset-cursor tuple (Task 18 review P1-1/P1-2 fix).
 *
 * The PRIOR cursor was a raw `V1TournamentFixture.id`, resolved back to its owning row (and
 * `tournamentId`) via a `findUnique` on every page-2+ request. That design had two P1 defects:
 *
 * - P1-1 (existence oracle): a cursor id that matched no row at all fell through to a clean empty
 *   page (200), while a cursor id that DID exist but belonged to a DIFFERENT tournament was
 *   rejected with `400 OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH` -- two different, distinguishable
 *   responses that let a caller probe whether an arbitrary fixture id exists in some OTHER
 *   (possibly private) tournament, just by comparing which of the two responses came back.
 * - P1-2 (mutable/deletable anchor): resolving the cursor by re-reading the CURRENT row meant a
 *   walk broke the instant that anchor row was deleted (or its own `round`/`fixtureNumber`
 *   changed) between two page requests -- the next page's `findUnique` would find nothing, and
 *   the walk silently lost every remaining row instead of continuing from where it left off.
 *
 * The fix: `cursor`/`nextCursor` now carry the full `(tournamentId, round, fixtureNumber, id)`
 * sort-position tuple, opaque-encoded (base64url JSON) rather than embedded in a re-lookup-able
 * row id. This makes the cursor durable against the anchor row being deleted or re-sorted (the
 * NEXT page's WHERE predicate is built directly from the tuple the cursor carries, never by
 * re-reading a row that may no longer exist or may no longer sort where it used to), and makes a
 * cursor minted for one tournament INDISTINGUISHABLE, from the outside, from a cursor that never
 * existed at all when reused against a different tournament -- both decode fine but fail the
 * `tournamentId` check the same way, and BOTH are normalized to the exact same "clean empty page"
 * response (see `list()`), never a distinguishing 400. A cursor that fails to decode at all
 * (garbage/tampered string) is treated identically -- this is intentionally NOT a cryptographically
 * signed token (nothing in the tuple is a secret; tournamentId/round/fixtureNumber/id are already
 * visible in the very page whose `nextCursor` carries them), only a self-describing, opaque one.
 */
interface OperationsBoardCursorPayload {
  readonly tournamentId: string;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly id: string;
}

function encodeOperationsBoardCursor(payload: OperationsBoardCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Returns `null` for ANY malformed/tampered/foreign-shape input -- never throws -- so every
 * caller-supplied `cursor` that isn't a well-formed tuple this service itself minted is handled by
 * the exact same "invalid cursor" branch in `list()`, regardless of WHY it failed to decode. */
function decodeOperationsBoardCursor(raw: string): OperationsBoardCursorPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.tournamentId !== 'string' ||
    typeof candidate.round !== 'string' ||
    typeof candidate.fixtureNumber !== 'number' ||
    !Number.isInteger(candidate.fixtureNumber) ||
    typeof candidate.id !== 'string'
  ) {
    return null;
  }
  return {
    tournamentId: candidate.tournamentId,
    round: candidate.round,
    fixtureNumber: candidate.fixtureNumber,
    id: candidate.id,
  };
}

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
 * ## `warning=<code>` only accepts STABLE_WARNING_CODES (P0 fix, review finding #2)
 * `?warning=<code>` filters the *returned* `items`/`liveWarnings` to fixtures whose STABLE warning
 * set contains that code. Time-relative codes (`NO_STAFF_ASSIGNED`, `LINEUP_NOT_SUBMITTED`) are
 * REJECTED here (`BadRequestException`, `OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE`) -- see the
 * DTO's doc comment for why: filtering `items` by a value that depends on `now` would make the
 * claimed persisted-only stable body clock-dependent. This check runs in the service itself (not
 * only the HTTP `ValidationPipe`) because several callers (this service's own unit/integration
 * tests included) call `list()` directly, bypassing the DTO's `@IsIn` validator entirely. The
 * underlying keyset page (and therefore `nextCursor`) is unaffected by the `warning` filter, so a
 * filtered page can legitimately return fewer than `limit` items while more remain on later pages
 * -- callers must keep paging until `nextCursor` is null.
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
 * - `items[].stableRevision`       <- see "incremental key" section below (review finding #5)
 * - `nextCursor`                   <- opaque-encoded `(tournamentId, round, fixtureNumber, id)` of
 *                                     the last page row (see `OperationsBoardCursorPayload`, Task
 *                                     18 review P1-1/P1-2 fix -- no longer a bare fixture id)
 * - `watermark`                    <- hash of the page's ordered `(fixtureId, stableRevision)`
 *                                     pairs (see below) -- all persisted columns, no clock read
 *
 * `liveWarnings[].fixtureId` correlates back to `items[].fixtureId` (not new information);
 * `liveWarnings[].warnings` holds `TIME_RELATIVE_WARNING_CODES` only, each a function of
 * persisted state AND `now` (`NO_STAFF_ASSIGNED` <- `V1TournamentStaffAssignment.expiresAt` vs
 * `now`; `LINEUP_NOT_SUBMITTED` <- `V1TournamentFixture.scheduledAt - 60m` vs `now`, plus the
 * latest `V1GameLineup.state` per side).
 *
 * ## Incremental key: `items[].stableRevision` + hashed `watermark` (P0 fix, review finding #5)
 * `(fixtureId, version, revisionId)` cannot identify every stable-body change: `version`/
 * `revisionId` are `V1Game` fields, so a fixture-only mutation (field (re)assignment, a field
 * rename, an escalation transition between two non-`RESULT_REVIEW_OVERDUE`-relevant states that
 * still touches `V1ResultEscalation.version`) can change the response without moving either. A
 * fixture with no game at all always has `version:null, revisionId:null` and was previously
 * indistinguishable from any other game-less fixture regardless of its own mutations.
 *
 * Each item now carries `stableRevision` -- a `sha256` hex digest over EVERY persisted input that
 * can change that item's stable fields: `V1TournamentFixture.updatedAt`, `V1TournamentField.version`
 * (nullable), `V1Game.version`+`updatedAt` (nullable), `V1Game.currentOfficialRevisionId`
 * (nullable), the CANONICALIZED `V1GameResultRevision.score`+`missingScorer` of that current
 * official revision (nullable; Task 18 review P0-5 -- `currentOfficialRevisionId` alone is a proxy
 * for "which revision is official", not that revision's own content, so it cannot by itself detect
 * a same-revision score/missingScorer change), and the max `V1ResultEscalation.version`/`updatedAt`
 * across ALL (not only open) escalations tied to the fixture's game -- so an escalation closing
 * (open -> closed) also moves this hash even though it does not, by itself, change
 * `RESULT_REVIEW_OVERDUE`'s stable boolean membership for a fixture that already had other reasons
 * to carry that code, or none at all.
 * `watermark` is the hash of the page's ordered `(fixtureId, stableRevision)` list rather than two
 * running maxima, so it moves whenever ANY item's `stableRevision` moves, regardless of which
 * underlying model changed. A correct client diff is: compare `stableRevision` per `fixtureId`
 * (fall back to "present in one snapshot but not the other" for adds/removals within the walked
 * range); `version`/`revisionId` remain in the response for backward-compatible consumers but are
 * no longer sufficient on their own to detect every change -- `stableRevision` is.
 *
 * ## status filter
 * Reads `V1Game.state`, NOT `V1TournamentFixture.status` (`V1TournamentFixtureStatus`) --
 * `GamesService` never writes that column once the Game model became authoritative, so it is
 * dead/unmaintained and would silently under/over-match.
 *
 * ## Pagination (review finding #7, hardened again by Task 18 review P1-1/P1-2)
 * Deterministic keyset cursor on `(round, fixtureNumber, id)` -- `id` is a total tie-breaker so
 * the sort order itself is total. `cursor`/`nextCursor` carry an opaque-encoded
 * `OperationsBoardCursorPayload` (`{tournamentId, round, fixtureNumber, id}, see that type's doc
 * comment) rather than a bare `V1TournamentFixture.id`: the NEXT page's WHERE predicate is built
 * directly from the tuple the cursor itself carries (`(round, fixtureNumber, id) > cursor tuple`,
 * lexicographically), never by re-reading a row that may have been deleted or re-sorted since the
 * cursor was minted (P1-2), and a cursor decoded for a DIFFERENT tournament than the one being
 * queried is treated exactly the same as a cursor that fails to decode at all -- both collapse to
 * the identical "clean empty page" response, never a distinguishing error that would leak whether
 * some OTHER tournament's fixture exists (P1-1). See `list()`'s own handling of `cursorPayload`/
 * `cursorInvalid` below.
 *
 * **What this pagination DOES and does NOT guarantee, stated precisely:** for any row already
 * emitted by a walk (or any row that existed, matched the filter, and had not yet been emitted at
 * the moment its page was queried), the walk will emit it exactly once, in total `(round,
 * fixtureNumber, id)` order, with no duplicates -- this holds even if OTHER rows are concurrently
 * inserted, updated, or deleted, and even if the cursor's own row is later deleted (P1-2: the
 * cursor no longer needs that row to still exist at all). It does NOT guarantee that a row
 * inserted (or mutated to newly match the filter) so that it sorts BEFORE the walk's current
 * position will be retroactively included in that same walk -- this is the standard, expected
 * trade-off of forward-only keyset pagination shared by this repo's other cursor-paginated
 * endpoints (docs/api/global-contract.md's "opaque cursor" contract) and not a defect specific to
 * this endpoint: a client that needs to observe such a row starts a new walk (`cursor` omitted).
 * `nextCursor`/`watermark` are unrelated concerns; a client that wants to detect ALL changes across
 * two full walks should compare `stableRevision` per `fixtureId` as described above, not rely on
 * pagination alone.
 *
 * ## watermark
 * NOT the Task-9 `V1ProjectionWatermark` table -- that model is reserved for the async official-
 * result projection pipeline (a distinct, already-shipped purpose) and reusing it here would
 * collide semantically. Content is always drawn from the same persisted columns regardless of the
 * `GAME_READ` flag, so watermark and body bytes stay identical across legacy/compare/rollback
 * (scripts/qa/verify-game-result-cutover.mjs's `liveCutover()` hash-equality assertions).
 *
 * ## Time-relative warnings are a pure function of (persisted state, `now`)
 * `LINEUP_NOT_SUBMITTED` (scheduledAt-60m deadline) and staff-assignment coverage for
 * `NO_STAFF_ASSIGNED` (`expiresAt`) are genuinely time-relative business rules -- whether they
 * fire legitimately depends on the current instant, not solely on data written to the DB. `now` is
 * resolved exactly ONCE per `list()` call and threaded explicitly into `isLineupOverdue()`/
 * `staffCoverage()` as a parameter (never read from inside those functions) -- every row in one
 * response is judged against the identical instant. `now` defaults to `new Date()` (re-evaluated
 * on every HTTP call, since the controller never pins it) but can be pinned by a caller for exact
 * reproducibility.
 *
 * Per-response internal consistency is NOT the same guarantee as cross-response determinism: two
 * `list()` calls separated by real wall-clock time, with ZERO intervening DB writes, CAN still
 * legitimately disagree on `LINEUP_NOT_SUBMITTED`/`NO_STAFF_ASSIGNED` if a fixture/assignment
 * straddles the `scheduledAt-60m`/`expiresAt` boundary between those calls -- that is correct,
 * live behavior, not a bug. The two time-relative codes are structurally kept OUT of the
 * hash-stable body: they live only in the separate `liveWarnings` array, so `{items, nextCursor,
 * watermark}` is provably invariant under `now` alone (and, per the fix above, can no longer be
 * perturbed by the `warning` query filter either).
 *
 * ## Single consistent read snapshot (P1 fix, review finding #6)
 * All persisted reads that feed the stable body -- the fixture page, lineups, `V1GameSide` rows,
 * escalations, staff assignments, and the `GAME_READ` flag -- now run inside ONE
 * `RepeatableRead` Prisma interactive transaction, so the response reflects a single database
 * instant rather than tearing across several independent round-trips (an escalation opening/
 * closing, or a staff assignment being granted/revoked, between two of the previously-independent
 * queries could previously produce a response that never corresponded to any real committed
 * state). The compare-mode authority call and its post-resolution CAS recheck (review finding #3)
 * deliberately run AFTER that transaction commits, using fresh non-transactional reads -- holding
 * a `RepeatableRead` snapshot open across an arbitrary external comparator call (which, once Task
 * 10 lands, may not even share this process's Prisma connection) is an anti-pattern independent of
 * this fix, so consistency for THAT seam is instead provided by binding the authority call to
 * explicit expected values and re-verifying them fresh afterward -- see the port's doc comment.
 *
 * ## GAME_READ authority seam (P0 fix, review finding #4; hardened again by Task 18 review P1-7)
 * The current `GAME_READ` value is read via a plain `findUnique` against the
 * `V1GameOperationFlag` Prisma model (mirrors the pattern already used in
 * games.service.ts:494 for `PUBLIC_LIVE`) -- NOT via `GameOperationFlagsService.getFlag()`,
 * which hard-gates to `platform_ops` (`assertPlatformOps`) and would wrongly 403 a
 * field_operator/support_readonly board viewer. A MISSING flag row now fails closed with
 * `InternalServerErrorException` (`GAME_READ_FLAG_MISSING`) rather than silently defaulting to
 * `'legacy'` -- P1-7: a missing row is indistinguishable at runtime from "an operator/bad
 * migration deleted the row while GAME_READ=compare's mismatch protection was relied on", and a
 * silent legacy fallback would disable that protection with no error and no signal anyone would
 * ever see. `GameOperationFlagsService.ensureDefaults()`/its seed migration is relied upon to
 * guarantee this row's presence; a fresh environment must seed it explicitly rather than lean on
 * this method's runtime default. A flag row that EXISTS with a value other than exactly
 * `'legacy'`, `'compare'`, or `'new'` is likewise fail-closed with `InternalServerErrorException`
 * (`GAME_READ_FLAG_INVALID`), since the board cannot determine which mode was intended and must
 * refuse rather than guess. Only when the (validated) mode is
 * `'compare'` does the board call `GAME_READ_AUTHORITY.resolve()` once per page row that has a
 * current/official result, bound to that row's exact `expectedGameVersion`/`expectedRevisionId`/
 * `expectedScoreHash`; on the first `'mismatch'` outcome (or a post-resolution CAS mismatch) it
 * aborts building the response entirely and throws `ConflictException` before any partial body is
 * serialized (fail-closed for the whole page, not a per-row omission). Under `'legacy'`/`'new'`
 * the comparator is never called. The DEFAULT `GAME_READ_AUTHORITY` binding
 * (`DirectGameReadAuthorityService`) itself now throws if ever actually invoked, rather than
 * always returning `{ outcome: 'ok' }` -- see that class's doc comment -- so a composition root
 * that flips `GAME_READ=compare` without wiring a real comparator fails loudly instead of silently
 * approving every result.
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
   *
   * ## `principal` re-verification (Task 18 review P0-2)
   * `TournamentStaffGuard` computes a `TournamentStaffPrincipal` before this method is ever
   * reached over HTTP (see `tournament-operations-board.controller.ts`), but that decision and
   * THIS transaction's own reads are two separate moments in time -- an assignment revoked (or an
   * admin grant deactivated) in between must not still be served a response built from the
   * snapshot that decision authorized. When `principal` is supplied, `reverifyPrincipal()` re-reads
   * the EXACT admin/assignment row the guard's decision was based on as the very first statement
   * inside this method's own `RepeatableRead` transaction -- a revoke that fully committed before
   * this transaction's own snapshot was taken is always observed and denied here. Deliberately
   * UNLOCKED (no `FOR SHARE`), unlike `TournamentStaffAccessService.assertAccess()`'s own `tx`-aware
   * P0-3 fix: see `reverifyPrincipal()`'s own doc comment for why a locking read is the wrong tool
   * inside a `RepeatableRead` transaction specifically. `principal` is optional and, when omitted,
   * this recheck is skipped entirely -- every direct service-level caller in this file's own test
   * suite bypasses `TournamentStaffGuard` altogether already (there is no principal to re-verify),
   * and remains unaffected.
   */
  async list(
    tournamentId: string,
    query: ListTournamentOperationsQueryDto,
    now: Date = new Date(),
    principal?: TournamentStaffPrincipal,
  ) {
    const limit = query.limit ?? 20;

    // Review finding #2: reject a time-relative `warning` value here too, defensively, for any
    // caller (this service's own tests included) that calls `list()` directly and bypasses the
    // HTTP `ValidationPipe`/DTO `@IsIn` check. Captured into a local so the type-guard narrowing
    // below is reliable (narrowing a destructured/aliased object property across a user-defined
    // type guard is not as consistently supported by TS as narrowing a local `const`).
    const rawWarning = query.warning;
    if (rawWarning !== undefined && !isStableWarningCode(rawWarning)) {
      throw new BadRequestException({
        code: 'OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE',
        message:
          '해당 경고는 실시간(시간 의존) 값이라 목록 필터로 사용할 수 없어요. 전체 목록을 조회한 뒤 liveWarnings로 걸러주세요.',
      });
    }
    // Narrowed by the guard above (throws otherwise): safe to treat as stable-only from here on.
    const warningFilter: StableWarningCode | undefined = rawWarning;

    const where: Prisma.V1TournamentFixtureWhereInput = {
      tournamentId,
      ...(query.fieldId ? { fieldId: query.fieldId } : {}),
      ...(query.status ? { game: { is: { state: query.status } } } : {}),
    };

    // Review finding #6: every persisted read that feeds the stable body runs inside one
    // RepeatableRead transaction so the response reflects a single database instant.
    const snapshot = await this.prisma.$transaction(
      async (tx) => {
        // Task 18 review P0-2: re-verify the caller's authorization fresh, inside this
        // transaction, as literally the first statement -- see this method's doc comment.
        if (principal !== undefined) {
          await this.reverifyPrincipal(tx, tournamentId, principal, now);
        }
        // Task 18 review P1-1/P1-2: decode the self-describing cursor tuple (if any) BEFORE
        // running the main page query, entirely without touching the database -- see
        // `OperationsBoardCursorPayload`'s doc comment above. A cursor that fails to decode and a
        // cursor that decodes but names a DIFFERENT tournament are both `cursorInvalid`, and both
        // collapse to the exact same "clean empty page" branch below -- there is no distinguishing
        // response for a caller to use as a cross-tournament existence oracle.
        const cursorPayload =
          query.cursor !== undefined ? decodeOperationsBoardCursor(query.cursor) : undefined;
        const cursorInvalid =
          query.cursor !== undefined &&
          (cursorPayload === null || cursorPayload.tournamentId !== tournamentId);

        const cursorPredicate: Prisma.V1TournamentFixtureWhereInput | undefined =
          cursorPayload != null && !cursorInvalid
            ? {
                OR: [
                  { round: { gt: cursorPayload.round } },
                  { round: cursorPayload.round, fixtureNumber: { gt: cursorPayload.fixtureNumber } },
                  {
                    round: cursorPayload.round,
                    fixtureNumber: cursorPayload.fixtureNumber,
                    id: { gt: cursorPayload.id },
                  },
                ],
              }
            : undefined;

        const rawRows = cursorInvalid
          ? []
          : await tx.v1TournamentFixture.findMany({
              where: cursorPredicate === undefined ? where : { ...where, ...cursorPredicate },
              orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }, { id: 'asc' }],
              take: limit + 1,
              select: {
                id: true,
                tournamentId: true,
                round: true,
                fixtureNumber: true,
                fieldId: true,
                field: { select: { name: true, version: true } },
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
        const lastRow = pageRows[pageRows.length - 1];
        const nextCursor = hasNext
          ? encodeOperationsBoardCursor({
              tournamentId,
              round: lastRow.round,
              fixtureNumber: lastRow.fixtureNumber,
              id: lastRow.id,
            })
          : null;

        const gameIds = pageRows
          .map((row) => row.game?.id)
          .filter((gameId): gameId is string => gameId !== undefined);
        // Task 18 review P1-6: bound the staff-coverage read to the CURRENT page's own
        // fieldIds/fixtureIds instead of every active FIELD_OPERATOR assignment (and every one of
        // its fixture scopes) in the whole tournament -- see `staffCoverage()`'s doc comment.
        const pageFieldIds = [
          ...new Set(pageRows.map((row) => row.fieldId).filter((id): id is string => id !== null)),
        ];
        const pageFixtureIds = pageRows.map((row) => row.id);

        const [lineupLatestBySideKey, escalationSummaryMap, staffCoverageResult, gameReadFlag] =
          await Promise.all([
            this.latestLineupStateBySide(tx, gameIds),
            this.escalationSummaryByGameId(tx, gameIds),
            this.staffCoverage(tx, tournamentId, now, pageFieldIds, pageFixtureIds),
            tx.v1GameOperationFlag.findUnique({
              where: { key: 'GAME_READ' },
              select: { value: true },
            }),
          ]);

        return {
          pageRows,
          nextCursor,
          lineupLatestBySideKey,
          escalationSummaryMap,
          staffCoverageResult,
          gameReadFlag,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const {
      pageRows,
      nextCursor,
      lineupLatestBySideKey,
      escalationSummaryMap,
      staffCoverageResult,
      gameReadFlag,
    } = snapshot;

    // Task 18 review P1-7 (supersedes the prior "missing row defaults to legacy" design): a
    // MISSING `GAME_READ` flag row is no longer treated as an implicit, safe 'legacy' default --
    // it now fails closed with `500 GAME_READ_FLAG_MISSING`. The prior design reasoned that a
    // missing row could only mean "a fresh environment where GameOperationFlagsService.
    // ensureDefaults() has never run", and defaulted to legacy as a convenience for that case. The
    // review correctly points out that reasoning conflates two indistinguishable-at-runtime
    // situations: a genuinely fresh environment, and an operator (or a bad migration/rollback)
    // having deleted this row by mistake in an environment that was previously running
    // GAME_READ=compare -- in the SECOND case, silently falling back to 'legacy' silently
    // DISABLES the compare-mode mismatch/staleness protection with no error, no log a caller would
    // ever see, and no signal to the operator that the safety net is gone. A missing invariant row
    // must fail loudly, exactly like an unrecognized value already does, rather than fail open.
    // `GameOperationFlagsService.ensureDefaults()`/its seed migration is what is now relied on to
    // guarantee this row's presence; a fresh environment must seed it explicitly.
    if (gameReadFlag === null) {
      throw new InternalServerErrorException({
        code: 'GAME_READ_FLAG_MISSING',
        message: '경기 결과 조회 모드 설정이 초기화되지 않았어요. 운영팀에 문의해주세요.',
      });
    }
    const rawGameReadValue = gameReadFlag.value;
    if (!(GAME_READ_MODES as readonly string[]).includes(rawGameReadValue)) {
      throw new InternalServerErrorException({
        code: 'GAME_READ_FLAG_INVALID',
        message: '경기 결과 조회 모드 설정값이 올바르지 않아요. 운영팀에 문의해주세요.',
      });
    }
    const gameReadMode: GameReadMode = rawGameReadValue as GameReadMode;
    const isCompareMode = gameReadMode === 'compare';

    if (isCompareMode) {
      // Review finding #3 / Task 18 review P0-4: bind the authority decision to the EXACT
      // revision/score this response is about to serialize, then re-verify (CAS-style, fresh
      // non-transactional read) that nothing changed between the snapshot above and this point,
      // for every row the authority approved. P0-4 fix: `expectedScoreHash`/`missingScorer` are now
      // ALSO tracked and re-checked below (previously only `version`/`currentOfficialRevisionId`
      // were), so a write that mutates the SAME official revision's score/missingScorer in place
      // (no production write path does this today, see the `stableRevision` doc comment above --
      // but the CAS recheck existing purely to guard `version`/`revisionId` while silently trusting
      // the score/missingScorer payload underneath them was never a real guarantee) is caught too.
      const expectedByGameId = new Map<
        string,
        { version: number; revisionId: string; scoreHash: string; missingScorer: boolean }
      >();
      for (const row of pageRows) {
        if (row.game === null || row.game.currentOfficialRevisionId === null) continue;
        const expectedGameVersion = row.game.version;
        const expectedRevisionId = row.game.currentOfficialRevisionId;
        const expectedScoreHash = createHash('sha256')
          .update(JSON.stringify(canonicalizeForHash(row.game.currentOfficialRevision?.score ?? null)))
          .digest('hex');
        const result = await this.readAuthority.resolve({
          gameId: row.game.id,
          tournamentFixtureId: row.id,
          expectedGameVersion,
          expectedRevisionId,
          expectedScoreHash,
        });
        // P0-4 fix: exhaustively narrow the RUNTIME value, not just the TypeScript union -- a
        // `GAME_READ_AUTHORITY` implementation (Task 10's real comparator is not present in this
        // worktree) is external input as far as this method is concerned, and nothing at runtime
        // stopped a value that is neither `'ok'` nor `'mismatch'` from being silently treated as
        // approval by an `else`-less `if (outcome === 'mismatch') throw`. Fail closed on anything
        // unrecognized instead of defaulting to "approved".
        if (result.outcome === 'ok') {
          expectedByGameId.set(row.game.id, {
            version: expectedGameVersion,
            revisionId: expectedRevisionId,
            scoreHash: expectedScoreHash,
            missingScorer: row.game.currentOfficialRevision?.missingScorer ?? false,
          });
        } else if (result.outcome === 'mismatch') {
          throw new ConflictException({
            code: 'GAME_RESULT_READ_MISMATCH',
            message: '경기 결과 조회 값이 일치하지 않아 안전하게 처리했어요. 잠시 후 다시 시도해주세요.',
            details: { mismatch: result.detail },
          });
        } else {
          throw new InternalServerErrorException({
            code: 'GAME_READ_AUTHORITY_INVALID_RESULT',
            message: '경기 결과 조회 비교 결과를 해석할 수 없어요. 운영팀에 문의해주세요.',
          });
        }
      }

      if (expectedByGameId.size > 0) {
        const freshGameRows = await this.prisma.v1Game.findMany({
          where: { id: { in: [...expectedByGameId.keys()] } },
          select: {
            id: true,
            version: true,
            currentOfficialRevisionId: true,
            currentOfficialRevision: { select: { score: true, missingScorer: true } },
          },
        });
        // P0-4 fix: an expected game missing entirely from the fresh read (e.g. deleted between
        // the snapshot and this point) must not silently pass just because the loop below only
        // ever iterates rows that DID come back -- require exact coverage of every game the
        // authority approved.
        if (freshGameRows.length !== expectedByGameId.size) {
          throw new ConflictException({
            code: 'GAME_RESULT_READ_STALE',
            message: '경기 결과가 조회 도중 변경되어 안전하게 처리했어요. 다시 시도해주세요.',
            details: { reason: 'EXPECTED_GAME_MISSING' },
          });
        }
        for (const fresh of freshGameRows) {
          const expected = expectedByGameId.get(fresh.id);
          if (expected === undefined) continue;
          const freshScoreHash = createHash('sha256')
            .update(JSON.stringify(canonicalizeForHash(fresh.currentOfficialRevision?.score ?? null)))
            .digest('hex');
          const freshMissingScorer = fresh.currentOfficialRevision?.missingScorer ?? false;
          if (
            fresh.version !== expected.version ||
            fresh.currentOfficialRevisionId !== expected.revisionId ||
            freshScoreHash !== expected.scoreHash ||
            freshMissingScorer !== expected.missingScorer
          ) {
            throw new ConflictException({
              code: 'GAME_RESULT_READ_STALE',
              message: '경기 결과가 조회 도중 변경되어 안전하게 처리했어요. 다시 시도해주세요.',
              details: { gameId: fresh.id },
            });
          }
        }
      }
    }

    // Built as one array of {item, liveWarnings} pairs (rather than two independently-mapped
    // arrays) so the stable/time-relative split can never drift out of (fixtureId) alignment with
    // each other or with `pageRows`' deterministic order.
    const rows = pageRows.map((row) => {
      const fieldVersion = row.field?.version ?? null;
      const gameVersion = row.game?.version ?? null;
      const gameUpdatedAtMs = row.game?.updatedAt.getTime() ?? null;
      const revisionId = row.game?.currentOfficialRevisionId ?? null;
      const escalationSummary =
        (row.game !== null ? escalationSummaryMap.get(row.game.id) : undefined) ?? {
          overdue: false,
          maxVersion: 0,
          maxUpdatedAtMs: 0,
        };

      // Stable: a pure function of persisted columns alone -- see the "Stable body vs.
      // time-relative part" doc section for the field-by-field persisted source of each code.
      const warnings: StableWarningCode[] = [];
      if (row.fieldId === null) warnings.push('NO_FIELD_ASSIGNED');
      if (row.game?.currentOfficialRevision?.missingScorer === true) {
        warnings.push('MISSING_SCORER');
      }
      if (escalationSummary.overdue) {
        warnings.push('RESULT_REVIEW_OVERDUE');
      }

      // Time-relative: additionally a function of `now` -- deliberately kept OUT of `warnings`
      // above and surfaced only via the separate `liveWarnings` array below.
      const liveWarnings: TimeRelativeWarningCode[] = [];
      if (!this.isStaffCovered(row.id, row.fieldId, staffCoverageResult)) {
        liveWarnings.push('NO_STAFF_ASSIGNED');
      }
      if (row.game !== null && this.isLineupOverdue(row.scheduledAt, row.game.id, lineupLatestBySideKey, now)) {
        liveWarnings.push('LINEUP_NOT_SUBMITTED');
      }

      // Review finding #5 / Task 18 review P0-5: one hash covering every persisted input that can
      // move this item's stable fields -- see the "Incremental key" doc section above.
      //
      // P0-5 fix: `revisionId` alone is a proxy for "which revision is official", not for that
      // revision's OWN content -- it only moves when a DIFFERENT revision becomes official. If the
      // SAME official revision's `score`/`missingScorer` were ever changed in place (no production
      // write path does this today -- every score write goes through
      // `V1GameResultRevision.create()`, never a post-creation `update()` of those two columns, see
      // games.service.ts -- but nothing at the schema or transaction level forbids a future/direct
      // write from doing so), `items[].currentScore`/`items[].warnings`'s `MISSING_SCORER` entry
      // would change while this hash and the page `watermark` derived from it stayed identical,
      // silently breaking the incremental-diff contract this section documents. Hash the actual
      // (canonicalized, so jsonb key-order alone can never move this hash) `score`/`missingScorer`
      // values directly instead of only their revision-identity proxy.
      const currentScoreForHash = canonicalizeForHash(row.game?.currentOfficialRevision?.score ?? null);
      const missingScorerForHash = row.game?.currentOfficialRevision?.missingScorer ?? null;
      const stableRevision = createHash('sha256')
        .update(
          JSON.stringify([
            row.updatedAt.getTime(),
            fieldVersion,
            gameVersion,
            gameUpdatedAtMs,
            revisionId,
            currentScoreForHash,
            missingScorerForHash,
            escalationSummary.maxVersion,
            escalationSummary.maxUpdatedAtMs,
          ]),
        )
        .digest('hex');

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
          version: gameVersion,
          revisionId,
          stableRevision,
        },
        liveWarningEntry: { fixtureId: row.id, warnings: liveWarnings },
      };
    });

    // `?warning=` now matches ONLY stable codes (review finding #2) -- `items` membership must
    // never depend on `now`. `liveWarnings` for the filtered fixtures is still reported (a fixture
    // matched via a stable code may ALSO carry time-relative warnings worth surfacing), but the
    // filter predicate itself never looks at a time-relative code. `warningFilter` was already
    // validated/narrowed near the top of this method (throws before reaching here otherwise).
    const matchesWarningFilter = warningFilter
      ? ({ item }: (typeof rows)[number]) => (item.warnings as readonly string[]).includes(warningFilter)
      : () => true;
    const filteredRows = rows.filter(matchesWarningFilter);

    return {
      items: filteredRows.map((row) => row.item),
      nextCursor,
      // Computed over the FULL unfiltered page (`rows`), matching `nextCursor`'s semantics: the
      // `warning` filter only narrows what is returned, it does not change what the underlying
      // page/watermark represents.
      watermark: this.encodeWatermark(
        rows.map((row) => ({ fixtureId: row.item.fixtureId, stableRevision: row.item.stableRevision })),
      ),
      // NOT part of the stable snapshot -- see the "Stable body vs. time-relative part" doc
      // section above. May legitimately differ between two reads separated by real wall-clock
      // time even with zero intervening DB writes.
      liveWarnings: filteredRows.map((row) => row.liveWarningEntry),
    };
  }

  private encodeWatermark(entries: ReadonlyArray<{ fixtureId: string; stableRevision: string }>): string {
    const hash = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
    return Buffer.from(JSON.stringify({ h: hash })).toString('base64url');
  }

  /** Task 18 review P0-2: re-reads the EXACT admin/assignment row `principal` was decided from,
   * inside `tx` (this method's caller's own transaction, as its first statement), and denies
   * unless it is still exactly as valid as it was when `TournamentStaffGuard` made its decision --
   * closing the window between the guard's decision and this transaction's own snapshot.
   *
   * Deliberately UNLOCKED (no `FOR SHARE`), unlike `TournamentStaffAccessService.assertAccess()`'s
   * own P0-3 fix: this method's caller (`list()`) runs inside a `RepeatableRead` transaction, and
   * `RepeatableRead` raises a serialization-failure error (Postgres `40001`) if a locking read
   * (`FOR SHARE`/`FOR UPDATE`) has to wait on a row a concurrent transaction then commits a change
   * to -- turning a clean, expected "someone revoked you" outcome into an unexpected 500. That
   * lock is the right tool for P0-3's fields-service writes (which run under the DEFAULT `READ
   * COMMITTED` isolation, where a locking read simply re-reads the latest committed row with no
   * such error) but wrong here. A plain, unlocked read as literally this transaction's first
   * statement already closes the main gap this fix targets (a revoke that fully committed before
   * this transaction's own `RepeatableRead` snapshot was taken is always observed here) without
   * that failure mode. */
  private async reverifyPrincipal(
    tx: Tx,
    tournamentId: string,
    principal: TournamentStaffPrincipal,
    now: Date,
  ): Promise<void> {
    if (principal.tournamentId !== tournamentId) {
      this.denyStalePrincipal();
    }
    if (principal.assignmentId !== null) {
      const assignment = await tx.v1TournamentStaffAssignment.findUnique({
        where: { id: principal.assignmentId },
        select: { tournamentId: true, userId: true, version: true, revokedAt: true, expiresAt: true },
      });
      const stillValid =
        assignment !== null &&
        assignment.tournamentId === principal.tournamentId &&
        assignment.userId === principal.userId &&
        assignment.version === principal.assignmentVersion &&
        assignment.revokedAt === null &&
        (assignment.expiresAt === null || assignment.expiresAt > now);
      if (!stillValid) {
        this.denyStalePrincipal();
      }
      return;
    }

    // `assignmentId === null` only ever means the platform-admin bypass (see
    // TournamentStaffAccessService.assertAccess()) -- re-verify that admin grant is still active
    // too, closing the same TOCTOU for that path.
    const admin = await tx.v1AdminUser.findUnique({
      where: { userId: principal.userId },
      select: {
        status: true,
        revokedAt: true,
        adminRole: true,
        user: { select: { accountStatus: true } },
      },
    });
    const stillActive =
      admin !== null &&
      admin.status === 'active' &&
      admin.revokedAt === null &&
      admin.user.accountStatus === 'active' &&
      (admin.adminRole === 'owner' || admin.adminRole === 'ops');
    if (!stillActive) {
      this.denyStalePrincipal();
    }
  }

  private denyStalePrincipal(): never {
    throw new ForbiddenException({
      code: 'STAFF_SCOPE_DENIED',
      message: '스태프 권한이 만료되었거나 취소됐어요. 새로고침 후 다시 시도해주세요.',
      details: { reason: 'STALE_PRINCIPAL' },
    });
  }

  private async latestLineupStateBySide(
    tx: Tx,
    gameIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (gameIds.length === 0) return new Map();

    // V1GameLineup.sideId is V1GameSide.id (a UUID, no Prisma relation between the two models --
    // see the schema comment trail), but isLineupOverdue() needs to look up by the stable
    // V1GameSideKey ('HOME'/'AWAY'), not by that UUID (which is per-game and unknowable to the
    // caller). Resolve sideId -> sideKey via V1GameSide once here, so the map below can be keyed
    // by `${gameId}:${sideKey}` -- exactly what isLineupOverdue() looks up.
    const [rows, sides] = await Promise.all([
      // Review finding #13: bound this to exactly one row per (gameId, sideId) -- the latest
      // revision -- instead of transferring every historical revision a side has ever had.
      // Prisma's `distinct` + matching leading `orderBy` fields compiles to a single DISTINCT
      // ON-style query (one round-trip, still `v1GameLineup.findMany`), so this stays within
      // the fixed six-query board.list() budget while no longer scaling with revision count.
      tx.v1GameLineup.findMany({
        where: { gameId: { in: [...gameIds] } },
        orderBy: [{ gameId: 'asc' }, { sideId: 'asc' }, { revision: 'desc' }],
        distinct: ['gameId', 'sideId'],
        select: { gameId: true, sideId: true, state: true },
      }),
      tx.v1GameSide.findMany({
        where: { gameId: { in: [...gameIds] } },
        select: { id: true, sideKey: true },
      }),
    ]);
    const sideKeyBySideId = new Map(sides.map((side) => [side.id, side.sideKey]));

    const latest = new Map<string, string>();
    // `distinct` already collapsed each (gameId, sideId) to its single latest-revision row, so
    // this loop no longer needs to skip repeats -- one row per key by construction.
    for (const row of rows) {
      const sideKey = sideKeyBySideId.get(row.sideId);
      // A lineup row whose sideId no longer resolves to a V1GameSide is unexpected data drift,
      // not a valid HOME/AWAY state -- skip it rather than fabricating a key isLineupOverdue()
      // could never intentionally look up.
      if (sideKey === undefined) continue;
      const key = `${row.gameId}:${sideKey}`;
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

  /** Review finding #5: returns, per gameId, both the stable `RESULT_REVIEW_OVERDUE` boolean
   * (open PENDING/ACKNOWLEDGED escalation) AND the max version/updatedAt across ALL escalations
   * for that game (open or not) -- the latter feeds `stableRevision` so a status transition that
   * doesn't flip the boolean (e.g. ACKNOWLEDGED -> RESOLVED while another escalation is still
   * open, or an escalation opening/closing on a fixture with no other warnings) still moves the
   * item's incremental key.
   *
   * Task 18 review P1-6: this MUST consider every historical escalation for a game (see the
   * `stableRevision` doc comment above -- an old, already-resolved escalation's own version bump
   * still has to move the hash), so it cannot simply narrow WHICH rows are read the way
   * `staffCoverage()` below narrows to the current page. What it CAN do is stop transferring every
   * one of those rows to the application to fold in JS: `bool_or`/`MAX` are computed DATABASE-side
   * with a single `GROUP BY r.game_id`, so the wire only ever carries one summary row per game in
   * this page -- not one row per historical escalation. Same single-round-trip shape as the
   * `findMany` it replaces, just no longer O(escalation history depth) in bytes transferred. */
  private async escalationSummaryByGameId(
    tx: Tx,
    gameIds: readonly string[],
  ): Promise<Map<string, { overdue: boolean; maxVersion: number; maxUpdatedAtMs: number }>> {
    const summary = new Map<string, { overdue: boolean; maxVersion: number; maxUpdatedAtMs: number }>();
    if (gameIds.length === 0) return summary;
    const rows = await tx.$queryRaw<
      { gameId: string; overdue: boolean; maxVersion: number; maxUpdatedAt: Date }[]
    >`
      SELECT
        r.game_id AS "gameId",
        bool_or(
          e.status = 'PENDING'::"V1EscalationStatus"
          OR e.status = 'ACKNOWLEDGED'::"V1EscalationStatus"
        ) AS overdue,
        MAX(e.version) AS "maxVersion",
        MAX(e.updated_at) AS "maxUpdatedAt"
      FROM v1_result_escalations e
      JOIN v1_game_result_revisions r ON r.id = e.result_revision_id
      WHERE r.game_id IN (${Prisma.join([...gameIds])})
      GROUP BY r.game_id
    `;
    for (const row of rows) {
      summary.set(row.gameId, {
        overdue: row.overdue,
        maxVersion: row.maxVersion,
        maxUpdatedAtMs: row.maxUpdatedAt.getTime(),
      });
    }
    return summary;
  }

  /**
   * Task 18 review P1-6: bounded to the CURRENT PAGE's own fieldIds/fixtureIds. Pre-fix, this
   * fetched every active `FIELD_OPERATOR` assignment (and every one of ITS fixture scopes) for the
   * WHOLE tournament regardless of which fixtures/fields are actually on this page -- a tournament
   * with many field operators scoped to fixtures far outside this page's 20-100 rows still paid to
   * transfer all of them every single call. Narrowing the `WHERE`/nested `fixtureScopes` filter to
   * `pageFieldIds`/`pageFixtureIds` cannot change `isStaffCovered()`'s result for any row ON this
   * page (an assignment scoped to a fixture/field NOT on this page could never have made
   * `isStaffCovered()` return `true` for a page row anyway), so this is a pure bound on row
   * transfer, not a behavior change.
   */
  private async staffCoverage(
    tx: Tx,
    tournamentId: string,
    now: Date,
    pageFieldIds: readonly string[],
    pageFixtureIds: readonly string[],
  ): Promise<{ fieldIds: Set<string>; fixtureIds: Set<string> }> {
    const fieldIds = new Set<string>();
    const fixtureIds = new Set<string>();
    if (pageFieldIds.length === 0 && pageFixtureIds.length === 0) {
      // Empty page (no fixtures at all) -- nothing on it needs coverage, and an empty `OR: []`
      // would otherwise match zero rows anyway. Short-circuit rather than issue the query.
      return { fieldIds, fixtureIds };
    }
    const assignments = await tx.v1TournamentStaffAssignment.findMany({
      where: {
        tournamentId,
        role: V1TournamentStaffRole.FIELD_OPERATOR,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              ...(pageFieldIds.length > 0 ? [{ fieldId: { in: [...pageFieldIds] } }] : []),
              ...(pageFixtureIds.length > 0
                ? [{ fixtureScopes: { some: { fixtureId: { in: [...pageFixtureIds] } } } }]
                : []),
            ],
          },
        ],
      },
      select: {
        fieldId: true,
        fixtureScopes: {
          where: pageFixtureIds.length > 0 ? { fixtureId: { in: [...pageFixtureIds] } } : undefined,
          select: { fixtureId: true },
        },
      },
    });
    for (const assignment of assignments) {
      if (assignment.fieldId !== null && pageFieldIds.includes(assignment.fieldId)) {
        fieldIds.add(assignment.fieldId);
      }
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
