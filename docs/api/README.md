# Teameet v1 API contracts

This directory is the single indexed contract tree for `apps/v1_api` and `apps/v1_web`. Swagger is reference material; the controller, DTO, service gates, integration tests, frontend hooks/types, and these canonical contracts must agree.

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
- [Games](./domains/games.md)
- [Team schedules](./domains/team-schedules.md)
- [Tournament operations](./domains/tournament-operations.md)
- [Tournament operations authorization](./domains/tournament-operations-auth.md)
- [Tournament operations escalations](./domains/tournament-operations-escalations.md)
- [Game realtime](./domains/game-realtime.md)
- [Game migration and cutover](./domains/game-migration.md)
- [Public records](./domains/public-records.md)
- [Venues](./domains/venues.md)
- [Lessons](./domains/lessons.md)
- [Marketplace](./domains/marketplace.md)
- [Payments](./domains/payments.md)
- [Mercenary](./domains/mercenary.md)
- [Chat](./domains/chat.md)
- [Notifications](./domains/notifications.md)
- [Admin and operations](./domains/admin-and-ops.md)
- [Supporting domains](./domains/supporting-domains.md)

Each domain appears exactly once in this index. The superseded versioned tree is retained only for migration traceability and is not canonical or indexed here.

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
