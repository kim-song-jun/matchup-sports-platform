# League matches

League creation is exposed under `/api/v1/admin/league-matches` and public
league reads under `/api/v1/league-matches`.

## Public visibility

`V1Tournament.isPublic` (`v1_tournaments.is_public`) controls publication separately
from league lifecycle and soft deletion. It defaults to `true`, including existing
rows after migration. Public discovery and direct public reads require it to be
`true`; authenticated membership alone does not bypass publication. Admin league
reads and operations keep access to unpublished leagues.

`PATCH /api/v1/admin/league-matches/:leagueId/visibility` accepts only
`{ "isPublic": boolean }` and returns `{ leagueId, isPublic }` in the standard
success envelope. It requires an active mutation administrator and records the
publication change in the existing admin audit. The admin league detail includes
`isPublic` so settings hydrate from the actual league. The HTTP validation pipe
preserves the original JSON type for this field: strings (including `"false"`),
numbers, arrays, objects, null and a missing value return `400 VALIDATION_ERROR`.

`GET /api/v1/admin/league-matches` accepts an optional `visibility=public|hidden` filter next to
`seriesId` (any other value returns `400`); omitting it lists every league.

Unpublishing removes the league from home discovery, league and tournament public
lists, API-backed search and sitemap discovery. Direct public league, standings,
fixture and associated public game reads return the normal not-found error.
Publication changes preserve lifecycle, registrations, fixtures and result
visibility policies. Re-publishing makes the preserved league data public again.

Production rollout requires the additive migration and API/web deployment before
changing a league setting. A database-only change ahead of the serving API cannot
enforce publication. Production promotion from dev to main is performed by the user.

## Manual completion (리그 종료)

`POST /api/v1/admin/league-matches/:leagueId/complete` (optional `reason`, max 200) closes an
`active` league whose remaining fixtures are all settled — the same rule as the automatic
transition (`shouldCompleteLeague`: at least one non-cancelled, non-voided fixture and every one of
them has an official result). Automatic completion only runs on result confirmation and fixture
cancellation, so a league reopened with `revert-completion` without any fixture change used to stay
`active` (MD-QA #93). Fixtures still waiting for a result return `409 LEAGUE_FIXTURES_PENDING`; a
draft or on-hold league returns `409 LEAGUE_NOT_ACTIVE`; an already completed league returns
`alreadyProcessed: true`. Records `league_match.complete` in the admin audit and returns
`{ leagueId, state: "completed", alreadyProcessed }`.

## State change (상태 변경)

`POST /api/v1/admin/league-matches/:leagueId/state` takes `{ "state": "draft" | "active" | "on_hold" | "completed", "reason"?: string }`
(reason max 500) and is the single endpoint behind the admin "상태 변경" button. It reuses the rules of the
endpoints below instead of adding new ones:

- `on_hold` → hold (reason required, otherwise `422 LEAGUE_REASON_REQUIRED`).
- From `on_hold`, only the remembered pre-hold state is accepted (resume); any other target returns
  `409 LEAGUE_ON_HOLD`.
- `completed` → manual completion (same `409 LEAGUE_FIXTURES_PENDING` / `LEAGUE_NOT_ACTIVE`).
- `active` from `completed` → revert completion. `active` from `draft` (stored `draft`/`open`/`closed`)
  starts the league (stored `in_progress`, audit `league_match.start`). Before this, only fixture
  generation moved a league to active.
- `draft` from `active` moves back to stored `draft` (audit `league_match.revert_to_draft`) only while no
  game has started (`LIVE`/`PAUSED`/`ENDED`); otherwise `409 LEAGUE_HAS_STARTED_GAMES`. `draft` from
  `completed` returns `409 LEAGUE_NOT_ACTIVE` (revert to active first).
- Asking for the current state returns `alreadyProcessed: true`.

Returns `{ leagueId, state, alreadyProcessed }`. The individual `hold`/`resume`/`complete`/`revert-completion`
endpoints stay for compatibility.

## Hold and resume (보류)

A regular league is put on hold instead of being cancelled (2026-10-07).
`POST /api/v1/admin/league-matches/:leagueId/hold` requires `{ "reason": string }`
(1–500 chars) and an active mutation administrator. It sets the stored status to
`on_hold` (league `state: "on_hold"`), sets `isPublic` to `false` so the league and
its fixtures disappear from every public read, and keeps fixtures, results and
registrations untouched — remaining fixtures are **not** cancelled. The previous
status and visibility are kept in `held_from_status` / `held_from_public`.
Completed or cancelled leagues return `409 LEAGUE_NOT_HOLDABLE`; holding an
already-held league returns `alreadyProcessed: true`.

`POST /api/v1/admin/league-matches/:leagueId/resume` (optional `reason`) restores the
remembered status and visibility and clears both columns. A league that is not on
hold returns `alreadyProcessed: true`. While on hold,
`PATCH .../visibility` with `isPublic: true` returns `409 LEAGUE_ON_HOLD`; resuming
restores visibility. Both actions record `league_match.hold` / `league_match.resume`
in the admin audit and return `{ leagueId, state, isPublic, alreadyProcessed }`.
A concurrent status or visibility change returns `409 LEAGUE_STATE_CHANGED`;
hold compares both values so a newly private league is never restored as public.
When resume restores `active` and every non-cancelled, non-voided fixture already has an
official result, the league is completed in the same transaction (status-change reason
`hold_released`) and the response returns `state: "completed"` (MD-QA #93).
While on hold, fixture generation and regeneration return `409 LEAGUE_ON_HOLD`
without creating or cancelling fixtures. Both actions recheck the status after
locking the parent league row, including a hold committed during plan calculation.
A completed or cancelled league rejects the same generation, template and slot-assignment
actions with `409 LEAGUE_ENDED`; releasing slots on registration cancellation is not guarded.
`POST .../fixtures/manual` and `PATCH .../fixtures/:teamMatchId` (update-fixture) also return
`409 LEAGUE_ENDED` for a completed or cancelled league, but unlike generation they stay allowed
while the league is on hold. Update-fixture writes the fixture first and then takes the league row
with `FOR SHARE NOWAIT` and re-checks the status, so an edit that overlaps the final result completing
the league is either rejected or committed before the completion. It never waits on the league row:
when another transaction holds it (completion, regeneration, team removal, template replacement,
manual add), the edit is rolled back with `409 COMMAND_CONCURRENCY_CONFLICT` ("잠시 후 다시 시도해
주세요"), because the league-first and fixture-first lock orders both exist and waiting would deadlock
with one of them.

Automatic completion follows the same rule from the fixture side. When the last result is officialized
(or the last remaining fixture is cancelled or voided) the completion step locks the league row with
`FOR UPDATE NOWAIT` while its caller still holds the game row. If regeneration, template replacement
or another league-first operation holds the league row, completion gives up with the same retryable
`409 COMMAND_CONCURRENCY_CONFLICT`: the result projection worker retries it later (its retry backoff
outlasts the 45-second league-lane transactions), an operator cancellation can be retried, and the
league-first operation proceeds (for example to its own `BRACKET_LOCKED` check) instead of being killed
as a deadlock victim. Team removal and hold release already hold the league row in the same
transaction, so they are unaffected; manual completion (`complete`) gets the same retryable 409 when
the league row is busy.

While a league is on hold, already-scheduled notifications for its fixtures are
suppressed at fire time (the outbox rows are kept, so resuming re-enables the next
firing): game day-before/kickoff reminders and lineup reminders/todos
(`NOT_IN_HELD_LEAGUE_WHERE`), the admin result-entry reminder, team schedule
RSVP-deadline and guest-recruitment-close reminders for fixture schedules, and the
league roster-submission reminder (`src/league-matches/league-hold.ts`).

## Close registration (즉시 마감)

`POST /api/v1/admin/league-matches/:leagueId/close-registration` (HTTP 200) takes an
optional `{ "reason": string }` (max 200 chars; whitespace-only becomes `null`) and
requires an active mutation administrator (support and non-admins get
`403 PERMISSION_DENIED`). The server moves `registrationDeadlineAt` to the current
time; the deadline stays the single judge of "open", so the public CTA, `/apply` and
the submit API close together. `status` is not touched, `on_hold` leagues can be
closed, and nothing is sent to teams. Submitted registrations stay as they are; only
new submissions are blocked. Reopening is the existing
`POST .../open-registration` (deadline moved into the future) — close and open are
not mixed into one endpoint.

Response `data`: `{ leagueId, registrationOpen: false, registrationDeadlineAt, alreadyProcessed }`.
A league whose deadline is already past or never set returns `alreadyProcessed: true`
with no write and no audit row (an unset deadline is not rewritten to "now").
Same-millisecond boundary: a submit with `deadline == now` is still accepted; the next
judgement is closed.

| Case | Response |
|---|---|
| unknown league id, or a tournament id | `404 LEAGUE_NOT_FOUND` |
| soft-deleted league | `409 LEAGUE_MIRROR_MISSING` |
| `completed` / `cancelled` | `409 LEAGUE_REGISTRATION_NOT_ALLOWED` |
| deadline changed between read and write | `409 LEAGUE_STATE_CHANGED` |

The write records `league_match.close_registration` with `reason`,
`beforeJson.registrationDeadlineAt` and `afterJson.registrationDeadlineAt`
(no status transition fields).

## Entry fee and payment instructions (참가비)

The fee is a per-team amount for the season (the league row). Payment stays bank
transfer with manual confirmation by an admin; there is no payment gateway.
`PATCH /api/v1/admin/league-matches/:leagueId/entry-fee` requires
`{ "entryFee": integer 0..100000000 }`; `bankName`, `bankAccount`, `bankHolder`
(1–60 chars, trimmed, no control characters) are optional and keep their current
value when omitted — there is no way to clear an account, only to change it.
`entryFee` is validated on the raw JSON value, so `""`, `"0"`, `null`, `false` and `[]`
are rejected with 400 instead of being coerced to a free league. `reason` is optional
(max 500; whitespace-only becomes `null`). Unknown fields return 400.

- `entryFee > 0` needs all three bank fields after merging with the stored values,
  otherwise `422 LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED`. A free league needs no account.
- `entryFeeConfiguredAt` is `null` until an admin saves the fee. `null` means "not
  set yet"; a value with `entryFee: 0` means "free, confirmed". Saving the same
  values while it is still `null` is a real change (it confirms), so it writes.
  Saving identical values when it is already set returns `alreadyProcessed: true`
  with no write and no audit.
- A reason is required (`422 LEAGUE_ENTRY_FEE_REASON_REQUIRED`, nothing saved) only
  when the amount or an account field actually changes **and** at least one active
  registration exists. Active means applied by the team itself
  (`entrySource` is `applied` or legacy `null`; operator-placed `seeded`/`promoted`
  teams do not count) and status not `draft` or `cancelled`. The count runs after the
  conditional UPDATE took the row lock, so a concurrent submit cannot slip past.
- `completed` / `cancelled` leagues return `409 LEAGUE_ENTRY_FEE_NOT_ALLOWED`; other
  codes match close-registration (`LEAGUE_NOT_FOUND`, `LEAGUE_MIRROR_MISSING`,
  `LEAGUE_STATE_CHANGED`).
- Existing registrations keep the amount they were created with: `payment.amount` is
  a snapshot taken at submit time and this endpoint never writes registration or
  payment rows. The payment-instruction block in a registration response is shown
  when that registration's own `payment.amount > 0`, not when the current league fee
  is positive (this also applies to tournaments). The bank account itself is read from
  the league row on every response.
- The server does not block opening registration while the fee is unset; the web
  confirmation modal ("무료로 열기") is the only guard.
- Audit action `league_match.entry_fee_updated`. Account number and holder are
  never written to the audit (the tournament admin update path does not either); the
  after snapshot carries `entryFee`, `entryFeeConfigured`, `bankName`,
  `hasBankAccount`, `hasBankHolder`, `bankAccountChanged`, `bankHolderChanged`.
  Request-body logging masks `bankAccount` and `bankHolder` (`[REDACTED]`).

Response `data`: `{ leagueId, entryFee, entryFeeConfiguredAt, bankName, bankAccount, bankHolder, alreadyProcessed }`.
Example payload (fake values): `{ "entryFee": 150000, "bankName": "국민은행", "bankAccount": "123-456-789012", "bankHolder": "팀밋", "reason": "참가비 조정" }`.

## Cover image (대표 이미지)

`PATCH /api/v1/admin/league-matches/:leagueId/cover-image` takes
`{ "coverImageUrl": string | null }`. The key is required; `null` removes the image.
Only paths created by the upload endpoint are accepted (`/uploads/…`, max 1000 chars);
external URLs, `javascript:`, `..` segments and empty strings return 400. The check is
the shared `common/safe-image-url.ts` validator (campaign and sponsor behaviour is
unchanged). Allowed in every status including `on_hold`, `completed` and `cancelled`.
Last write wins. The old file is never deleted because the next season may have
inherited the same URL. A value equal to the stored one returns
`alreadyProcessed: true` without audit. Response `data`:
`{ leagueId, coverImageUrl, alreadyProcessed }`; errors `404 LEAGUE_NOT_FOUND`,
`409 LEAGUE_MIRROR_MISSING`. Audit action `league_match.cover_image_updated`
(before/after `coverImageUrl`).

## Default venue (기본 장소)

`GET /admin/league-matches/:leagueId` returns `defaultPlace: { name, address, latitude,
longitude, provider, providerPlaceId } | null` built from the league's venue columns
(a pin without a `kakao` provider is dropped; name and address stay).

`PATCH /api/v1/admin/league-matches/:leagueId/venue` takes
`{ venue, venueAddress?, venueLatitude?, venueLongitude?, venueProvider?, venueProviderId? }`
(same place-snapshot rules as other domains: `venue` max 200, pin fields all-or-none else
400 `PLACE_SNAPSHOT_INCOMPLETE`). The `venue` key is required (`string | null`) — a body without it is
400 `VALIDATION_ERROR` and changes nothing. `null` or blank `venue` clears the whole snapshot. Existing
fixtures are never touched; only fixtures created afterwards inherit the default. Response
`data`: `{ leagueId, defaultPlace }`; errors `404 LEAGUE_NOT_FOUND`, `409 LEAGUE_MIRROR_MISSING`.
Audit action `league_match.venue_updated` (before/after `defaultPlace`).

`PATCH /api/v1/admin/tournaments/:id` stays regular-tournament only (the #863
lock); it is intentionally not opened for leagues.

## Detail fields and season carry-over

- Admin detail (`GET /api/v1/admin/league-matches/:leagueId`) adds `sportCode`,
  `coverImageUrl`, `entryFee`, `entryFeeConfiguredAt` (ISO or `null`), `bankName`,
  `bankAccount`, `bankHolder`, `activeRegistrationCount` and `confirmedRegistrationCount`
  (both count only team-submitted registrations, so operator-seeded teams never make
  "confirmed" exceed "active"; screen hints — the final
  reason-required decision is the save transaction's own count). Bank fields are
  admin-only.
- Admin detail also returns `heldFromState` (the state resume returns to; only while on hold, otherwise
  `null`), `minPlayers`, `maxPlayers` (team roster cap, `null` = unlimited) and `plannedFixtureCount`
  (total games chosen at creation, `null` = not set).
- Public detail (`GET /api/v1/league-matches/:leagueId`) adds `sportCode`,
  `coverImageUrl`, `entryFee` and `entryFeeConfigured` (`entryFeeConfiguredAt != null`).
  The raw timestamp, the bank fields and registration counts are never in any public
  league response or in `/tournaments` responses. Clients must not render the fee
  when `entryFeeConfigured` is `false` — an unset fee is not "free".
- Season carry-over: `commitPromotions` (promotion/relegation commit) copies
  `coverImageUrl`, `entryFee`, the three bank fields and the team roster size (`minPlayers`,
  `maxPlayers` — `null` stays unlimited) from the previous season's
  league of the **same tier** into the new season. `entryFeeConfiguredAt` is left
  `null`, so the new season shows as "inherited — please confirm". Values are copied,
  not linked: later edits to either season do not affect the other. First-season
  seeding and single-league creation have no previous season and are unchanged.

Rollout: the migration (`entry_fee_configured_at`, nullable add) is additive and the
screens use it after the API is deployed. Promotion from dev to main is performed by
the user.

## Create a league

Creation requires an authenticated active owner/ops administrator. The existing
mutation-admin authorization remains unchanged; support administrators cannot create leagues.

`POST /api/v1/admin/league-matches` accepts `title`, UUID `sportId`, ISO
`startsOn` and `endsOn`, and UUID `teamIds`. `regionId` is a non-empty master
region identifier. Master data may use stable slugs such as
`region-busan-jung`; it is not required to be a UUID.

Optional roster and plan fields:

- `minPlayers` / `maxPlayers` (1–50): team roster size. `maxPlayers: null` means **unlimited** — every
  eligible team member goes onto the roster (auto-fill and roster add skip the `ROSTER_FULL` check).
  Omitting them means unlimited (`minPlayers: 1, maxPlayers: null`) — the league default for every creation
  path, including league-series seeding; season carry-over copies the previous season's values instead.
  The 6/10 column default applies to tournaments only. `minPlayers > maxPlayers` returns
  `422 LEAGUE_ROSTER_RANGE_INVALID`. Responses that carry `maxPlayers` (tournament list/detail for a league) may now return `null`.
- `plannedFixtureCount` (1–500): total games planned for the league. It is only the default for the
  fixture generation form (see `fixtureCount` below); it never limits manual fixtures.

The service then verifies that the region exists, is active, and has level 2.
An unknown, inactive, or non-district identifier returns `422
LEAGUE_REGION_INVALID`. This domain check remains separate from DTO shape
validation so persisted master identifiers are accepted without allowing
arbitrary regions.

## Create a league series

`POST /api/v1/admin/league-series` accepts `title`, UUID `sportId`, a
non-empty master `regionId` string (maximum 100 characters), and `tierCount`
from 1 through 3. Region slugs such as `region-busan-jung` are valid; UUID
strings remain valid at the DTO boundary for compatibility. The service still
requires the region to be active and level 2, and returns `422
LEAGUE_REGION_INVALID` for an unknown or unsuitable region.

## Read and manage fixtures

- `GET /api/v1/league-matches/me` lists leagues for the authenticated user's
  active team memberships and confirmed registrations.
- `GET /api/v1/league-matches/:leagueId` returns the league schedule summary.
  Each fixture's score follows the D-06 visibility matrix (see
  `docs/api/domains/public-records.md`): a gated row carries
  `homeScore = awayScore = null` with `scoreHidden: true` instead of being
  dropped. Only `hidden` and `status_only` gate a row -- `official_only`
  (which is where `PUBLIC_LIVE=off` lands a `live` policy) keeps the
  confirmed score. `scoreHidden` is `true` only when an official result
  exists and is being withheld; a fixture that has not been played yet
  reports `false`. Standings keep counting the official facts. Each fixture
  also carries `gameState` (`SCHEDULED|LIVE|PAUSED|ENDED|CANCELLED`) — `null`
  when there is no game or the effective visibility is `hidden` — so a match
  that kicked off before its scheduled time reads as live, not upcoming
  (Task 180 W4-V13).
- `GET /api/v1/league-matches/:leagueId/standings` returns standings and
  fixtures.
- `GET /api/v1/admin/league-matches/:leagueId` 의 각 `fixtures[]` 는 결과 진행 단계 `resultStage` 와 별개로 경기(Game)의
  진행 상태 `gameState`(`SCHEDULED|LIVE|PAUSED|ENDED|CANCELLED`, 경기가 아직 없으면 `null`)를 싣는다. 결과 단계는 진행 중과
  시작 전을 둘 다 `not_entered` 로 말해서, 어드민 "지금 할 일" 카드가 뛰는 중인 경기를 찾는 유일한 근거다.
- `POST /api/v1/admin/league-matches/:leagueId/fixtures/manual` creates one
  fixture with `homeTeamId`, `awayTeamId`, `startsAt`, and optional
  `durationMinutes`, `placeName`, and `title`.
  Omitting `durationMinutes` fills `endAt` with `startsAt` + the fixture's
  regulation time (non-extra-time period total: both halves, or the single
  period of a one-period match).
  A completed or cancelled league returns `409 LEAGUE_ENDED`; a league on hold is allowed.
- `POST /api/v1/admin/league-matches/:leagueId/fixtures` (and `preview`,
  `regenerate`) accept `timing.gameDurationMinutes` as optional. When omitted,
  the regulation time of the league's own competition config (the version edited
  through the period settings, not the sport default) is used, and new fixtures
  are pinned to that version; a league without one returns
  `409 COMPETITION_CONFIG_REQUIRED`. A legacy
  config without period lengths fails with
  `422 LEAGUE_FIXTURE_DURATION_REQUIRED`. Without any `timing`, fixtures of a
  matchday share one kickoff and `endAt` is kickoff + regulation time.
- The same three endpoints accept optional `roundsCount` (integer 1–104). The
  total number of rounds is `weeksCount × timing.gamesPerTeamPerDay` (default 1
  per day), cut down to `roundsCount` when given; omitting it keeps that product.
  Send it when `weeksCount` is rounded up for `gamesPerTeamPerDay` (for example
  4 teams, 2 games per day: 2 weeks × 2 = 4 rounds, but a single round robin has
  3) so the spare slot does not replay round 1 as a rematch. A total above 104
  rounds still returns `422 LEAGUE_FIXTURE_LIMIT_EXCEEDED`; `roundsCount` itself
  is capped at 104.
- They also accept optional `fixtureCount` (1–500): fixtures are generated in round-robin order and cut
  at that count, so a league created with `plannedFixtureCount` gets exactly that many games. The client
  sends enough rounds (`ceil(fixtureCount / floor(teams / 2))`) for the count.
- `POST /api/v1/admin/league-matches/:leagueId/fixtures/:teamMatchId/cancel`
  (`{ reason }`) cancels one fixture; an already-cancelled fixture returns
  `alreadyProcessed: true`. A fixture whose game is in progress (`LIVE` or
  `PAUSED`) returns `409 LEAGUE_FIXTURE_GAME_IN_PROGRESS` — the game would
  otherwise stay running with no way to end it. End it from the live console
  (forfeit/abandon end) first. Scheduled and ended games stay cancellable
  (ended ones for result corrections). The admin fixture table disables the
  cancel action on the same condition.
- The two other paths that cancel fixtures apply the same rule to every
  not-yet-cancelled fixture they would cancel, with the same
  `409 LEAGUE_FIXTURE_GAME_IN_PROGRESS` and nothing changed:
  `DELETE /api/v1/admin/league-matches/:leagueId/teams/:teamId` (team removal —
  that team's fixtures) and
  `POST /api/v1/admin/league-matches/:leagueId/fixtures/regenerate` (all
  fixtures). Already-cancelled fixtures are skipped, so an orphaned live game
  on a cancelled fixture does not block them. The admin screen disables the
  team's remove button and the regenerate button on the same condition.

## Template skeleton and slots (자리 기반 대진)

A league can be drawn first and filled with teams later. A **slot** (`V1TournamentSlot`, `kind=ENTRY`,
`groupId=null`) is a seat a team will take; a fixture points at its two seats with `homeSlotId` /
`awaySlotId`.

- `POST /api/v1/admin/league-matches/:leagueId/fixtures/template`
  (`{ teamCount: 3..20, legs: 1|2, schedule: { dates: string[], time: string }, placeName?, replaceExisting? }`)
  creates `teamCount` slots and the round-robin fixtures between them in one transaction (response
  `{ slots, fixtures }`). `schedule` is required: one date per round (`LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT`
  / `LEAGUE_SCHEDULE_DATE_PAST` / `LEAGUE_SCHEDULE_DATE_INVALID` as in bulk generation). `placeName`
  defaults to `장소 미정`. More than 240 fixtures returns `422 BRACKET_TEMPLATE_TOO_LARGE`. The league
  `status` is **not** changed.
  - Locks the league row (`FOR UPDATE`) and applies the same guard as bulk generation: `409 LEAGUE_ON_HOLD`
    while on hold, `409 LEAGUE_ENDED` for a completed or cancelled league (checked first, even when fixtures
    exist). Otherwise a league that already has any fixture (cancelled ones included) returns `409 LEAGUE_FIXTURES_EXIST`, so
    a concurrent bulk generation and a template cannot both succeed.
  - `replaceExisting: true` cancels the existing non-cancelled fixtures (never deletes — games are
    `Restrict`-linked), releases their slot links, deletes the old slots and builds the new ones. Allowed
    only when **every** non-cancelled fixture is unstarted and has no result revision; otherwise
    `409 BRACKET_LOCKED` and nothing changes.
  - Support admins get `403`.
- An empty fixture has `hostTeamId = approvedApplicantTeamId = null`, `status = matched`, side names
  `홈 팀 미정` / `어웨이 팀 미정`, and no team schedules, participants or application.
- `PUT /api/v1/admin/tournament-slots/:slotId/assignment` (shared with tournaments, see
  `docs/api/domains/tournaments.md`) fills or empties a slot and updates every fixture that uses it
  ("uses" = `deletedAt IS NULL AND status <> 'cancelled'`). League specifics: **team schedules are created
  only when both sides are filled** (both are cancelled again if one side is emptied); the away side's
  approved application is upserted on `(teamMatchId, applicantTeamId)` and the previous team's row becomes
  `withdrawn`. When no slot-linked fixture has an empty side any more, a `draft`/`open`/`closed` league moves to the
  same in-progress state as bulk generation (`on_hold` / `completed` are never touched; it never moves back).
- Removing a team (`DELETE .../teams/:teamId`) or cancelling its registration releases its slots instead of
  cancelling the fixtures **when every fixture using the slot is unstarted**; if one has started the slot is
  kept. Fixtures without slots are cancelled exactly as before.
- `POST .../fixtures/regenerate` returns `409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` for a league that has slots
  — use the template with `replaceExisting` instead.
- `POST .../fixtures/:teamMatchId/cancel` works for empty fixtures (no team notification) and clears the
  fixture's slot links. Cancelling the last empty fixture can promote the league (see above).

### Public visibility of unfilled fixtures

A fixture linked to a slot whose side has no team (`homeSlotId ≠ null ∧ hostTeamId = null`, or
`awaySlotId ≠ null ∧ approvedApplicantTeamId = null` — a half-filled fixture included) is **excluded** from:
`GET /league-matches/:id` and `/standings` (fixtures, pending fixtures), `GET /tournaments/:id` (`leagueFixtures`),
`GET /tournaments/:id/standings/overall` (progress), `GET /tournaments/:id/schedule`,
`GET /tournaments/:id/matches/:fixtureId` and `GET /league-matches/:id/fixtures/:fixtureId/record` (404),
`GET /team-matches` (also the web sitemap source) and `/team-matches/:id` (404), and every scope of
`GET /me/team-matches`. Fixtures without slots are unaffected, even when `approvedApplicantTeamId` is null.
The week label ("N주차") is always counted over all non-deleted fixtures of the league, gated or not.
The result-entry reminder skips such fixtures as well.

### Admin response additions

- `GET /admin/league-matches/:leagueId`: each fixture carries `homeSlotId`, `awaySlotId` and
  `game: { id, state, version, hasLiveRecords, hasOfficialResult, latestRevision: { id, state, score, entryMethod } | null } | null`;
  `homeTeamId` / `awayTeamId` are `string | null`. Top level `slots[]`:
  `{ id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }` (label `N번 자리`).
- `GET /admin/league-matches/:leagueId/teams`: each team carries `registrationId` (the confirmed
  registration id the slot assignment endpoint takes).
- `GET /admin/league-matches/:leagueId/videos`: `homeTeamName` is `string | null` (an unfilled fixture no
  longer returns `409 LEAGUE_FIXTURE_INCOMPLETE`).

### Fixture place snapshot (Task 20261070)

- Generate / regenerate / manual / template / update-fixture DTOs accept `placeName`, `placeAddress`, `placeLatitude`, `placeLongitude`, `placeProvider`, `placeProviderId`.
- A blank `placeName` inherits the league's default place (the mirror tournament's `venue` snapshot); with no default it falls back to `장소 미정` with no coordinates. On update, a present `placeName` replaces the whole snapshot.
- Fixture rows (admin detail, `updateFixture`, public list/detail) keep `placeName` and add `place: V1PlaceView | null`; admin `recentVenues` is now `V1PlaceView[]` (most recent snapshot per name, default excluded).

## Basic information editing (리그 기본 정보 수정)

`GET /api/v1/admin/league-matches/:leagueId/settings` requires an active administrator.
`PATCH` at the same path requires owner/ops (`support` is read-only). Both are guarded by
`V1AuthGuard`, UUID route validation, `kind=regular_league` and `deletedAt=null`.

GET and successful PATCH return `{ leagueId, title, rulesText, regionId, startsOn, endsOn,
registrationDeadlineAt, updatedAt, status, sportName }` inside the standard success envelope.
Missing description is normalized to `rulesText: ""`; incomplete legacy dates/region remain null.
PATCH requires the full editable snapshot: `{ expectedUpdatedAt, title, rulesText, regionId,
startsOn, endsOn, registrationDeadlineAt }`. Title is trimmed, nonempty, max 100; rulesText max
10,000; region must be an active level-2 district when changed; dates are ISO date-times.
Empty rulesText is stored as null. Unknown UI fields and missing/invalid fields return
`400 VALIDATION_ERROR`. No idempotency header is required by this route; optimistic concurrency
uses exact `updatedAt` (`expectedUpdatedAt`) rather than `expectedVersion`.

A tournament row lock, version check, write and `league_match.update_settings` before/after audit
share one transaction. Stale snapshots return `409 LEAGUE_SETTINGS_STALE`; completed/cancelled
leagues return `409 LEAGUE_ENDED`. End before start returns `422 LEAGUE_PERIOD_INVALID`.
Changed periods cannot exclude the start/end of a non-cancelled, non-deleted existing fixture
(`409 LEAGUE_FIXTURES_OUTSIDE_PERIOD`). No fixtures are moved automatically.
Changed inactive/non-district regions return `422 LEAGUE_REGION_INVALID`.
A changed, non-null deadline must be future (`422 LEAGUE_REGISTRATION_DEADLINE_PAST`);
null closes new applications. Unchanged historical deadlines are preserved. Lifecycle,
publication, existing applications, fees, sports, teams and fixtures stay unchanged.
Regular leagues continue to have **no application capacity limit**; `teamCount` is not editable here.

The admin detail links to `/admin/league-matches/:leagueId/edit` for writers on unfinished leagues.
The form hydrates that exact league, preserves failed drafts, and confirms explicit discard/reload.
Dates use KST; untouched ISO instants retain seconds/milliseconds. A successful save invalidates
admin/public league and tournament queries and returns to the admin detail. Public league detail
now includes nullable `rulesText`, rendered as operating guidance only when populated.
