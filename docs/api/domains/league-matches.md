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
