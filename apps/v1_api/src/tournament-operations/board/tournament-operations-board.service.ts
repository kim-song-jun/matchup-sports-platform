import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, V1CompetitionKind, V1EscalationStatus, V1GameSideKey, V1TournamentStaffRole } from '@prisma/client';
import {
  leagueFixtureListOrder,
  leagueFixtureListWhere,
} from '../../league-matches/league-fixture-list-source';
import {
  ALL_COMPETITION_KINDS,
  findTournamentOnSurface,
} from '../../tournaments/tournament-surface-lookup';
import { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffPrincipal } from '../../tournaments/staff/tournament-staff-access.service';
import type {
  ListTournamentOperationsQueryDto,
  StableWarningCode,
  TimeRelativeWarningCode,
} from './dto/list-operations-query.dto';
import { STABLE_WARNING_CODES } from './dto/list-operations-query.dto';

type Tx = Prisma.TransactionClient;

/** Review finding #2: type guard so a `?warning=` value can be narrowed (and rejected when it
 * isn't stable) without an unchecked cast -- see `list()`'s use near the top of the method. */
function isStableWarningCode(code: string): code is StableWarningCode {
  return (STABLE_WARNING_CODES as readonly string[]).includes(code);
}

/** Recursively sorts object keys (alphabetically, `localeCompare`) so `JSON.stringify` of the
 * result is independent of the source's own key order -- mirrors `canonicalize()` in
 * `../../games/games.service.ts`. Postgres `jsonb` normalizes key order on storage, so
 * `row.game.currentOfficialRevision.score` read back from the DB can have keys in a different
 * order than whatever order the score was originally written in. Hashing the raw (non-canonical)
 * `JSON.stringify` of that value would make `stableRevision`/`watermark` silently depend on jsonb
 * key ordering, which is not part of the actual data contract (two reads of an UNCHANGED score
 * must hash identically; changing only key order is not a change). */
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
/**
 * ## 리그(거울) 페이지는 정렬 축이 다르다 (Task 165 BE-2)
 * 정규 리그의 경기는 `V1TournamentFixture` 가 아니라 `V1TeamMatch` 다. 그 테이블에는
 * **`round` 도 `fixtureNumber` 도 컬럼이 없다**(라운드는 `title` 문자열 안에만 있다) —
 * 그래서 팀매치에 대고 그 튜플을 지어낼 수 없다. 정렬은 `(startAt, id)` 이고, 이는 공개
 * 일정(`/tournaments/:id/schedule`)이 쓰는 것과 **같은 순서**다.
 *
 * 커서 안에 `kind` 를 담고, **한 목록 요청은 한 종류만 낸다** — 거울은 팀매치만, 대회는
 * 대진만이라 두 축이 한 페이지에서 섞이지 않는다. 종류가 어긋난 커서(예: 대회 커서를 리그
 * id 에)는 `tournamentId` 불일치와 **같은 "빈 페이지" 분기**로 접힌다: 밖에서 보면
 * 존재하지 않는 커서와 구분되지 않는다.
 */
type OperationsBoardCursorPayload =
  | {
      readonly kind: 'fixture';
      readonly tournamentId: string;
      readonly round: string;
      readonly fixtureNumber: number;
      readonly id: string;
    }
  | {
      readonly kind: 'teamMatch';
      readonly tournamentId: string;
      /** ISO 8601. `Date` 는 JSON 왕복에서 문자열이 되므로 처음부터 문자열로 담는다. */
      readonly startAt: string;
      readonly id: string;
    };

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
  if (typeof candidate.tournamentId !== 'string' || typeof candidate.id !== 'string') return null;

  // `kind` 가 없는 옛 커서는 대회 커서다. 이걸 없애면 이 배포를 사이에 두고 페이지를 넘기던
  // 운영자의 커서가 전부 "빈 페이지" 가 된다 — 목록이 통째로 사라진 것처럼 보인다.
  const kind = candidate.kind === undefined ? 'fixture' : candidate.kind;
  if (kind === 'fixture') {
    if (
      typeof candidate.round !== 'string' ||
      typeof candidate.fixtureNumber !== 'number' ||
      !Number.isInteger(candidate.fixtureNumber)
    ) {
      return null;
    }
    return {
      kind: 'fixture',
      tournamentId: candidate.tournamentId,
      round: candidate.round,
      fixtureNumber: candidate.fixtureNumber,
      id: candidate.id,
    };
  }
  if (kind === 'teamMatch') {
    // 문자열 존재만으로는 부족하다 — 파싱 불가능한 값이 그대로 `new Date()` 에 들어가면
    // `Invalid Date` 가 되어 WHERE 가 조용히 아무것도 안 맞춘다(빈 목록이 "끝" 처럼 보인다).
    if (typeof candidate.startAt !== 'string' || Number.isNaN(Date.parse(candidate.startAt))) {
      return null;
    }
    return {
      kind: 'teamMatch',
      tournamentId: candidate.tournamentId,
      startAt: candidate.startAt,
      id: candidate.id,
    };
  }
  return null;
}

/**
 * 두 축(대회 대진 · 리그 팀매치)이 **같은 게임 정보**를 읽는다. 손으로 두 번 적으면 한쪽만
 * 필드가 늘어 리그 행의 `currentScore`·`version` 이 조용히 비는 날이 온다.
 */
const BOARD_GAME_SELECT = {
  id: true,
  state: true,
  version: true,
  updatedAt: true,
  currentOfficialRevisionId: true,
  currentOfficialRevision: { select: { id: true, score: true, missingScorer: true } },
} as const;

/**
 * 두 축을 하나로 만든 **정규화 행**. 이 아래의 경고 계산·해시·항목 매핑은 전부 이 모양만
 * 본다 — 두 축을 끝까지 따로 끌고 가면 같은 계산이 두 벌이 되고, 한쪽만 고치는 날이 온다.
 *
 * 리그(팀매치)에서 `round`·`fixtureNumber`·`fieldId`·`field` 는 **항상 `null`** 이다.
 * `V1TeamMatch` 에 그 컬럼들이 아예 없기 때문이지, 값이 안 채워진 것이 아니다.
 */
type BoardRow = {
  id: string;
  tournamentId: string;
  round: string | null;
  fixtureNumber: number | null;
  fieldId: string | null;
  field: { name: string; version: number } | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  scheduledAt: Date | null;
  updatedAt: Date;
  game: Prisma.V1GameGetPayload<{ select: typeof BOARD_GAME_SELECT }> | null;
  /** 리그 팀매치면 `true`. 필드·스태프 커버리지 경고를 낼 수 없는 축이라는 뜻이다. */
  isLeague: boolean;
};

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
 * collide semantically. Content is always drawn from the same persisted columns, so watermark and
 * body bytes are a pure function of the database state read inside the snapshot transaction.
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
 * escalations, and staff assignments -- run inside ONE `RepeatableRead` Prisma interactive
 * transaction, so the response reflects a single database instant rather than tearing across
 * several independent round-trips (an escalation opening/closing, or a staff assignment being
 * granted/revoked, between two of the previously-independent queries could previously produce a
 * response that never corresponded to any real committed state).
 *
 * ## Retired: GAME_READ compare/legacy read authority (Task 10 cutover cleanup)
 * This service used to read a `GAME_READ` operation flag (`'legacy' | 'compare' | 'new'`) on every
 * call and branch: `'legacy'` served the pre-migration result shape, `'compare'` additionally ran
 * every page row through a `GAME_READ_AUTHORITY` comparator port (fail-closed on any legacy/new
 * divergence) before serving, and `'new'` served this method's read path directly with no
 * comparator call. The migration this flag gated is complete and permanent -- alpha has run
 * `GAME_READ=new` in production with zero rollback for a full cutover cycle -- so `GameOperationFlagKey`
 * no longer has a `GAME_READ` value at all (see `apps/v1_api/src/config/game-operation-flags.ts`),
 * and this method now unconditionally serves what `'new'` mode always served: no flag read, no
 * comparator call, no `'legacy'`/`'compare'` branch. The response shape, ordering, `stableRevision`
 * hash, and `watermark` are byte-for-byte identical to what `GAME_READ=new` already produced --
 * removing a conditional that was always false in production does not change output. The read
 * authority DI seam (`GAME_READ_AUTHORITY` port, `CompareGameReadAuthorityService`,
 * `DirectGameReadAuthorityService`) and the comparator/backfill implementation it called
 * (`games/migration/game-result-backfill.ts`, `games/migration/compare-game-result-reads.ts`) were
 * removed alongside it -- they had no other caller.
 */
@Injectable()
export class TournamentOperationsBoardService {
  private readonly logger = new Logger(TournamentOperationsBoardService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        // `== null` on purpose: cursorPayload is `null` when a supplied cursor fails to decode and
        // `undefined` when no cursor was supplied at all. The outer `query.cursor !== undefined`
        // already excludes the latter at runtime, but TypeScript does not carry that correlation
        // across the two expressions, so a strict `=== null` leaves `undefined` unnarrowed.
        const cursorInvalid =
          query.cursor !== undefined &&
          (cursorPayload == null || cursorPayload.tournamentId !== tournamentId);

        // 이 대회가 **정규 리그 거울**인지 먼저 본다. 거울이면 경기는
        // `V1TournamentFixture` 가 아니라 `V1TeamMatch` 이고, 거울에는 대진 행이 하나도
        // 없어서 지금까지 콘솔 목록이 **빈 채로** 열렸다(정본 §4 가 "리그도 같은 콘솔" 로
        // 확정했으므로 그건 결함이다).
        // 원시 `v1Tournament.findUnique` 를 쓰지 않는다 — 표면 게이트
        // (`scripts/v1-surface-check.mjs`)가 막는다. 여기서 묻는 것은 *"이 대회가 무엇인가"*
        // 이므로 두 종류를 다 허용하고 `kind` 만 본다(`public-tournament-records` 의
        // `getSchedule` 이 같은 이유로 같은 형태를 쓴다).
        const competition = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
          where: { id: tournamentId },
          select: { kind: true },
        });
        const isLeague = competition?.kind === V1CompetitionKind.regular_league;

        // 종류가 어긋난 커서는 `tournamentId` 불일치와 **같은 분기**로 접는다 — 밖에서 보면
        // 존재하지 않는 커서와 구분되지 않는다(그게 이 커서의 원래 계약이다).
        const cursorKindMismatch =
          cursorPayload != null && cursorPayload.kind !== (isLeague ? 'teamMatch' : 'fixture');

        const rawRows: BoardRow[] = cursorInvalid || cursorKindMismatch
          ? []
          : isLeague
            ? await this.leagueBoardRows(tx, tournamentId, query, cursorPayload, limit)
            : await this.fixtureBoardRows(tx, where, cursorPayload, limit);

        const hasNext = rawRows.length > limit;
        const pageRows = hasNext ? rawRows.slice(0, limit) : rawRows;
        const lastRow = pageRows[pageRows.length - 1];
        const nextCursor = hasNext
          ? // 커서 튜플은 **그 페이지를 정렬한 축과 같아야 한다** — 리그는 `(startAt, id)`,
            // 대회는 `(round, fixtureNumber, id)`. 한 목록 요청은 한 축만 내므로 섞이지 않는다.
            lastRow.isLeague
            ? encodeOperationsBoardCursor({
                kind: 'teamMatch',
                tournamentId,
                // `scheduledAt` 은 팀매치의 `startAt` 이고 non-null 이다(정렬 키라 없으면
                // 페이지가 성립하지 않는다). 대회 대진은 미정일 수 있어 타입이 nullable 이다.
                startAt: (lastRow.scheduledAt ?? new Date(0)).toISOString(),
                id: lastRow.id,
              })
            : encodeOperationsBoardCursor({
                kind: 'fixture',
                tournamentId,
                round: lastRow.round ?? '',
                fixtureNumber: lastRow.fixtureNumber ?? 0,
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

        const [lineupLatestBySideKey, escalationSummaryMap, staffCoverageResult] =
          await Promise.all([
            this.latestLineupStateBySide(tx, gameIds),
            this.escalationSummaryByGameId(tx, gameIds),
            // 리그 페이지에서는 **커버리지를 계산할 수 없다** — 팀매치엔 `fieldId` 컬럼이
            // 없고, `V1TournamentStaffFixtureScope.fixtureId` 는 FK 가 `V1TournamentFixture`
            // 라 팀매치 id 가 거기 있을 수 없다(실측). 결과가 반드시 빈 집합인 쿼리라
            // 아예 날리지 않는다.
            isLeague
              ? Promise.resolve({ fieldIds: new Set<string>(), fixtureIds: new Set<string>() })
              : this.staffCoverage(tx, tournamentId, now, pageFieldIds, pageFixtureIds),
          ]);

        return {
          pageRows,
          nextCursor,
          lineupLatestBySideKey,
          escalationSummaryMap,
          staffCoverageResult,
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
    } = snapshot;

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
      // 리그에서는 필드 경고를 내지 않는다. `V1TeamMatch` 에 `fieldId` 컬럼이 **없어서**
      // 항상 켜지는데, 운영자가 **영원히 해제할 수 없는 경고**는 신호가 아니라 소음이다 —
      // 모든 행에 붙어 진짜 경고(MISSING_SCORER·RESULT_REVIEW_OVERDUE)를 덮는다.
      if (!row.isLeague && row.fieldId === null) warnings.push('NO_FIELD_ASSIGNED');
      if (row.game?.currentOfficialRevision?.missingScorer === true) {
        warnings.push('MISSING_SCORER');
      }
      if (escalationSummary.overdue) {
        warnings.push('RESULT_REVIEW_OVERDUE');
      }

      // Time-relative: additionally a function of `now` -- deliberately kept OUT of `warnings`
      // above and surfaced only via the separate `liveWarnings` array below.
      const liveWarnings: TimeRelativeWarningCode[] = [];
      // 같은 이유로 리그에서는 스태프 커버리지 경고도 내지 않는다 — 두 판정 경로(필드 배정 ·
      // 대진 스코프) 모두 리그 행을 **구조적으로** 맞출 수 없다. `LINEUP_NOT_SUBMITTED` 는
      // 게임 축이라 두 종류에 똑같이 걸리므로 그대로 둔다.
      if (!row.isLeague && !this.isStaffCovered(row.id, row.fieldId, staffCoverageResult)) {
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

  /**
   * 대회 축 한 페이지. 지금까지의 동작 그대로다 — 정렬·커서 튜플 `(round, fixtureNumber, id)`.
   */
  private async fixtureBoardRows(
    tx: Tx,
    where: Prisma.V1TournamentFixtureWhereInput,
    cursor: OperationsBoardCursorPayload | null | undefined,
    limit: number,
  ): Promise<BoardRow[]> {
    const cursorPredicate: Prisma.V1TournamentFixtureWhereInput | undefined =
      cursor != null && cursor.kind === 'fixture'
        ? {
            OR: [
              { round: { gt: cursor.round } },
              { round: cursor.round, fixtureNumber: { gt: cursor.fixtureNumber } },
              { round: cursor.round, fixtureNumber: cursor.fixtureNumber, id: { gt: cursor.id } },
            ],
          }
        : undefined;

    const rows = await tx.v1TournamentFixture.findMany({
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
        game: { select: BOARD_GAME_SELECT },
      },
    });
    return rows.map((row) => ({ ...row, isLeague: false }));
  }

  /**
   * 리그(거울) 한 페이지 — 경기는 `V1TeamMatch` 다.
   *
   * ## 어느 행이 이 리그의 대진인가는 공유 술어가 정한다
   * `leagueFixtureListWhere`/`leagueFixtureListOrder` 를 그대로 쓴다. 공개 일정
   * (`/tournaments/:id/schedule`)·대회 상세·리그 자기 페이지가 **같은 함수**를 쓰므로,
   * 콘솔이 보여주는 경기 집합이 관전자 화면과 어긋날 수 없다. 여기에 술어를 손으로 다시
   * 적으면 그 보장이 사라진다(이 저장소는 실제로 세 벌이 서로 다른 상태였다).
   *
   * ## 필터 두 개는 축이 다르다
   * - `fieldId`: 팀매치에 **필드 개념이 없다.** 필드로 거른 요청은 리그에서 **빈 페이지**다
   *   — 없는 축으로 거른 결과가 "전체" 로 나오면 운영자가 필터가 먹은 줄 안다.
   * - `status`: 게임 상태 필터라 두 축이 같다(`V1Game.state`). 그대로 건다.
   *
   * ## 등록 id 는 팀 id 로 되찾는다
   * 항목 계약(`homeRegistrationId`/`awayRegistrationId`)은 FE 가 그대로 쓴다. 팀매치는 팀
   * id 를 들고 있으므로 **페이지의 팀 id 집합으로 IN 조회 1회**를 붙인다(행마다 조회하면
   * N+1 이다). 등록이 없으면 `null` + warn — 백필 이전 잔재를 조용히 삼키지 않는다.
   */
  private async leagueBoardRows(
    tx: Tx,
    leagueId: string,
    query: ListTournamentOperationsQueryDto,
    cursor: OperationsBoardCursorPayload | null | undefined,
    limit: number,
  ): Promise<BoardRow[]> {
    // 필드는 리그에 없는 축이다 — 그걸로 거르면 맞는 행이 하나도 없다.
    if (query.fieldId !== undefined) return [];

    const cursorPredicate: Prisma.V1TeamMatchWhereInput | undefined =
      cursor != null && cursor.kind === 'teamMatch'
        ? {
            OR: [
              { startAt: { gt: new Date(cursor.startAt) } },
              { startAt: new Date(cursor.startAt), id: { gt: cursor.id } },
            ],
          }
        : undefined;

    const base: Prisma.V1TeamMatchWhereInput = {
      ...leagueFixtureListWhere(leagueId),
      ...(query.status ? { game: { is: { state: query.status } } } : {}),
    };

    const rows = await tx.v1TeamMatch.findMany({
      where: cursorPredicate === undefined ? base : { ...base, ...cursorPredicate },
      orderBy: leagueFixtureListOrder(),
      take: limit + 1,
      select: {
        id: true,
        startAt: true,
        updatedAt: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        game: { select: BOARD_GAME_SELECT },
      },
    });

    const teamIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.approvedApplicantTeamId === null
            ? [row.hostTeamId]
            : [row.hostTeamId, row.approvedApplicantTeamId],
        ),
      ),
    ];
    const registrations =
      teamIds.length === 0
        ? []
        : await tx.v1TournamentRegistration.findMany({
            where: { tournamentId: leagueId, teamId: { in: teamIds } },
            select: { id: true, teamId: true },
          });
    const registrationByTeamId = new Map(registrations.map((row) => [row.teamId, row.id]));

    const missing = teamIds.filter((teamId) => !registrationByTeamId.has(teamId));
    if (missing.length > 0) {
      // 500 을 내지 않는다 — 등록 백필 이전에 만들어진 리그 로스터가 남아 있을 수 있고,
      // 그것 때문에 콘솔 전체가 열리지 않으면 운영이 멈춘다. 대신 조용히 넘어가지도 않는다.
      this.logger.warn(
        `리그 참가 등록이 없는 팀이 콘솔 목록에 있다 — leagueId=${leagueId} teamIds=${missing.join(',')}`,
      );
    }

    return rows.map((row) => ({
      id: row.id,
      tournamentId: leagueId,
      // `V1TeamMatch` 에 없는 컬럼이다 — 안 채운 게 아니라 존재하지 않는다.
      round: null,
      fixtureNumber: null,
      fieldId: null,
      field: null,
      homeRegistrationId: registrationByTeamId.get(row.hostTeamId) ?? null,
      awayRegistrationId:
        row.approvedApplicantTeamId === null
          ? null
          : registrationByTeamId.get(row.approvedApplicantTeamId) ?? null,
      scheduledAt: row.startAt,
      updatedAt: row.updatedAt,
      game: row.game,
      isLeague: true,
    }));
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
