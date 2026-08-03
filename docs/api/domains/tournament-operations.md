# Tournament operations contract

The authoritative field, fixture-lineup, competition-config, operations-board, job-requeue, and operation-flag method/field/actor rows are frozen in the [REST and idempotency registry](../global-contract.md#frozen-rest-and-idempotency-contract).

Staff scope and actor permissions are defined by [Tournament operations authorization](./tournament-operations-auth.md). Review escalation is a durable result boundary defined by [Tournament operations escalations](./tournament-operations-escalations.md), never an ephemeral admin task queue.

Task 18 implements the staff, field/court, fixture-lineup, and operations-board HTTP surfaces that the auth doc's "Task 7 adds no staff-management HTTP route... deferred to Task 18" note anticipated, plus the fixture→field write path the [schema ledger](./games.md#frozen-additive-schema-ledger) columns already had FK-ready but unused. This document describes exactly what shipped, module by module, and calls out every place the shipped code deviates from the frozen registry prose above — per the project's standing rule that **shipped code is canonical over contract prose**; the registry table is not amended, but every deviation is listed here so it is never mistaken for silent drift.

All routes below are under `/api/v1`, require `V1AuthGuard` (authenticated user), and return the global `{status,data,timestamp}` envelope. `expectedVersion` is always a non-negative integer compared by optimistic CAS.

## Deviations from the frozen registry (read this first)

1. **Idempotency-Key is accepted but not deduplicated for staff and field mutations.** The registry's blanket rule ("All authenticated mutations carry `Idempotency-Key`... same key + same payload replays") is implemented as a true replay contract for games (`V1IdempotencyRecord`) and for escalations, but **not** for `POST .../staff`, `POST .../staff/:id/revoke`, `POST .../fields`, or `PATCH .../fields/:id`. For these four routes the `Idempotency-Key` header (or a server-generated UUID if absent/blank) is used only to populate the `V1OperationAudit.requestId` column — retrying an identical staff-grant or field-create request with the same key creates a **second** row, not a replay. `PATCH .../fields/:id` and the fixture-field assign/clear routes are still safe to retry because they are CAS'd (stale `expectedVersion` fails closed) or naturally idempotent in effect (assigning the same `fieldId` twice converges to the same state), but none of the four routes return `replayed:true`/`409 IDEMPOTENCY_PAYLOAD_CONFLICT` the way `/games/*` and `/tournament-ops/**/escalations/*` do. Fixture-lineup save/submit (below) *do* implement the real `V1IdempotencyRecord` replay contract, because they delegate to the already-shipped `GamesService`.
2. **`PUT .../fixtures/:fixtureId/lineup/:sideId` body shape is `SaveGameLineupDto`, not the registry's `{expectedVersion,sideId,formation,starters,bench}`.** `sideId` is a path segment, not a body field, and the body is `{expectedVersion,clientCommandId,formation?,participants:[{participantId?,displayNameSnapshot,jerseyNumber?,position?,started}]}` — the same shape `POST /games/:gameId/lineups/:sideId` already used. There is no separate `starters`/`bench` split; `participants[].started` carries that distinction per participant.
3. **`assigned field_operator may capture actual participants after start` (registry row 47) does not hold.** `tournament-staff-policy.ts`'s `allowsRoleAction()` authorizes `FIELD_OPERATOR` for `read`, `tournament_command`, and `event_append` only — never `lineup_mutate`. For a `TOURNAMENT_FIXTURE`-sourced game, **only `tournament_director` and `platform_ops`** may call lineup save/submit; a `field_operator` gets `403 PERMISSION_DENIED`. This is shipped Task 7 policy code that Task 18 does not own and reuses as-is per the project's shipped-code-wins rule; it is flagged here because it directly contradicts the registry's actor prose.
4. **`GET .../fields` is readable by every assigned tournament staff role, not only `platform_ops`/`tournament_director`.** The registry row says "platform_ops; tournament_director read"; the shipped `TournamentOperationsFieldsService.list()` authorizes via `action:'read'`, which `field_operator` and `support_readonly` also pass. This is a deliberate widening (sensible default — the plan and registry are silent on whether `field_operator`/`support_readonly` may read the field list, and denying a court list to on-court staff would be actively unhelpful).
5. **`PATCH .../fixtures/:fixtureId/field` and `DELETE .../fixtures/:fixtureId/field` are not in the frozen registry at all.** They are Task 18's answer to `V1TournamentFixture.fieldId` having a column and FK (`v1_tournament_fixtures_field_fk`) but no write path anywhere in the codebase before this task. See [Fixture field assignment](#fixture-field-assignment) below.
6. **The operations-board `warning` codes and `watermark` shape are Task 18's own sensible default**, not frozen text — the registry only says `{cursor,status,fieldId,warning} → incremental fixture snapshot + watermark` without defining either. See [Operations board](#operations-board-get-operations) below for the exact contract this repo now implements and tests against.

## Staff grant/revoke/list

`apps/v1_api/src/tournament-operations/staff/**`. Authorization is entirely delegated to the already-shipped, already-audited [Task 7 `TournamentStaffService`](./tournament-operations-auth.md) (`bootstrapFirstDirector`/`grantStaff`/`revokeStaff`) and `TournamentStaffAccessService.assertAccess()`; this module adds only the HTTP surface plus a local `list()` read (Task 7 never added `TournamentStaffService.listStaff`, and this lane does not own `apps/v1_api/src/tournaments/staff/`).

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/staff` | — | `{items: TournamentStaffAssignment[]}`, each `{id,tournamentId,userId,role,fieldId,fixtureIds,version,expiresAt,revokedAt,grantedByUserId,createdAt}` | any current, unrevoked, unexpired assignment (any role) or `platform_ops` |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff` | `{userId,role,fieldId?,fixtureIds?,expiresAt?}` | created assignment (`201`) | `platform_ops`; `tournament_director` for `FIELD_OPERATOR`/`SUPPORT_READONLY` only |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke` | `{expectedVersion,reason}` | revoked assignment (`200`) | `platform_ops`; owning `tournament_director` for subordinate roles |

- **Director bootstrap has no separate route.** When `role:"TOURNAMENT_DIRECTOR"` is posted and the tournament currently has zero active (unrevoked, unexpired) directors, the controller silently routes to `TournamentStaffService.bootstrapFirstDirector()` instead of `grantStaff()` — `grantStaff()` itself throws `403 STAFF_MANAGEMENT_DENIED {reason:"FIRST_DIRECTOR_REQUIRES_BOOTSTRAP"}` in that exact case. Only `platform_ops` may bootstrap. This branch is a pre-check only; `bootstrapFirstDirector()` re-verifies "zero active directors" itself inside a `Serializable` transaction, so a race between two concurrent bootstrap attempts still fails one of them closed with `409 STAFF_DIRECTOR_ALREADY_BOOTSTRAPPED`.
- **A `tournament_director` can never grant or revoke `TOURNAMENT_DIRECTOR` or `PLATFORM_OPS`** (`403 STAFF_MANAGEMENT_DENIED {reason:"DIRECTOR_CANNOT_GRANT_DIRECTOR"|"PLATFORM_OPS_ASSIGNMENT_FORBIDDEN"}`). `FIELD_OPERATOR` grants require `fieldId` or a non-empty `fixtureIds` (`422 STAFF_SCOPE_REQUIRED`); every other role must carry neither (`422 STAFF_SCOPE_NOT_ALLOWED`).
- A revoked or fully-non-staff user (no admin grant, no assignment row at all) gets `403 STAFF_SCOPE_DENIED` on every route in this table, including `GET` — access is re-derived per call, so revoking the last active assignment for a user immediately removes both read and write access on their next request (`RealtimeGateway.evictUserFromScopedGameRooms` also disconnects any live socket).
- `reason` on revoke is validated (non-empty string) but **not persisted** — `TournamentStaffService.revokeStaff`'s audit envelope has no free-text field. It exists in the DTO so the frozen contract's `{expectedVersion,reason}` shape is satisfiable end-to-end.

### Errors

| HTTP | Code | Meaning |
|---|---|---|
| `401` | — | unauthenticated |
| `403` | `STAFF_SCOPE_DENIED` | no eligible read/authorize scope for the requesting actor (`details.reason` is one of `ASSIGNMENT_REQUIRED\|ASSIGNMENT_ROLE_MISMATCH\|ASSIGNMENT_REVOKED\|ASSIGNMENT_NOT_STARTED\|ASSIGNMENT_EXPIRED\|CROSS_TOURNAMENT_SCOPE\|FIXTURE_SCOPE_REQUIRED\|FIXTURE_SCOPE_DENIED\|FIELD_SCOPE_REQUIRED\|FIELD_SCOPE_DENIED\|ROLE_ACTION_DENIED`) |
| `403` | `STAFF_MANAGEMENT_DENIED` | grant/revoke role-authority rule violated (`details.reason` one of `DIRECTOR_AUTHORITY_REQUIRED\|PLATFORM_OPS_ASSIGNMENT_FORBIDDEN\|DIRECTOR_CANNOT_GRANT_DIRECTOR\|DIRECTOR_CANNOT_REVOKE_DIRECTOR\|CROSS_TOURNAMENT_SCOPE\|FIRST_DIRECTOR_REQUIRES_BOOTSTRAP\|FIRST_DIRECTOR_REQUIRES_PLATFORM_OPS\|ACTOR_AUTHORITY_CHANGED`) |
| `404` | `TOURNAMENT_NOT_FOUND` \| `STAFF_TARGET_NOT_FOUND` \| `STAFF_ASSIGNMENT_NOT_FOUND` | tournament, grant target, or revoke target does not exist (or the assignment does not belong to this tournament) |
| `409` | `STAFF_TARGET_INACTIVE` | grant target's `accountStatus` is not `active` |
| `409` | `STAFF_DIRECTOR_ALREADY_BOOTSTRAPPED` | bootstrap raced against an existing active director |
| `409` | `STAFF_ASSIGNMENT_ALREADY_REVOKED` | revoke target already has `revokedAt` set |
| `409` | `STALE_STAFF_ASSIGNMENT_VERSION` | `expectedVersion` on revoke did not match the current row |
| `422` | `STAFF_SCOPE_REQUIRED` \| `STAFF_SCOPE_NOT_ALLOWED` \| `INVALID_STAFF_ROLE` \| `INVALID_STAFF_EXPIRY` \| `CROSS_TOURNAMENT_FIELD_SCOPE` \| `CROSS_TOURNAMENT_FIXTURE_SCOPE` | malformed or cross-tournament grant input |

## Field/court CRUD

`apps/v1_api/src/tournament-operations/fields/**`. `scopeKey` is the caller-supplied *stable* identity for a field/court (`@@unique([tournamentId, scopeKey])`); assigning or reassigning a fixture only ever writes `V1TournamentFixture.fieldId` — it never creates or churns a `V1TournamentField` row.

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/fields` | — | `{items: [{id,tournamentId,scopeKey,name,sortOrder,active,version}]}` | any assigned tournament staff role or `platform_ops` (see deviation 4 above) |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/fields` | `{scopeKey,name,sortOrder?}` | created field (`201`) | `platform_ops` only |
| `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fields/:fieldId` | `{expectedVersion,name?,sortOrder?,active?}` | updated field, CAS'd | `platform_ops` only |

`platform_ops`-only mutation (deviation 5's sibling nuance): `TOURNAMENT_STAFF_ACTIONS`'s `allowsRoleAction()` returns `true` for both `platform_ops` and `tournament_director` on every action, so it cannot by itself express "director may read but not mutate fields." The service layers an explicit `principal.role === 'platform_ops'` check on top of `assertAccess({action:'event_reverse'})` — the same nuance-layering pattern `TournamentStaffService.assertGrantAuthority` already uses for its own role rules.

### Fixture field assignment

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field` | `{fieldId}` | `{fixtureId,tournamentId,fieldId}` | `platform_ops` or `tournament_director` (tournament-wide or scoped to this fixture/field) |
| `DELETE /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field` | — | `{fixtureId,tournamentId,fieldId:null}` | same as above |

These two routes are new (deviation 5): `V1TournamentFixture.fieldId` and its FK to `V1TournamentField` already existed and were already migrated before Task 18, but nothing wrote to the column. Unlike literal field CRUD, assignment is treated as ordinary day-of-tournament operations work (`action:'event_reverse'`, no extra `platform_ops`-only gate) — `field_operator`/`support_readonly` are still denied because `event_reverse` is not in their allowed-action set. Assign is a separate verb from clear (`PATCH` vs `DELETE`, no nullable body) specifically so "assign to X" and "no-op" are never ambiguous over a nullable JSON field.

### Errors

| HTTP | Code | Meaning |
|---|---|---|
| `401` | — | unauthenticated |
| `403` | `STAFF_SCOPE_DENIED` | no eligible read/action scope (fixture assignment routes) |
| `403` | `FIELD_MANAGEMENT_DENIED` | non-`platform_ops` attempted field create/update |
| `404` | `TOURNAMENT_NOT_FOUND` \| `FIELD_NOT_FOUND` \| `TOURNAMENT_FIXTURE_NOT_FOUND` | tournament, field, or fixture not found (or cross-tournament) |
| `409` | `FIELD_SCOPE_KEY_DUPLICATE` | `(tournamentId, scopeKey)` already exists |
| `409` | `STALE_FIELD_VERSION` | `expectedVersion` did not match the current row |

## Tournament fixture lineup capture and submit

`apps/v1_api/src/tournament-operations/lineups/**`. A thin `fixtureId → gameId` adapter over the already-shipped `GamesService.listLineups`/`saveLineup`/`submitLineup` (the same methods `POST /games/:gameId/lineups/:sideId` uses) — authorization, CAS, idempotency, and takeover-token enforcement are all `GamesService`'s, not re-derived here.

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup` | — | lineup revisions (ordered by `sideId` asc, `revision` desc) | any actor `GamesService.resolveActor` authorizes for `read` on this fixture's game |
| `PUT /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup/:sideId` | `SaveGameLineupDto` — see deviation 2 above | new `DRAFT` lineup revision | `tournament_director` or `platform_ops` only (see deviation 3) |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup/:lineupId/submit` | `SubmitGameLineupDto {expectedVersion,clientCommandId,takeoverToken?}` | `DRAFT → SUBMITTED` | same as save; `takeoverToken` is mandatory for a `TOURNAMENT_FIXTURE` game (`403 TAKEOVER_TOKEN_EXPIRED` without one) |

- **`fixtureId → gameId` resolution is a strict, tournament-scoped lookup**: `V1TournamentFixture.findUnique({tournamentId,id:fixtureId})` selecting only `game.id`. A fixture that does not exist under this tournament, or has no linked game yet, returns `404 TOURNAMENT_FIXTURE_GAME_NOT_FOUND` before any `GamesService` call — this also naturally rejects a `fixtureId` that belongs to a different tournament.
- **Save and submit are truly idempotent** (unlike staff/field mutations above): they go through `GamesService`'s real `V1IdempotencyRecord` replay contract. The same `clientCommandId` with an identical payload returns the stored response with `replayed:true`; the same `clientCommandId` with a different payload returns `422 COMMAND_IDEMPOTENCY_KEY_MISMATCH`/`409` per the games contract. Submitting an already-`SUBMITTED` lineup under a *new* `clientCommandId` is not a replay and returns `409 INVALID_LINEUP_STATE`.

### Errors

Identical to the [game aggregate](./games.md) mutation/version/history rules, since every mutation delegates directly to `GamesService`, plus:

| HTTP | Code | Meaning |
|---|---|---|
| `404` | `TOURNAMENT_FIXTURE_GAME_NOT_FOUND` | fixture not found in this tournament, or has no linked game |
| `403` | `PERMISSION_DENIED` | actor scope not permitted (e.g. `field_operator` attempting save/submit — see deviation 3) |
| `403` | `TAKEOVER_TOKEN_EXPIRED` | missing/blank `takeoverToken` on a `TOURNAMENT_FIXTURE` submit |
| `409` | `INVALID_LINEUP_STATE` | submit targeted a lineup that is not `DRAFT` |
| `404` | `GAME_LINEUP_NOT_FOUND` \| `GAME_SIDE_NOT_FOUND` | `lineupId`/`sideId` does not belong to the resolved game |

## Operations board (`GET .../operations`)

`apps/v1_api/src/tournament-operations/board/**`. `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations`, guarded by `TournamentStaffGuard` + `@RequireTournamentStaff({action:'read'})` (locally re-provided in this module — `tournaments.module.ts` has no `exports` array today).

**Query**: `{cursor?,status?,fieldId?,warning?,limit?}` — `limit` follows the [global cursor rule](../global-contract.md#frozen-rest-and-idempotency-contract) (default 20, max 100). Pagination is a deterministic keyset cursor on `(round, fixtureNumber, id)`: a page never duplicates or drops a fixture, `nextCursor` is `null` on the last page, and exactly four bounded DB queries run per page regardless of page size.

**Response**: `{items: FixtureOperationsRow[], nextCursor, watermark, liveWarnings: LiveWarningEntry[]}`:

```
{
  fixtureId, tournamentId, round, fixtureNumber,
  gameId, gameState, fieldId, fieldName,
  homeRegistrationId, awayRegistrationId, scheduledAt,
  currentScore, warnings: string[], version, revisionId
}
```
is one `FixtureOperationsRow`; `LiveWarningEntry` is `{fixtureId, warnings: string[]}`.

- **`status` filters `V1Game.state`, not `V1TournamentFixture.status`.** `V1TournamentFixtureStatus` is dead/unmaintained — `GamesService` never writes it once the Game model became authoritative. `fieldId` filters `V1TournamentFixture.fieldId` directly.
- **`warning` codes** (Task 18 sensible default, deviation 6 — computed per row, `?warning=<code>` filters the *returned* `items`/`liveWarnings` but not the underlying cursor page, so a filtered page can legitimately be shorter than `limit`). Split into two groups (deviation 6, D3 determinism hardening below):
  - Stable (persisted state only — reported in `items[].warnings`):
    - `NO_FIELD_ASSIGNED` — `fieldId` is `null`.
    - `MISSING_SCORER` — the current/official result revision has `missingScorer:true` ([D-07](./games.md#frozen-operational-decision-table)).
    - `RESULT_REVIEW_OVERDUE` — an open (`PENDING`/`ACKNOWLEDGED`) `V1ResultEscalation` exists for the fixture's game.
  - Time-relative (persisted state **and** the request's wall-clock instant — reported ONLY in the separate `liveWarnings` array, never in `items[].warnings`):
    - `NO_STAFF_ASSIGNED` — no live `FIELD_OPERATOR` assignment scopes this fixture's field or fixture id directly at the request instant (`tournament_director`/`support_readonly` are tournament-wide by policy and never carry a field/fixture scope, so they never "cover" a specific fixture for this warning; an assignment's `expiresAt` is compared against the request instant).
    - `LINEUP_NOT_SUBMITTED` — `scheduledAt - 60m` has passed (mirrors [D-02](./games.md#frozen-operational-decision-table)'s `publicLineupAt` lock window) but either side's latest lineup is still `DRAFT` or missing.
  - `?warning=<code>` accepts codes from **both** groups — a caller filtering by a time-relative code still gets the right fixtures, matched against the union of that fixture's stable `warnings` and `liveWarnings`. Filtering by a time-relative code means the *filtered* response is no longer guaranteed clock-stable (see below); the matched code is still only reported in `liveWarnings`, never copied into the stable `items[].warnings`.
- **`watermark`** (deviation 6) is an opaque per-response token — **not** the Task 9 `V1ProjectionWatermark` table, which is reserved for the async official-result projection pipeline and would collide semantically if reused here. It is derived from `max(V1Game.version, V1Game.updatedAt, fixture.updatedAt)` across the page, so a client can tell two snapshots apart (or diff `{fixtureId,version,revisionId}` tuples between them to find exactly what changed) without re-deriving comparison logic. It never varies with the `GAME_READ` flag.

### Stable body vs. `liveWarnings` (D3 determinism hardening)

`{items, nextCursor, watermark}` is the **hash-stable body**: every field is a pure function of persisted columns alone (never the request's wall-clock instant), listed field-by-field below. `liveWarnings` is explicitly **excluded** from that guarantee — its content is a function of persisted state **and** `now` (the reference instant `TournamentOperationsBoardService.list()` resolves exactly once per call, defaulting to the real current time, and threads explicitly into every row's time-relative computation so one response is never internally inconsistent). A determinism oracle comparing two reads separated by real time with zero intervening writes must compare `{items, nextCursor, watermark}` only and may ignore `liveWarnings`; `liveWarnings` legitimately differs across such reads if a fixture/assignment straddles the `scheduledAt-60m`/`expiresAt` boundary between them — that is correct, live behavior, not a bug.

Stable body field → persisted source:

| Field | Persisted source |
|---|---|
| `items[].fixtureId` | `V1TournamentFixture.id` |
| `items[].tournamentId` | `V1TournamentFixture.tournamentId` |
| `items[].round` | `V1TournamentFixture.round` |
| `items[].fixtureNumber` | `V1TournamentFixture.fixtureNumber` |
| `items[].gameId` | `V1Game.id` (via `fixture.game`, nullable) |
| `items[].gameState` | `V1Game.state` |
| `items[].fieldId` | `V1TournamentFixture.fieldId` |
| `items[].fieldName` | `V1TournamentField.name` (via `fixture.field`) |
| `items[].homeRegistrationId` | `V1TournamentFixture.homeRegistrationId` |
| `items[].awayRegistrationId` | `V1TournamentFixture.awayRegistrationId` |
| `items[].scheduledAt` | `V1TournamentFixture.scheduledAt` |
| `items[].currentScore` | `V1GameResultRevision.score` (via `game.currentOfficialRevision`) |
| `items[].warnings` | `NO_FIELD_ASSIGNED` ← `fieldId`; `MISSING_SCORER` ← `currentOfficialRevision.missingScorer`; `RESULT_REVIEW_OVERDUE` ← `V1ResultEscalation.status` |
| `items[].version` | `V1Game.version` |
| `items[].revisionId` | `V1Game.currentOfficialRevisionId` |
| `nextCursor` | `V1TournamentFixture.id` of the last page row (keyset cursor) |
| `watermark` | `max(V1Game.version, V1Game.updatedAt, V1TournamentFixture.updatedAt)` across the page |

`liveWarnings[].fixtureId` correlates back to `items[].fixtureId` (not new information); `liveWarnings[].warnings` holds only `NO_STAFF_ASSIGNED` (← `V1TournamentStaffAssignment.expiresAt` vs. request instant) and `LINEUP_NOT_SUBMITTED` (← `V1TournamentFixture.scheduledAt - 60m` vs. request instant, plus the latest `V1GameLineup.state` per side).

Any hash-equality check spanning real time (e.g. `scripts/qa/verify-game-result-cutover.mjs`'s `liveCutover()`, which hashes the *whole* response body including `liveWarnings`) still requires its fixtures/assignments held away from the two time-relative boundaries so `liveWarnings` itself doesn't change between reads either — exactly as this repo's own Task 18 integration spec's fixtures already are (`overdueFixture.scheduledAt` is 3h in the past; the seeded staff assignment has `expiresAt: null`) — but the *architectural* guarantee (the stable body is provably pure) no longer depends on that convention being followed correctly; the integration spec proves it directly by calling `list()` with two `now` values 10+ minutes apart and zero DB writes between them, and asserting `{items, nextCursor, watermark}` is byte-identical while `liveWarnings` is allowed (and, for a fixture straddling the boundary, expected) to differ.

### Compare-read authority seam

Task 10's real compare-read module (`apps/v1_api/src/games/migration/`) is not present in this codebase yet. The board reads game results through an injected `GameReadAuthorityPort` (`GAME_READ_AUTHORITY` DI token, `apps/v1_api/src/tournament-operations/board/game-read-authority.port.ts`). The current `GAME_READ` flag itself is read with a raw `findUnique` against `V1GameOperationFlag` (not `GameOperationFlagsService.getFlag()`, which hard-gates to `platform_ops` and would wrongly `403` a `field_operator`/`support_readonly` board viewer). Only when the flag is `'compare'` does it call `resolve()` once per row that has a current/official result, sequentially; on the first `{outcome:'mismatch'}` it aborts the **entire response** with `409 GAME_RESULT_READ_MISMATCH {details:{mismatch:{entity,revision,field}}}` before any partial body is serialized. Under `'legacy'`/`'new'` (or when the port always reports `'ok'`) the response body is byte-identical across all three flag values — this is what `scripts/qa/verify-game-result-cutover.mjs`'s `liveCutover()` hash-equality assertions depend on. The default `DirectGameReadAuthorityService` always returns `{outcome:'ok'}`, since Task 18 has no dependency on Task 10 and there is nothing to compare against yet.

**Override mechanism**: `GAME_READ_AUTHORITY` is not a fixed binding inside `tournament-operations-board.module.ts` — Nest always resolves a token from the *declaring* module's own local providers first, so a hardcoded local binding there could never be swapped by anything imported elsewhere, at any import order. Instead `TournamentOperationsBoardModule` exposes a `register(authorityProvider?: Provider)` static method (Nest's dynamic-module pattern); `app.module.ts` calls `TournamentOperationsBoardModule.register()` (no argument → the `DirectGameReadAuthorityService` default). Task 10 swaps in its real comparator with a **one-line change at that same `app.module.ts` call site** — `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass: CompareGameReadAuthorityService })` — with zero edits to the board module, controller, or service.

`V1GameOperationsWorkerModule` (the `GameOperationFlagsController`/`ResultEscalationController`/`PlatformResultEscalationController` bundle bootstrapped by the standalone `v1-game-operations-worker.main.ts` process) is **not** imported by the main `AppModule` from Task 18. `ResultEscalationController`/`PlatformResultEscalationController` are already mounted once via `NotificationsModule` — importing the worker module wholesale here would have registered both controllers a second time at the identical routes (Express tolerates this silently, so it would not have turned CI red on its own). Exposing `/tournament-ops/operation-flags/*` on the live API process is a different task's job on its own branch; Task 18 does not reproduce that wiring.

### Errors

| HTTP | Code | Meaning |
|---|---|---|
| `401` | — | unauthenticated |
| `403` | `STAFF_SCOPE_DENIED` | no eligible staff scope for this tournament |
| `409` | `GAME_RESULT_READ_MISMATCH` | compare-mode authority reported a mismatch; the whole page is refused rather than served partially or stale |
