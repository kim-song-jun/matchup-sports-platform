# Task 110 — V1 admin tournament roster access and gender snapshot

## Scope

- Target: backend + frontend + DB + docs
- Runtime: `apps/v1_api`, `apps/v1_web`
- Admin route: `/admin/tournaments/:id`

## Problem

- The admin roster modal calls the team-member roster endpoint, so an active admin who is not a member of the registered team receives `403 PERMISSION_DENIED`.
- `V1TournamentPlayer` snapshots name and birth date but not gender, even though tournament operations and the privacy contract require gender in the submitted roster.
- The modal does not distinguish a failed roster request from an actually empty roster.

## Owned files

- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/prisma/migrations/20260714000000_v1_tournament_player_gender_snapshot/migration.sql`
- `apps/v1_api/src/tournaments/tournament-players.controller.ts`
- `apps/v1_api/src/tournaments/tournament-players.service.ts`
- `apps/v1_api/src/tournaments/tournament-players.service.spec.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
- `apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-client.tsx`
- related frontend tests and v1 API/scenario docs

## Acceptance criteria

- [x] Active owner, ops, and support admins can read any tournament registration roster through a dedicated admin endpoint.
- [x] Non-admin users cannot read the admin roster endpoint.
- [x] The existing team-member roster endpoint keeps its current team membership gate.
- [x] New roster players snapshot profile gender without making missing gender a registration blocker.
- [x] Existing roster rows are backfilled from the current user profile when gender is available.
- [x] Admin roster UI renders gender as `남성`, `여성`, or `미등록`.
- [x] Admin roster UI shows request failures separately from an empty roster and offers retry.
- [x] Admin CSV export contains the gender snapshot.
- [x] Backend/frontend contracts, tests, and docs are synchronized.

## DB impact

- Add nullable `v1_tournament_players.gender_snapshot`.
- Backfill `male`/`female` values from `v1_user_profiles.gender` by `user_id`.
- No existing row is rejected when profile gender is missing.

## Progress snapshot

- Current: implementation and code-level validation complete.
- Follow-up: the admin roster response and modal now include the player's current phone after the active-admin gate; the team-member roster contract remains unchanged.
- Validation: API unit 38 suites / 501 tests, Web unit 25 files / 93 tests, API/Web production builds, Web lint/pattern check, Prisma validate, DB guardrail, QA policy contract, and `git diff --check` passed.
- Runtime follow-up: the local authenticated v1 admin runtime was not running, so browser screenshot/console/network verification remains to be executed after the migration is applied to a QA database.

## Ambiguity log

- Gender is a roster-time snapshot, not a live profile join, so later profile edits do not rewrite an already submitted roster.
- Admin read access includes support because existing admin roster CSV read access already uses the active-admin gate; mutations remain owner/ops only.
