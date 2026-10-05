# Teameet v1 API contracts

This directory is the single indexed contract tree for `apps/v1_api` and `apps/v1_web`. Swagger is reference material; the controller, DTO, service gates, integration tests, frontend hooks/types, and these canonical contracts must agree.

For every domain document here, the actual `apps/v1_api/src/**` controller/DTO/service is the
source of truth — a contract doc that disagrees with the running code is wrong and should be fixed
in the same change that discovers the drift.

## Read order

1. [Global contract](./global-contract.md)
2. Domain contract for the feature being integrated

## Canonical domain index

- [Auth](./domains/auth.md)
- [Users](./domains/users.md)
- [Matches](./domains/matches.md)
- [Teams](./domains/teams.md)
- [Team matches](./domains/team-matches.md)
- [Tournaments](./domains/tournaments.md)
- [League matches](./domains/league-matches.md)
- [Games](./domains/games.md)
- [Team schedules](./domains/team-schedules.md)
- [Tournament operations](./domains/tournament-operations.md)
- [Tournament operations authorization](./domains/tournament-operations-auth.md)
- [Tournament operations escalations](./domains/tournament-operations-escalations.md)
- [Game realtime](./domains/game-realtime.md)
- [Game migration and cutover](./domains/game-migration.md)
- [Public records](./domains/public-records.md)
- [Chat](./domains/chat.md)
- [Notifications](./domains/notifications.md)
- [Home, search, notices, popups, master data](./domains/home-notices-master.md)
- [Admin and operations](./domains/admin-and-ops.md)
- [Supporting domains](./domains/supporting-domains.md)

Each domain appears exactly once in this index.

**Removed 2026-09-27 (v0-only, no `apps/v1_api` module — PR #1313 deleted the legacy apps that
implemented them):** Venues, Lessons, Marketplace, Payments, Mercenary. Their v0 contract docs are
kept for historical reference under `docs/archive/v0-api/domains/`, not indexed here.

## Canonical sources for the frozen SM New reference (auth/onboarding, terms, games/tournament-ops)

- Frozen reference checklist: `docs/reference/sm-new-api-v1-contract-checklist.md`
- State machines: `docs/reference/sm-new-state-machines.md`
- Permissions: `docs/reference/sm-new-permission-matrix.md`
- DB design: `docs/reference/sm-new-db-v1-implementation-design.md`
- Scenario matrix: `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`
- Runtime evidence: `apps/v1_api/src/**` — the frozen reference checklist used `/api/v1/sm-new`
  while the implemented Nest app uses `/api/v1`; the implementation prefix wins for runtime and
  frontend hook work. Terms, OAuth callback, email login, and signup differ from the frozen
  checklist in places where the implementation has since diverged (superseded, not simply pending —
  see [Auth](./domains/auth.md#pending-from-frozen-contract)).

## Cross-cutting references

- [Authentication and session](./auth-and-session.md)
- [Errors and validation](./errors-and-validation.md)
- [Pagination, filtering, and sorting](./pagination-filtering-and-sorting.md)
- [Uploads and media](./uploads-and-media.md)
- [Realtime and notifications](./realtime-and-notifications.md)

## Maintenance

- API prefix: `/api/v1`
- Success envelope: `{status,data,timestamp}`
- Strict input validation: `whitelist + forbidNonWhitelisted + transform`
- A controller, DTO, service, error, permission, pagination, multipart, idempotency, or frontend contract change updates the matching canonical domain file in the same change.
- No canonical index may link to a superseded contract tree.

라운드별 부전승 직접 입력과 대진표 표시 위치 계약은 [Tournaments](./domains/tournaments.md#라운드별-부전승-직접-등록-2026-10-05)에 정리한다.

- 2026-10-05: tournament bye slots allow null registration + byeId reassignment; pre-start fixture deletion archives canonical history. See [tournament contract](domains/tournaments.md).
