# 107 V1 Tournament Schedule Range

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/v1/domains/tournaments.md`

## Request

Tournament schedules can span two days. Admin users need to choose a start and end datetime, and public/admin surfaces should display the range when an end datetime exists.

## Acceptance Criteria

- Admin create/edit accepts optional tournament end datetime.
- Backend persists `scheduledEndAt` without breaking existing `scheduledAt` behavior.
- Backend rejects an end datetime earlier than the start datetime.
- Public tournament list/detail/home/sidebar/my-registration surfaces display a schedule range when present.
- Existing single-day/single-start tournaments continue to show the current single-date label.

## Progress Snapshot

- 2026-07-07: Started implementation from current v1 tournament `scheduledAt` contract.
- 2026-07-07: Added nullable `scheduledEndAt`, admin create/edit inputs, public/admin range display, API docs, and focused backend tests. Validation: `pnpm v1:db:generate`, tournament unit specs, full `v1_api` unit suite, and `pnpm --filter v1_web lint` passed. `pnpm --filter v1_web build` is blocked in this local runtime because Node 18.19.1 is below Next's required >=20.9.0.
