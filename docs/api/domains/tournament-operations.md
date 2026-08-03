# Tournament operations contract

The authoritative field, fixture-lineup, competition-config, operations-board, job-requeue, and operation-flag method/field/actor rows are frozen in the [REST and idempotency registry](../global-contract.md#frozen-rest-and-idempotency-contract).

Staff scope and actor permissions are defined by [Tournament operations authorization](./tournament-operations-auth.md). Review escalation is a durable result boundary defined by [Tournament operations escalations](./tournament-operations-escalations.md), never an ephemeral admin task queue.

Task 18 implements the staff, field/court, fixture-lineup, and operations-board HTTP surfaces that the auth doc's "Task 7 adds no staff-management HTTP route... deferred to Task 18" note anticipated, plus the fixture→field write path the [schema ledger](./games.md#frozen-additive-schema-ledger) columns already had FK-ready but unused. This document describes exactly what shipped, module by module, and calls out every place the shipped code deviates from the frozen registry prose above — per the project's standing rule that **shipped code is canonical over contract prose**; the registry table is not amended, but every deviation is listed here so it is never mistaken for silent drift.

All routes below are under `/api/v1`, require `V1AuthGuard` (authenticated user), and return the global `{status,data,timestamp}` envelope. `expectedVersion` is always a non-negative integer compared by optimistic CAS.

## Deviations from the frozen registry (read this first)

1. **Idempotency-Key is accepted but not deduplicated for staff mutations only (field mutations were hardened post-review).** The registry's blanket rule ("All authenticated mutations carry `Idempotency-Key`... same key + same payload replays") is implemented as a true replay contract for games (`V1IdempotencyRecord`), for escalations, and — since Task 18 review finding #9 — for **all four field/fixture-field routes** (`POST .../fields`, `PATCH .../fields/:id`, `PATCH .../fixtures/:fixtureId/field`, `DELETE .../fixtures/:fixtureId/field`): each locks a durable per-(actor, action, resourceType, resourceId, key) scope with `pg_advisory_xact_lock` (mirroring `apps/v1_api/src/game-operations/result-escalation-mutation.service.ts`) and looks up the same `V1IdempotencyRecord` table used by games/escalations. A replay with the same key and the same request-body hash returns the original committed response without re-running the mutation; the same key reused with a **different** body hash is rejected with `409 IDEMPOTENCY_PAYLOAD_CONFLICT`. **`POST .../staff` and `POST .../staff/:id/revoke` still do NOT implement real idempotency** — they delegate entirely to Task 7's `TournamentStaffService`, which is out of this lane's ownership, so the `Idempotency-Key` header (or a server-generated UUID if absent/blank) is used only to populate the `V1OperationAudit.requestId` column there; retrying an identical staff-grant request with the same key still creates a **second** row, not a replay. Fixture-lineup save/submit (below) *do* implement the real `V1IdempotencyRecord` replay contract, because they delegate to the already-shipped `GamesService`.
2. **`PUT .../fixtures/:fixtureId/lineup/:sideId` body shape is `SaveGameLineupDto`, not the registry's `{expectedVersion,sideId,formation,starters,bench}`.** `sideId` is a path segment, not a body field, and the body is `{expectedVersion,clientCommandId,formation?,participants:[{participantId?,displayNameSnapshot,jerseyNumber?,position?,started}]}` — the same shape `POST /games/:gameId/lineups/:sideId` already used. There is no separate `starters`/`bench` split; `participants[].started` carries that distinction per participant.
3. **`assigned field_operator may capture actual participants after start` (registry row 47) does not hold.** `tournament-staff-policy.ts`'s `allowsRoleAction()` authorizes `FIELD_OPERATOR` for `read`, `tournament_command`, and `event_append` only — never `lineup_mutate`. For a `TOURNAMENT_FIXTURE`-sourced game, **only `tournament_director` and `platform_ops`** may call lineup save/submit; a `field_operator` gets `403 PERMISSION_DENIED`. This is shipped Task 7 policy code that Task 18 does not own and reuses as-is per the project's shipped-code-wins rule; it is flagged here because it directly contradicts the registry's actor prose.
4. **`GET .../fields` is readable by every assigned tournament staff role, not only `platform_ops`/`tournament_director`.** The registry row says "platform_ops; tournament_director read"; the shipped `TournamentOperationsFieldsService.list()` authorizes via `action:'read'`, which `field_operator` and `support_readonly` also pass. This is a deliberate widening (sensible default — the plan and registry are silent on whether `field_operator`/`support_readonly` may read the field list, and denying a court list to on-court staff would be actively unhelpful).
5. **`PATCH .../fixtures/:fixtureId/field` and `DELETE .../fixtures/:fixtureId/field` are not in the frozen registry at all.** They are Task 18's answer to `V1TournamentFixture.fieldId` having a column and FK (`v1_tournament_fixtures_field_fk`) but no write path anywhere in the codebase before this task. See [Fixture field assignment](#fixture-field-assignment) below.
6. **The operations-board `warning` codes and `watermark` shape are Task 18's own sensible default**, not frozen text — the registry only says `{cursor,status,fieldId,warning} → incremental fixture snapshot + watermark` without defining either. See [Operations board](#operations-board-get-operations) below for the exact contract this repo now implements and tests against.

## Staff grant/revoke/list

`apps/v1_api/src/tournament-operations/staff/**`. Authorization is entirely delegated to the already-shipped, already-audited [Task 7 `TournamentStaffService`](./tournament-operations-auth.md) (`bootstrapFirstDirector`/`grantStaff`/`revokeStaff`) and `TournamentStaffAccessService.assertAccess()`; this module adds only the HTTP surface plus a local `list()` read (Task 7 never added `TournamentStaffService.listStaff`, and this lane does not own `apps/v1_api/src/tournaments/staff/`).

**Post-review hardening (Task 18 review findings #10/#11):** a `TOURNAMENT_DIRECTOR` grant carrying a `fieldId` or non-empty `fixtureIds` is now rejected with `400 STAFF_SCOPE_NOT_ALLOWED` **before** the zero-active-directors bootstrap branch runs (previously the branch silently forwarded only `userId`/`tournamentId`/`expiresAt` to `bootstrapFirstDirector()`, which has no scope parameters at all, so an illegal scope on a director grant "succeeded" only in the window before any director existed). `revoke`'s `reason` is now genuinely persisted: since `TournamentStaffService.revokeStaff()` (Task 7, out of this lane) has no free-text field, this module writes a follow-up `V1OperationAudit` row (`action: tournament.staff.revoke_reason`, `resourceType: TOURNAMENT_STAFF_ASSIGNMENT`, `resourceId` = the assignment id) immediately after the revoke transaction commits, carrying the table's own `reason` column. This second write is a best-effort follow-up, not atomic with the revoke itself.

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/staff` | — | `{items: TournamentStaffAssignment[]}`, each `{id,tournamentId,userId,role,fieldId,fixtureIds,version,expiresAt,revokedAt,grantedByUserId,createdAt}` | any current, unrevoked, unexpired assignment (any role) or `platform_ops` |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff` | `{userId,role,fieldId?,fixtureIds?,expiresAt?}` | created assignment (`201`) | `platform_ops`; `tournament_director` for `FIELD_OPERATOR`/`SUPPORT_READONLY` only |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke` | `{expectedVersion,reason}` | revoked assignment (`200`) | `platform_ops`; owning `tournament_director` for subordinate roles |

- **Director bootstrap has no separate route.** When `role:"TOURNAMENT_DIRECTOR"` is posted and the tournament currently has zero active (unrevoked, unexpired) directors, the controller silently routes to `TournamentStaffService.bootstrapFirstDirector()` instead of `grantStaff()` — `grantStaff()` itself throws `403 STAFF_MANAGEMENT_DENIED {reason:"FIRST_DIRECTOR_REQUIRES_BOOTSTRAP"}` in that exact case. Only `platform_ops` may bootstrap. This branch is a pre-check only; `bootstrapFirstDirector()` re-verifies "zero active directors" itself inside a `Serializable` transaction, so a race between two concurrent bootstrap attempts still fails one of them closed with `409 STAFF_DIRECTOR_ALREADY_BOOTSTRAPPED`.
- **A `tournament_director` can never grant or revoke `TOURNAMENT_DIRECTOR` or `PLATFORM_OPS`** (`403 STAFF_MANAGEMENT_DENIED {reason:"DIRECTOR_CANNOT_GRANT_DIRECTOR"|"PLATFORM_OPS_ASSIGNMENT_FORBIDDEN"}`). `FIELD_OPERATOR` grants require `fieldId` or a non-empty `fixtureIds` (`422 STAFF_SCOPE_REQUIRED`); every other role must carry neither (`422 STAFF_SCOPE_NOT_ALLOWED`).
- A revoked or fully-non-staff user (no admin grant, no assignment row at all) gets `403 STAFF_SCOPE_DENIED` on every route in this table, including `GET` — access is re-derived per call, so revoking the last active assignment for a user immediately removes both read and write access on their next request (`RealtimeGateway.evictUserFromScopedGameRooms` also disconnects any live socket).
- `reason` on revoke is validated (non-empty string) and **is persisted** (Task 18 review finding #11) as a follow-up `V1OperationAudit` row scoped to the assignment id, since `TournamentStaffService.revokeStaff`'s own audit envelope has no free-text field to carry it.

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
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/fields` | — | `{items: [{id,tournamentId,scopeKey,name,sortOrder,active,version}]}`, ordered `(sortOrder asc, createdAt asc, id asc)` | any assigned tournament staff role or `platform_ops` (see deviation 4 above) |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/fields` | `{scopeKey,name,sortOrder?}` | created field (`201`) | `platform_ops` only |
| `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fields/:fieldId` | `{expectedVersion,name?,sortOrder?,active?}` — **at least one of `name`/`sortOrder`/`active` is required** | updated field, CAS'd | `platform_ops` only |

`platform_ops`-only mutation (deviation 5's sibling nuance): `TOURNAMENT_STAFF_ACTIONS`'s `allowsRoleAction()` returns `true` for both `platform_ops` and `tournament_director` on every action, so it cannot by itself express "director may read but not mutate fields." The service layers an explicit `principal.role === 'platform_ops'` check on top of `assertAccess({action:'event_reverse'})` — the same nuance-layering pattern `TournamentStaffService.assertGrantAuthority` already uses for its own role rules.

**List ordering is now total** (Task 18 review finding #16.2): `id asc` is a final tie-breaker after `sortOrder`/`createdAt`, so two fields sharing both values still resolve to one deterministic, repeatable order instead of whatever order Postgres happens to return.

**An empty PATCH body is rejected** (Task 18 review finding #16.1): a request carrying only `expectedVersion` (no `name`/`sortOrder`/`active`) returns `422 FIELD_UPDATE_EMPTY` instead of manufacturing a version bump and an audit row for a request that changes nothing.

### Fixture field assignment

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field` | `{fieldId}` | `{fixtureId,tournamentId,fieldId}` | `platform_ops` or `tournament_director` (tournament-wide or scoped to this fixture/field) |
| `DELETE /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field` | — | `{fixtureId,tournamentId,fieldId:null}` | same as above |

These two routes are new (deviation 5): `V1TournamentFixture.fieldId` and its FK to `V1TournamentField` already existed and were already migrated before Task 18, but nothing wrote to the column. Unlike literal field CRUD, assignment is treated as ordinary day-of-tournament operations work (`action:'event_reverse'`, no extra `platform_ops`-only gate) — `field_operator`/`support_readonly` are still denied because `event_reverse` is not in their allowed-action set. Assign is a separate verb from clear (`PATCH` vs `DELETE`, no nullable body) specifically so "assign to X" and "no-op" are never ambiguous over a nullable JSON field.

**Authorization is re-checked as late as possible, and both writes are CAS'd** (Task 18 review finding #8): `assignFixtureField()`/`clearFixtureField()` re-derive the acting principal via `TournamentStaffAccessService.assertAccess()` as the *first* statement inside the write transaction (not before it opens), so a revoke that commits between an earlier check and this call is visible and aborts the write. Both writes also CAS on the `fieldId` value the request actually observed (`WHERE fieldId = <observed>`) rather than a blind `UPDATE`, so two concurrent requests that both observed the same prior `fieldId` can never both silently win — the loser gets `409 FIXTURE_FIELD_ASSIGNMENT_CONFLICT` instead of a swallowed lost update.

### Errors

| HTTP | Code | Meaning |
|---|---|---|
| `401` | — | unauthenticated |
| `403` | `STAFF_SCOPE_DENIED` | no eligible read/action scope (fixture assignment routes) |
| `403` | `FIELD_MANAGEMENT_DENIED` | non-`platform_ops` attempted field create/update |
| `404` | `TOURNAMENT_NOT_FOUND` \| `FIELD_NOT_FOUND` \| `TOURNAMENT_FIXTURE_NOT_FOUND` | tournament, field, or fixture not found (or cross-tournament) |
| `409` | `FIELD_SCOPE_KEY_DUPLICATE` | `(tournamentId, scopeKey)` already exists |
| `409` | `STALE_FIELD_VERSION` | `expectedVersion` did not match the current row |
| `409` | `FIXTURE_FIELD_ASSIGNMENT_CONFLICT` | a concurrent assign/clear already changed the fixture's `fieldId` (CAS loss) |
| `409` | `IDEMPOTENCY_PAYLOAD_CONFLICT` | the same `Idempotency-Key` was reused with a different request body |
| `422` | `FIELD_UPDATE_EMPTY` | PATCH body carried only `expectedVersion`, no actual field to change |

## Tournament fixture lineup capture and submit

`apps/v1_api/src/tournament-operations/lineups/**`. A thin `fixtureId → gameId` adapter over the already-shipped `GamesService.listLineups`/`saveLineup`/`submitLineup` (the same methods `POST /games/:gameId/lineups/:sideId` uses) — authorization, CAS, idempotency, and takeover-token enforcement are all `GamesService`'s, not re-derived here.

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup` | — | lineup revisions (ordered by `sideId` asc, `revision` desc) | any actor `GamesService.resolveActor` authorizes for `read` on this fixture's game |
| `PUT /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup/:sideId` | `SaveGameLineupDto` — see deviation 2 above | new `DRAFT` lineup revision | `tournament_director` or `platform_ops` only (see deviation 3) |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup/:lineupId/submit` | `SubmitGameLineupDto {expectedVersion,clientCommandId,takeoverToken?}` | `DRAFT → SUBMITTED` | same as save; `takeoverToken` is mandatory for a `TOURNAMENT_FIXTURE` game (`403 TAKEOVER_TOKEN_EXPIRED` without one) |

- **`fixtureId → gameId` resolution is a strict, tournament-scoped lookup**: `V1TournamentFixture.findUnique({tournamentId,id:fixtureId})` selecting only `game.id`. A fixture that does not exist under this tournament, or has no linked game yet, returns `404 TOURNAMENT_FIXTURE_GAME_NOT_FOUND` before any `GamesService` call — this also naturally rejects a `fixtureId` that belongs to a different tournament.
- **Save and submit are truly idempotent** (unlike staff/field mutations above): they go through `GamesService`'s real `V1IdempotencyRecord` replay contract. The same `clientCommandId` with an identical payload returns the stored response with `replayed:true`; the same `clientCommandId` with a different payload returns `422 COMMAND_IDEMPOTENCY_KEY_MISMATCH`/`409` per the games contract. Submitting an already-`SUBMITTED` lineup under a *new* `clientCommandId` is not a replay and returns `409 INVALID_LINEUP_STATE`.
- **Path params (`tournamentId`,`fixtureId`,`sideId`,`lineupId`) are UUID-validated at the HTTP boundary** (`ParseUUIDPipe`, `422` on a malformed value) — this controller previously had no such pipe, unlike its board/fields/staff siblings, so a malformed uuid fell through to the service layer (which has no uuid-format guard of its own) instead of failing fast.

### Errors

Identical to the [game aggregate](./games.md) mutation/version/history rules, since every mutation delegates directly to `GamesService`, plus:

| HTTP | Code | Meaning |
|---|---|---|
| `404` | `TOURNAMENT_FIXTURE_GAME_NOT_FOUND` | fixture not found in this tournament, or has no linked game |
| `403` | `PERMISSION_DENIED` | actor scope not permitted (e.g. `field_operator` attempting save/submit — see deviation 3) |
| `403` | `TAKEOVER_TOKEN_EXPIRED` | missing/blank `takeoverToken` on a `TOURNAMENT_FIXTURE` submit |
| `409` | `INVALID_LINEUP_STATE` | submit targeted a lineup that is not `DRAFT` |
| `404` | `GAME_LINEUP_NOT_FOUND` \| `GAME_SIDE_NOT_FOUND` | `lineupId`/`sideId` does not belong to the resolved game |
| `422` | — (`ParseUUIDPipe` default body) | a path param (`tournamentId`/`fixtureId`/`sideId`/`lineupId`) is not a valid uuid |

## Operations board (`GET .../operations`)

`apps/v1_api/src/tournament-operations/board/**`. `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations`, guarded by `TournamentStaffGuard` + `@RequireTournamentStaff({action:'read'})` (locally re-provided in this module — `tournaments.module.ts` has no `exports` array today).

**Query**: `{cursor?,status?,fieldId?,warning?,limit?}` — `limit` follows the [global cursor rule](../global-contract.md#frozen-rest-and-idempotency-contract) (default 20, max 100). Pagination is a deterministic keyset cursor on `(round, fixtureNumber, id)`: a page never duplicates or drops a fixture, and `nextCursor` is `null` on the last page. **`cursor`/`nextCursor` are an opaque, self-describing `(tournamentId, round, fixtureNumber, id)` tuple** (base64url-encoded JSON), not a bare `V1TournamentFixture.id` (Task 18 review P1-1/P1-2 fix, superseding the prior "raw fixture id, resolved against the DB" design referenced by review finding #7): the next page's predicate is built directly from the tuple the cursor itself carries, so a walk survives the cursor's own anchor row being deleted or re-sorted between two page requests. **A cursor that fails to decode, and a cursor that decodes but names a DIFFERENT tournament than the one being queried, are both normalized to the exact same clean empty page** — there is no longer a distinguishing `400` response that would let a caller probe whether some fixture exists in a different (possibly private) tournament. Query count is a small, page-size-independent constant: a populated page runs five round-trips (the fixture page, two lineup/side reads, one staff-coverage read, one `GAME_READ` flag read) plus one additional DB-side aggregate round-trip for the escalation summary (`GROUP BY` via a raw query, Task 18 review P1-6 — not a per-model Prisma call), all batched via `IN`/join clauses so the count does not grow with how many of the page's rows have games/lineups/escalations — plus, under `GAME_READ=compare` only, one sequential compare-authority call per row that has a current/official result. **The lineup round-trip is bounded to one row per `(gameId, sideId)`** (review finding #13 fix): `latestLineupStateBySide()` reads `V1GameLineup` with `distinct: ['gameId', 'sideId']` and a matching leading `orderBy` (so Prisma compiles it to a single DISTINCT-ON-style query), instead of transferring every historical revision a side has ever accumulated — the round-trip count above stays fixed regardless of revision-history depth. **The staff-coverage read is bounded to the current page's own fieldIds/fixtureIds** (Task 18 review P1-6), not every active `FIELD_OPERATOR` assignment tournament-wide.

**Response**: `{items: FixtureOperationsRow[], nextCursor, watermark, liveWarnings: LiveWarningEntry[]}`:

```
{
  fixtureId, tournamentId, round, fixtureNumber,
  gameId, gameState, fieldId, fieldName,
  homeRegistrationId, awayRegistrationId, scheduledAt,
  currentScore, warnings: string[], version, revisionId, stableRevision
}
```
is one `FixtureOperationsRow`; `LiveWarningEntry` is `{fixtureId, warnings: string[]}`.

- **`status` filters `V1Game.state`, not `V1TournamentFixture.status`.** `V1TournamentFixtureStatus` is dead/unmaintained — `GamesService` never writes it once the Game model became authoritative. `fieldId` filters `V1TournamentFixture.fieldId` directly.
- **`warning` codes** (Task 18 sensible default, deviation 6). Split into two groups (D3 determinism hardening below):
  - Stable (persisted state only — reported in `items[].warnings`):
    - `NO_FIELD_ASSIGNED` — `fieldId` is `null`.
    - `MISSING_SCORER` — the current/official result revision has `missingScorer:true` ([D-07](./games.md#frozen-operational-decision-table)).
    - `RESULT_REVIEW_OVERDUE` — an open (`PENDING`/`ACKNOWLEDGED`) `V1ResultEscalation` exists for the fixture's game.
  - Time-relative (persisted state **and** the request's wall-clock instant — reported ONLY in the separate `liveWarnings` array, never in `items[].warnings`):
    - `NO_STAFF_ASSIGNED` — no live `FIELD_OPERATOR` assignment scopes this fixture's field or fixture id directly at the request instant (`tournament_director`/`support_readonly` are tournament-wide by policy and never carry a field/fixture scope, so they never "cover" a specific fixture for this warning; an assignment's `expiresAt` is compared against the request instant).
    - `LINEUP_NOT_SUBMITTED` — `scheduledAt - 60m` has passed (mirrors [D-02](./games.md#frozen-operational-decision-table)'s `publicLineupAt` lock window) but either side's latest lineup is still `DRAFT` or missing.
  - **`?warning=<code>` accepts ONLY stable codes** (P0 fix, Task 18 review finding #2 — reverses an earlier draft of this document, which said `warning` accepted both groups). Passing a time-relative code (`NO_STAFF_ASSIGNED`/`LINEUP_NOT_SUBMITTED`) is rejected with `400 OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE` instead of filtering `items` by it: the filter runs BEFORE `items` is built, so a time-relative filter would make `items` MEMBERSHIP a function of `now` alone — two identical, unchanged databases queried on either side of a deadline could return different `items`, contaminating the hash-stable body's core guarantee. The corrected rule is absolute: **`items` membership must never depend on a time-relative value.** A client that needs a live-warning-aware view fetches the (always time-independent) full page and filters client-side using the separate `liveWarnings` array.
- **`watermark`** (deviation 6) is an opaque per-response token — **not** the Task 9 `V1ProjectionWatermark` table, which is reserved for the async official-result projection pipeline and would collide semantically if reused here. It is a hash of the page's ordered `(fixtureId, stableRevision)` pairs (see `stableRevision` below), so it moves whenever ANY item's stable fields change, regardless of which underlying model caused it. It never varies with the `GAME_READ` flag.

### Incremental key: `items[].stableRevision` (P0 fix, Task 18 review finding #5)

`(fixtureId, version, revisionId)` alone cannot identify every stable-body change: `version`/`revisionId` are `V1Game` fields, so a fixture-only mutation (field (re)assignment, a field rename, an escalation transition that doesn't flip `RESULT_REVIEW_OVERDUE`'s boolean) can change the response without moving either, and a fixture with no game at all always has `version:null, revisionId:null` regardless of its own mutations. Each item now carries `stableRevision` — a `sha256` hex digest over EVERY persisted input that can change that item's stable fields: `V1TournamentFixture.updatedAt`, `V1TournamentField.version` (nullable), `V1Game.version`+`updatedAt` (nullable), `V1Game.currentOfficialRevisionId` (nullable), and the max `V1ResultEscalation.version`/`updatedAt` across ALL escalations tied to the fixture's game. A correct client diff compares `stableRevision` per `fixtureId` (falling back to "present in one snapshot but not the other" for adds/removals); `version`/`revisionId` remain for backward compatibility but are no longer sufficient alone.

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
| `items[].stableRevision` | `sha256` of `[fixture.updatedAt, field.version, game.version, game.updatedAt, revisionId, maxEscalationVersion, maxEscalationUpdatedAt]` — see "Incremental key" above |
| `nextCursor` | opaque-encoded `(tournamentId, round, fixtureNumber, id)` of the last page row (keyset cursor; no longer a bare `V1TournamentFixture.id` — Task 18 review P1-1/P1-2) |
| `watermark` | `sha256` hash of the page's ordered `(fixtureId, stableRevision)` list |

`liveWarnings[].fixtureId` correlates back to `items[].fixtureId` (not new information); `liveWarnings[].warnings` holds only `NO_STAFF_ASSIGNED` (← `V1TournamentStaffAssignment.expiresAt` vs. request instant) and `LINEUP_NOT_SUBMITTED` (← `V1TournamentFixture.scheduledAt - 60m` vs. request instant, plus the latest `V1GameLineup.state` per side).

Any hash-equality check spanning real time (e.g. `scripts/qa/verify-game-result-cutover.mjs`'s `liveCutover()`, which hashes the *whole* response body including `liveWarnings`) still requires its fixtures/assignments held away from the two time-relative boundaries so `liveWarnings` itself doesn't change between reads either — exactly as this repo's own Task 18 integration spec's fixtures already are (`overdueFixture.scheduledAt` is 3h in the past; the seeded staff assignment has `expiresAt: null`) — but the *architectural* guarantee (the stable body is provably pure) no longer depends on that convention being followed correctly; the integration spec proves it directly by calling `list()` with two `now` values 10+ minutes apart and zero DB writes between them, and asserting `{items, nextCursor, watermark}` is byte-identical while `liveWarnings` is allowed (and, for a fixture straddling the boundary, expected) to differ.

### Compare-read authority seam

Task 10's real compare-read module (`apps/v1_api/src/games/migration/`) is not present in this codebase yet. The board reads game results through an injected `GameReadAuthorityPort` (`GAME_READ_AUTHORITY` DI token, `apps/v1_api/src/tournament-operations/board/game-read-authority.port.ts`). The current `GAME_READ` flag itself is read with a raw `findUnique` against `V1GameOperationFlag` (not `GameOperationFlagsService.getFlag()`, which hard-gates to `platform_ops` and would wrongly `403` a `field_operator`/`support_readonly` board viewer). A **missing** flag row fails closed with `500 GAME_READ_FLAG_MISSING` (Task 18 review P1-7 — see below); a flag row that **exists with an unrecognized value** fails closed with `500 GAME_READ_FLAG_INVALID` instead of silently defaulting to non-compare (Task 18 review finding #4).

**A MISSING `GAME_READ` flag row now fails closed with `500 GAME_READ_FLAG_MISSING`** instead of silently defaulting to `'legacy'` (Task 18 review P1-7, superseding the prior "missing row defaults to legacy" design): a missing row is indistinguishable at runtime from an operator (or a bad migration/rollback) having deleted the row while `GAME_READ=compare`'s mismatch protection was relied on, and silently falling back to `'legacy'` would disable that protection with no error and no signal an operator would ever see. A fresh environment must have this row seeded explicitly (`GameOperationFlagsService.ensureDefaults()`/its seed migration) rather than lean on a runtime default here.

Only when the (validated) flag is `'compare'` does the board call `resolve()` once per row that has a current/official result, sequentially. **`resolve()` is now bound to the exact revision/score being served** (P0 fix, review finding #3): it receives `expectedGameVersion`, `expectedRevisionId`, and `expectedScoreHash` (a `sha256` of the serialized score) read from the SAME row the board is about to serialize — a conforming implementation must report `mismatch` if its own fresh read disagrees with any of those. On the first `{outcome:'mismatch'}` the board aborts the **entire response** with `409 GAME_RESULT_READ_MISMATCH {details:{mismatch:{entity,revision,field}}}` before any partial body is serialized. Additionally, after every `'ok'` outcome, the board re-reads `V1Game.version`/`currentOfficialRevisionId` fresh (non-transactionally) for every checked game and throws `409 GAME_RESULT_READ_STALE` if anything changed since the snapshot — a CAS-style recheck that catches a write racing the authority call itself, independent of whether the authority implementation participates in the board's own read path. Under `'legacy'`/`'new'` (or when the port always reports `'ok'` and nothing races) the response body is byte-identical across all three flag values — this is what `scripts/qa/verify-game-result-cutover.mjs`'s `liveCutover()` hash-equality assertions depend on.

**The default `DirectGameReadAuthorityService` now fails loudly instead of always approving** (P0 fix, review finding #4): it throws `500 GAME_READ_AUTHORITY_NOT_CONFIGURED` if `resolve()` is ever actually invoked (i.e. only reachable if a composition root flips `GAME_READ=compare` while this no-op stub is still bound — exactly the misconfiguration the review flags). Callers that only ever exercise `'legacy'`/`'new'` never reach this throw, since the board never calls `resolve()` outside compare mode.

**Override mechanism**: `GAME_READ_AUTHORITY` is not a fixed binding inside `tournament-operations-board.module.ts` — Nest always resolves a token from the *declaring* module's own local providers first, so a hardcoded local binding there could never be swapped by anything imported elsewhere, at any import order. Instead `TournamentOperationsBoardModule` exposes a `register(authorityProvider?: Provider)` static method (Nest's dynamic-module pattern); `app.module.ts` calls `TournamentOperationsBoardModule.register()` (no argument → the `DirectGameReadAuthorityService` default, which now fails loudly rather than fails open — see above). Task 10 swaps in its real comparator with a **one-line change at that same `app.module.ts` call site** — `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass: CompareGameReadAuthorityService })` — with zero edits to the board module, controller, or service.

### Single consistent read snapshot (P1 fix, Task 18 review finding #6)

All persisted reads that feed the stable body — the fixture page, lineups, `V1GameSide` rows, escalations, staff assignments, and the `GAME_READ` flag — run inside ONE `RepeatableRead` Prisma interactive transaction, so the response reflects a single database instant rather than tearing across several independent round-trips (an escalation opening/closing, or a staff assignment being granted/revoked, between two previously-independent queries could otherwise produce a response that never corresponded to any real committed state). The compare-mode authority call and its post-resolution freshness recheck deliberately run AFTER that transaction commits, using fresh non-transactional reads, since holding a `RepeatableRead` snapshot open across an arbitrary external comparator call is an anti-pattern independent of this fix.

`V1GameOperationsWorkerModule` (the `GameOperationFlagsController`/`ResultEscalationController`/`PlatformResultEscalationController` bundle bootstrapped by the standalone `v1-game-operations-worker.main.ts` process) is **not** imported by the main `AppModule` from Task 18. `ResultEscalationController`/`PlatformResultEscalationController` are already mounted once via `NotificationsModule` — importing the worker module wholesale here would have registered both controllers a second time at the identical routes (Express tolerates this silently, so it would not have turned CI red on its own). Exposing `/tournament-ops/operation-flags/*` on the live API process is a different task's job on its own branch; Task 18 does not reproduce that wiring.

### Errors

| HTTP | Code | Meaning |
|---|---|---|
| `401` | — | unauthenticated |
| `403` | `STAFF_SCOPE_DENIED` | no eligible staff scope for this tournament |
| `400` | `OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE` | `?warning=` carried a time-relative code (`NO_STAFF_ASSIGNED`/`LINEUP_NOT_SUBMITTED`); only stable codes may filter `items` |
| `409` | `GAME_RESULT_READ_MISMATCH` | compare-mode authority reported a mismatch; the whole page is refused rather than served partially or stale |
| `409` | `GAME_RESULT_READ_STALE` | the underlying game changed between the compare-mode authority decision and the board's post-resolution freshness recheck |
| `500` | `GAME_READ_FLAG_MISSING` | `V1GameOperationFlag('GAME_READ')` row does not exist (Task 18 review P1-7 — no longer defaults to `legacy`) |
| `500` | `GAME_READ_FLAG_INVALID` | `V1GameOperationFlag('GAME_READ')` holds a value other than `legacy`/`compare`/`new` |
| `500` | `GAME_READ_AUTHORITY_NOT_CONFIGURED` | `GAME_READ=compare` while the default (non-comparing) `GAME_READ_AUTHORITY` stub is still bound |

A cursor that fails to decode, or decodes but names a different tournament than the one being queried, is no longer a distinguishing `400` — both now yield the identical clean empty page (see the Query section above; Task 18 review P1-1 removed the prior `400 OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH` response for exactly this reason).
