# Global v1 API contract

This contract is frozen against the approved Task 127 plan. Domain documents provide navigation and domain-specific policy; this registry is the exact cross-domain REST, field, actor, idempotency, error, transition, and compensation contract.

<!-- API_CONTRACT_PLAN_SHA256:06e363a416b9f031c14ec854e1842f5412f4d72e971745edcd792c9365249edc -->

<!-- API_CONTRACT_SECTION_BEGIN:Frozen REST and idempotency contract -->
### Frozen REST and idempotency contract
All responses use `{status,data,timestamp}`. Collection reads use `limit` (default 20, max 100), opaque `cursor`, and `{items,nextCursor}`. All authenticated mutations carry `Idempotency-Key`; all versioned mutations carry `expectedVersion`. Canonical scope is `(actorUserId, action, resourceType, resourceId, idempotencyKey)`, retained 30 days. Same key + same SHA-256 payload replays the original status/body; same key + different payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`. For game commands, `clientCommandId` is required to equal the normalized `Idempotency-Key`; the same value is persisted atomically in `V1IdempotencyRecord`, so changing only the header or only the body returns `422 COMMAND_IDEMPOTENCY_KEY_MISMATCH`, and reusing the value with a different payload returns the canonical 409. Stale version returns `409 VERSION_CONFLICT`; validation `422`; missing resource `404`; unauthenticated `401`; authorization `403`.

| Method/path | Request → response fields | Authorized actor/action |
|---|---|---|
| `GET/POST /api/v1/teams/:teamId/schedules` | filters or `{title,type,startAt,endAt,timezone,capacity,rsvpDeadlineAt,visibility,teamMatchId?,version}` → schedule summary/detail | member read; team_manager/team_owner create |
| `GET/PATCH /api/v1/teams/:teamId/schedules/:scheduleId` | read or `{expectedVersion,title?,startAt?,endAt?,capacity?,rsvpDeadlineAt?,visibility?}` → versioned schedule/history | member read; team_manager/team_owner mutate |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/cancel` | `{expectedVersion,cancelReason}` → `{state:"cancelled",version,cancelledAt}` | team_manager/team_owner; closes reminders/recruitment, never deletes |
| `PUT /api/v1/teams/:teamId/schedules/:scheduleId/attendance/me` | `{status:attending|not_attending|undecided,expectedVersion}` → attendance counts/waitlist position | member self |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/reminders` | `{kind}` → durable job ID/status | team_manager/team_owner |
| `GET/POST/PATCH /api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | read; create/update `{expectedVersion,slots,closesAt,note,visibility,state:open|closed}` → recruitment/version/applicant count | member read if permitted; team_manager/team_owner mutate |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment/applications` | `{displayName,note}` → application ID/state with `userId` derived only from the authenticated actor | authenticated user; caller-supplied userId is forbidden by DTO whitelist; duplicate returns idempotent original |
| `GET /api/v1/me/schedule` | `{cursor,from,to,status}` → permitted schedule summaries | authenticated member |
| `GET /api/v1/team-matches/:teamMatchId/lineup` | no body → lineup/version/state/publicLineupAt | scoped team actors read |
| `PUT /api/v1/team-matches/:teamMatchId/lineup` | `{expectedVersion,formation,starters,bench}` → saved draft/version | team_manager/team_owner |
| `POST /api/v1/team-matches/:teamMatchId/lineup/submit` | `{expectedVersion}` → submitted lineup/version/publicLineupAt | team_manager/team_owner |
| `POST /api/v1/team-matches/:teamMatchId/lineup/change-request` | `{expectedVersion,reason}` → change-requested lineup/version | opponent_manager before lock; audited |
| `GET /api/v1/games/:gameId` | no body → game, sides, periods, lifecycle, currentVersion, lastSequence, current official/draft refs | resource-scoped actor |
| `POST /api/v1/games/:gameId/commands/:command` | `{expectedVersion,clientCommandId,takeoverToken,occurredAt,payload}` where command is `start|pause|resume|end` and `clientCommandId` must equal `Idempotency-Key` → committed version/state | tournament fixtures: assigned field_operator, assigned tournament_director, or platform_ops with a valid exclusive token; team matches: no generic command surface, because validated team result submission owns the end transition |
| `POST /api/v1/games/:gameId/cancel` | `{expectedVersion,reason}` → cancelled game/version and hidden public projection | team_owner/team_manager for team match; tournament_director/platform_ops for tournament; cancels lineup publication, result SLA, and pending fixture jobs |
| `GET/POST /api/v1/games/:gameId/events` | `afterSequence` or `{expectedVersion,clientEventId,takeoverToken,type,sideId,participantId?,period,clockMs,occurredAt,payload}` → ordered events/ack sequence | scoped reader; assigned field_operator, assigned tournament_director, or platform_ops append with valid token |
| `POST /api/v1/games/:gameId/events/:eventId/reverse` | `{expectedVersion,clientEventId,takeoverToken,reason}` → one append-only compensating event `{reversalSequence,version}` | assigned tournament_director/platform_ops; a corrected replacement is a separate normal append with its own clientEventId/payloadHash/ack |
| `GET/POST /api/v1/games/:gameId/result-revisions` | GET reads history; POST `{expectedVersion,score,actualParticipants,eventsHash,mvpParticipantId?,reason?}` creates a content-immutable team-match draft only | scoped actors read; team_manager/team_owner POST for team match; tournament POST returns `409 TOURNAMENT_RESULT_DERIVED_ONLY` because normal `end` derives+submits, zero-revision drift uses recovery, and corrections use `/corrections` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/submit` | `{expectedVersion}` → submitted revision/SLA timestamps; for a team-match source only, the same transaction validates authority/result and moves `SCHEDULED|LIVE|PAUSED→ENDED` before submission | owning team_manager/team_owner |
| `POST /api/v1/games/:gameId/result-recovery/derive-and-submit` | `{expectedVersion,takeoverToken,eventsHash,reason}` → atomically derived submitted revision/review timestamps | assigned tournament_director or platform_ops; only when game is `ENDED` and has no result revision, otherwise `409 RESULT_RECOVERY_NOT_REQUIRED` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/decision` | `{expectedVersion,decision:approve|change_request,reason?}` → official/pending state | opponent_manager for team match |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/supersede-and-submit` | `{expectedVersion,score,actualParticipants,eventsHash,mvpParticipantId?,reason}` → atomically creates a content-immutable superseding revision, moves it `DRAFT→SUBMITTED`, and starts a fresh review SLA | tournament_director/platform_ops; base must be `SUBMITTED` (Task 166 — 어드민이 제출된 결과를 그 자리에서 고친다), otherwise `409 RESULT_RESUBMISSION_NOT_ALLOWED` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/officialize` | `{expectedVersion,projectionPreviewHash}` → official revision/outbox watermark | platform_ops; tournament_director only when audited flag enabled |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/void` | `{expectedVersion,reason}` → append-only void revision/current pointer/outbox watermark | platform_ops; audited tournament_director only when flag enabled |
| `POST /api/v1/games/:gameId/corrections` | `{expectedVersion,baseRevisionId,reason,changes}` → superseding draft revision | platform_ops/tournament_director |
| `GET /api/v1/tournaments/:tournamentId/fixtures/:fixtureId/claimable-participants` · `GET /api/v1/league-matches/:leagueId/fixtures/:teamMatchId/claimable-participants` · `GET /api/v1/team-matches/:teamMatchId/claimable-participants` | → `{gameId,version,rosterCount,rosterSubmitted,participants[]}`; `participants` are the roster rows not yet linked or pending, `rosterCount` counts the whole roster with the official-result selector (per side: submitted lineup, else latest draft) so an empty list can tell "no roster yet" (`0`) from "everyone is linked"; `rosterSubmitted` is `true` once at least one side has a submitted (SUBMITTED/LOCKED) lineup — a draft-only roster still counts and lists candidates, but with no candidates the screen says "no submitted roster yet" instead of "everyone is linked" (tournament/league rosters are always submitted) | member of either participating team (`participant_identity`) |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-link-requests` | `{expectedVersion}` → `{requestId,state:"pending_attestation",version,effectiveAt,expiresAt}` | authenticated user is server-derived; database transaction time is `effectiveAt`, expiry is database `effectiveAt+24h`; caller identity/time fields are forbidden |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-link-requests/:requestId/attest` | `{expectedVersion,decision:approve|reject,reason}` → append-only attestation event and active/rejected link state | owning team_owner or platform_ops; cannot self-attest; expired/race-lost request returns `409 IDENTITY_LINK_REQUEST_EXPIRED` |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-links/:linkId/revoke` | `{expectedVersion,reason}` → append-only revoke event/version with database-derived `effectiveAt` and ≤5s public purge watermark | linked user or platform_ops |
| `POST /api/v1/games/:gameId/participants/:participantId/consents/grant` | `{expectedVersion,linkId,policyHash}` → append-only granted consent version with database-derived `effectiveAt` | actively linked user only |
| `POST /api/v1/games/:gameId/participants/:participantId/consents/revoke` | `{expectedVersion,reason}` → append-only revoked consent version with database-derived `effectiveAt` and ≤5s purge watermark | linked user or platform_ops for legal removal |
| `GET/POST /api/v1/tournament-ops/tournaments/:tournamentId/staff` | list or `{userId,role,fieldId?,fixtureIds?,expiresAt}` → assignment/version/audit | platform_ops; tournament_director may manage field_operator/support_readonly |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke` | `{expectedVersion,reason}` → revoked assignment/version/audit/realtime eviction | platform_ops; owning tournament_director for subordinate roles |
| `GET/POST /api/v1/tournament-ops/tournaments/:tournamentId/fields` and `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fields/:fieldId` | list or `{scopeKey,name,sortOrder}` / `{expectedVersion,name?,sortOrder?,active?}` → stable field/version | platform_ops; tournament_director read |
| `GET/PUT /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup` and `POST .../lineup/submit` | read; `{expectedVersion,sideId,formation,starters,bench}`; `{expectedVersion,takeoverToken}` → fixture lineup/version/state | assigned tournament_director save/submit; assigned field_operator may capture actual participants after start |
| `POST /api/v1/tournament-ops/jobs/:jobId/requeue` | `{expectedVersion,reason}` → `{status:"RETRY",attempts:0,retryGeneration,availableAt,version}` | platform_ops only; atomically requires `POISONED`, increments retryGeneration/version, resets attempts to 0, clears lease/lastError, audits `JOB_REQUEUED`; otherwise `409 JOB_NOT_POISONED` |
| `GET/PATCH /api/v1/tournament-ops/operation-flags/:key` | read or `{expectedVersion,value,gateBundlePath,gateBundleHash,reason}` → flag/value/version/audit | platform_ops; descriptor-verifies the attempt-bound bundle then applies CAS transition. `key` is `PUBLIC_LIVE` or `DIRECTOR_OFFICIALIZE` (`GAME_WRITE`/`GAME_READ` retired with the Task 10 cutover cleanup — see `docs/api/domains/game-migration.md`); `value` is `off`/`on` only. |
| `GET/POST /api/v1/tournament-ops/competition-configs` and `GET/POST /api/v1/tournament-ops/competition-configs/:id/versions` | filters or `{sportCode,name,periods,events,lineup,result,tieBreak,visibility}` → immutable version/contentHash | platform_ops read/create; tournament_director read |
| `POST /api/v1/tournament-ops/tournaments/:id/competition-config` | `{expectedVersion,competitionConfigVersionId,previewHash,confirmRecalculation}` → pinned version/impact | platform_ops; returns `409 CONFIG_RECALCULATION_CONFIRMATION_REQUIRED` without matching preview confirmation |
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations` | `{cursor,status,fieldId,warning}` → incremental fixture snapshot + watermark | assigned tournament staff |
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/escalations`, `GET .../escalations/:escalationId`, `POST .../escalations/:escalationId/ack`, and `POST .../escalations/:escalationId/resolve` | optional `status:PENDING|ACKNOWLEDGED|RESOLVED|CLOSED`; mutations require a nonblank `Idempotency-Key` header and `{expectedVersion:int>=0,reason:string(1..1000)}`; a missing or blank header and all other malformed path, query, header, or body input return `422`; idempotency records are retained 30 days → due, role-scoped queue item/version/audit with `replayed` on mutations | current active tournament `support_readonly` or `tournament_director`: due `REMINDER` list/detail/ack, never resolve; active `platform_ops`: due `ESCALATION` list/detail/ack/resolve |
| `GET /api/v1/tournament-ops/escalations`, `GET .../escalations/:escalationId`, `POST .../escalations/:escalationId/ack`, and `POST .../escalations/:escalationId/resolve` | optional `status:PENDING|ACKNOWLEDGED|RESOLVED|CLOSED`; mutations require a nonblank `Idempotency-Key` header and `{expectedVersion:int>=0,reason:string(1..1000)}`; a missing or blank header and all other malformed path, query, header, or body input return `422`; idempotency records are retained 30 days → cross-tournament due `ESCALATION` queue item/version/audit with `replayed` on mutations | current active `platform_ops` only; audit uses the fetched row's authoritative `tournamentId`; reminder-kind, future, and unknown rows are `404` |
| `GET /api/v1/tournaments/:id/schedule` and `GET /api/v1/tournaments/:id/matches/:fixtureId` | cursor/filter → visibility-filtered public projection | public |
| `GET /api/v1/teams/:id/records` and `GET /api/v1/users/:id/records` | cursor/season → official, consent-filtered records | public |

State transitions are literal: schedule `scheduled→cancelled|completed` only; lineup `draft→submitted→locked`, `submitted→change_requested→draft`, and any new submission supersedes rather than mutates; tournament-fixture game commands permit exactly `SCHEDULED→LIVE`, `LIVE→PAUSED`, `PAUSED→LIVE`, `LIVE|PAUSED→ENDED`, and `SCHEDULED|LIVE|PAUSED→CANCELLED`; team-match result submission alone additionally permits `SCHEDULED|LIVE|PAUSED→ENDED` in the same transaction as the validated submission; no transition leaves `ENDED|CANCELLED`. Team result revision state is `draft→submitted→official|change_requested`, `change_requested→superseding draft`; tournament review is `draft→submitted→official` (Task 166 contract — `rejected`/`supplement_requested` 는 enum 에서 제거됐다: 되돌려 보내는 왕복이 없어져 어드민이 그 자리에서 고쳐 확정한다), and a wrong submission goes `submitted→atomically created superseding draft→submitted`; official correction is `official→superseding correction draft→official|void`. Cancellation/void/reverse always require reason, expected version, idempotency key, actor audit, transactional outbox, and named visibility/SLA cleanup. Invalid transitions return `409 INVALID_STATE_TRANSITION`. Team-match result submit is team_owner/team_manager, decision is opponent_manager, and tournament officialize/void is platform_ops or audited flag-enabled tournament_director.

Review and compensation effects are exact:
- Tournament `end` atomically commits the ended state, derives one draft from the event stream, immediately moves it to `submitted`, and writes `game:<gameId>:revision:<revision>:submitted`; failure rolls back all three, so normal operation never leaves a draft-only result. The game-level `result-recovery/derive-and-submit` route exists only for pre-existing or manually repaired `ENDED` data with zero revision rows; it derives and submits in one transaction and never accepts a nonexistent revision ID.
- **Task 166 — `reject`/`request_supplement` 는 없어졌다.** 정본 §4 가 결과 흐름을 "종료 → 결과 보내기 → 어드민 확인" 한 단계로 확정하면서 *어드민이 팀에게 결과를 되돌려 보내는 왕복*이 사라졌다. 틀린 결과는 되돌려 보내지 않고 **어드민이 그 자리에서 고쳐 확정한다** — `supersede-and-submit`(base `SUBMITTED`) 로 새 리비전을 만들고 `officialize` 한다.
- `REJECTED`/`SUPPLEMENT_REQUESTED` 는 **제거됐다**(contract, 2026-09-03). 남아 있던 행은 두 갈래로 옮겼다 — 아직 확정되지 않았고 승계도 안 된 마지막 리비전은 `SUBMITTED`(어드민 확인 대기)로 되살리고, 나머지는 `CHANGE_REQUESTED`(terminal)로 얼렸다. 전부 `CHANGE_REQUESTED` 로 몰면 대회 픽스처의 재작성 경로가 모두 막혀 그 경기를 영영 고칠 수 없고, 전부 `SUBMITTED` 로 몰면 이미 공식 결과가 있는 경기를 덮어쓸 수 있다(그 구멍은 같은 릴리스에서 `409 RESULT_ALREADY_OFFICIAL` 로 닫았다).
- `void` creates an immutable `VOID` superseding revision and makes it the current official pointer. Its outbox key `game:<gameId>:revision:<voidRevision>:voided` transactionally removes the prior numeric score/events/participant records from public output, compensates team/player/standings aggregates, and recalculates affected next fixtures; a locked downstream fixture returns `409 NEXT_FIXTURE_CONFLICT` before pointer swap.
- Event reversal appends exactly one event whose unique non-null `reversesEventId` points to the target and whose business key is `game:<gameId>:event:<reversalSequence>`; a target may be reversed once. Any replacement is a separate append and therefore receives a separate sequence/ack.

<!-- API_CONTRACT_SECTION_END:Frozen REST and idempotency contract -->

## Runtime And General Conventions

Regular league publication is independent of lifecycle and result visibility.
`PATCH /admin/league-matches/:leagueId/visibility` accepts `{isPublic:boolean}` under
existing mutation-admin authorization and the standard validation/envelope/audit
contract. Public discovery and direct league/game reads cannot bypass a private
parent league; admin operations retain access. See [league visibility](./domains/league-matches.md#public-visibility).

The section above is the frozen cross-domain contract for the games/tournament-operations command
surface. What follows applies to every v1 endpoint, not only that surface.

- Local API origin: `http://localhost:8121`; prefix `/api/v1`; Swagger at `http://localhost:8121/docs`.
- JSON content type: `application/json`. CORS has credentials enabled; the production origin comes
  from `FRONTEND_URL`.
- All successful responses are wrapped by `TransformInterceptor`:

  ```json
  { "status": "success", "data": {}, "timestamp": "2026-05-18T00:00:00.000Z" }
  ```

- All exceptions are wrapped by `AllExceptionsFilter`:

  ```json
  {
    "status": "error",
    "statusCode": 400,
    "code": "VALIDATION_ERROR",
    "message": "입력값을 다시 확인해 주세요.",
    "details": [{ "field": "title", "messages": ["title should not be empty"] }],
    "requestId": 42,
    "timestamp": "2026-05-18T00:00:00.000Z"
  }
  ```

  If an exception does not provide `code`, the filter emits `INTERNAL_ERROR`.

## Validation

Global `ValidationPipe` settings: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`,
`enableImplicitConversion: true`. Frontend submit payloads must remove UI-only fields before calling
the API — unknown body/query fields can produce `400`.

## Authentication

Production authentication uses the signed `teameet_v1_session` HttpOnly cookie issued by successful
email registration/login and Kakao/Apple authentication responses (see [Auth](./domains/auth.md)).
The cookie is `Secure` in production, `SameSite=Lax`, scoped to path `/` (the Socket.IO handshake at `/socket.io` needs it too), and expires after seven
days. Guards validate its HMAC signature and expiry, then reload the current account status before
installing `request.v1User`.

Temporary persona headers (`x-v1-user-id`, `x-v1-user-email`) remain development/test-only.
Production Web does not send these identity headers, nginx strips them, and both guards ignore them
even if supplied. `V1AuthGuard` requires a valid signed session in production. `OptionalV1AuthGuard`
allows guests and hydrates a user only when a valid signed session is present.

Common auth errors: `401 UNAUTHENTICATED`, `403 PERMISSION_DENIED`, `403 SIGNUP_INCOMPLETE` for
authenticated social sessions that still require terms or profile completion, `422
PROFILE_COMPLETION_REQUIRED` for the creator-profile gate (see [Users](./domains/users.md)).

## Pagination (Outside The Frozen Command Surface)

Cursor-list DTOs use `cursor?: string`, `limit?: number`; list limits are usually `1..50`, except
chat messages which allow `1..100`. List responses are cursor-based result objects — frontend code
must not assume offset pagination. See
[Pagination, filtering, and sorting](./pagination-filtering-and-sorting.md) for domain-specific
defaults.

## Common Error Codes

Observed service/guard codes outside the frozen command surface: `UNAUTHENTICATED`,
`PERMISSION_DENIED`, `SIGNUP_INCOMPLETE`, `PROFILE_COMPLETION_REQUIRED`, `VALIDATION_ERROR` (DTO shape,
from `ValidationPipe`), `VALIDATION_FAILED` (service-level business rules),
`NOT_FOUND`, `NOT_FOUND_OR_ARCHIVED`, `ALREADY_PROCESSED`, `INTERNAL_ERROR`. State-changing callers
must handle stale or duplicate action responses as either `ALREADY_PROCESSED` or a domain-specific
validation/permission error.

## Deferred Boundaries

V1 intentionally has no payment, refund, dispute, support ticket, DM, file attachment, venue
operator, lesson, marketplace, or tournament success API outside the games/result flow documented
above. UI must not simulate successful transactions or support outcomes for these surfaces.

## Bracket bye mutation

`POST /admin/tournaments/:tournamentId/byes` follows the standard auth guard, mutation-admin permission, DTO whitelist and success/error envelopes. A bye is a saved group-team entry, without a TeamMatch or Game result. See [the tournament domain](./domains/tournaments.md#라운드별-부전승-직접-등록-2026-10-05) for phase, capacity, conflict and display-position contracts.

- 2026-10-05: tournament bye slots allow null registration + byeId reassignment; pre-start fixture deletion archives canonical history. See [tournament contract](domains/tournaments.md).
