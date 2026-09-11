# League matches

League creation is exposed under `/api/v1/admin/league-matches` and public
league reads under `/api/v1/league-matches`.

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

## Read and manage fixtures

- `GET /api/v1/league-matches/me` lists leagues for the authenticated user's
  active team memberships and confirmed registrations.
- `GET /api/v1/league-matches/:leagueId` returns the league schedule summary.
- `GET /api/v1/league-matches/:leagueId/standings` returns standings and
  fixtures.
- `POST /api/v1/admin/league-matches/:leagueId/fixtures/manual` creates one
  fixture with `homeTeamId`, `awayTeamId`, `startsAt`, and optional
  `durationMinutes`, `placeName`, and `title`.
