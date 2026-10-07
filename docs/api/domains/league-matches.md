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

Unpublishing removes the league from home discovery, league and tournament public
lists, API-backed search and sitemap discovery. Direct public league, standings,
fixture and associated public game reads return the normal not-found error.
Publication changes preserve lifecycle, registrations, fixtures and result
visibility policies. Re-publishing makes the preserved league data public again.

Production rollout requires the additive migration and API/web deployment before
changing a league setting. A database-only change ahead of the serving API cannot
enforce publication. Production promotion from dev to main is performed by the user.

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
While on hold, fixture generation and regeneration return `409 LEAGUE_ON_HOLD`
without creating or cancelling fixtures. Both actions recheck the status after
locking the parent league row, including a hold committed during plan calculation.

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

`PATCH /api/v1/admin/tournaments/:id` stays regular-tournament only (the #863
lock); it is intentionally not opened for leagues.

## Detail fields and season carry-over

- Admin detail (`GET /api/v1/admin/league-matches/:leagueId`) adds `sportCode`,
  `coverImageUrl`, `entryFee`, `entryFeeConfiguredAt` (ISO or `null`), `bankName`,
  `bankAccount`, `bankHolder` and `activeRegistrationCount` (a screen hint; the final
  reason-required decision is the save transaction's own count). Bank fields are
  admin-only.
- Public detail (`GET /api/v1/league-matches/:leagueId`) adds `sportCode`,
  `coverImageUrl`, `entryFee` and `entryFeeConfigured` (`entryFeeConfiguredAt != null`).
  The raw timestamp, the bank fields and registration counts are never in any public
  league response or in `/tournaments` responses. Clients must not render the fee
  when `entryFeeConfigured` is `false` — an unset fee is not "free".
- Season carry-over: `commitPromotions` (promotion/relegation commit) copies
  `coverImageUrl`, `entryFee` and the three bank fields from the previous season's
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
- `POST /api/v1/admin/league-matches/:leagueId/fixtures` (and `preview`,
  `regenerate`) accept `timing.gameDurationMinutes` as optional. When omitted,
  the regulation time of the fixture's competition config is used; a legacy
  config without period lengths fails with
  `422 LEAGUE_FIXTURE_DURATION_REQUIRED`. Without any `timing`, fixtures of a
  matchday share one kickoff and `endAt` is kickoff + regulation time.
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
