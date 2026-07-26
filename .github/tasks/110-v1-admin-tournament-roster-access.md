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
- `apps/v1_api/prisma/migrations/20260714005000_v1_tournament_player_gender_snapshot/migration.sql` (renumbered from `20260714000000` during the main→dev integration merge — dev already had `20260714000000_v1_tournament_geo_integration_settings` at that timestamp)
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
- [x] If the registered team owner is in the roster, the admin response and modal place that player first and mark them as 팀장.
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
- Follow-up: the admin roster response derives isTeamCaptain from the team's canonical ownerUserId; the owner is sorted first while non-owner order remains stable, and the modal renders a 팀장 badge.
- Validation: API unit 38 suites / 501 tests, Web unit 25 files / 93 tests, API/Web production builds, Web lint/pattern check, Prisma validate, DB guardrail, QA policy contract, and `git diff --check` passed.
- 2026-07-15 validation: focused API 32/32 and Web 4/4 tests passed; API TypeScript and Web lint/pattern checks passed. Authenticated Playwright QA passed on mobile 390x844, tablet 768x1024, and desktop 1440x900 with the team captain first, one `팀장` badge, no overflow, and zero console/page/network errors. Evidence: `output/playwright/visual-audit/admin-roster-captain-2026-07-15T00-03-36-505Z/`.

## Ambiguity log

- Gender is a roster-time snapshot, not a live profile join, so later profile edits do not rewrite an already submitted roster.
- Admin read access includes support because existing admin roster CSV read access already uses the active-admin gate; mutations remain owner/ops only.
