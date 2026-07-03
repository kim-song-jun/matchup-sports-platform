# Task 100 - V1 Tournament Registration Multi-Team

## Problem

A user can operate multiple teams, while tournament registrations are uniquely scoped by `tournamentId + teamId`.

The previous apply and "my registration" flows treated the user as having one active tournament registration. That made multi-team registration fragile: a completed registration for team A could hide or overwrite the user's ability to start/manage a registration for team B.

## Updated Direction

Promote the old in-form team selection step into a tournament registration management hub:

- `/tournaments/:tournamentId/my` shows every team the user belongs to for this tournament.
- Each team row shows whether that team is not registered, draft, awaiting payment, confirmed, cancelled, or otherwise active.
- Owner/manager teams without a registration can start a new registration.
- Owner/manager teams with a draft can continue editing.
- Teams with an existing registration can open the registration detail; management actions stay owner/manager-only.
- `/tournaments/:tournamentId/apply?team=:teamId` opens the apply form for that team directly, without showing the in-form team selection step.

## Acceptance Criteria

- [x] Registration uniqueness is `tournamentId + teamId`, not `tournamentId + userId`.
- [x] Applying with a different selected team no longer reuses another team's `registrationId`.
- [x] Existing single-registration endpoint remains backward compatible.
- [x] "My registration" shows a team-by-team management hub even when there is only one registration.
- [x] The hub includes managed teams with no registration and lets the user start a registration for each eligible team.
- [x] Starting from a hub team opens the apply form with that team preselected and without showing the in-form team selection step.
- [x] Team members can see existing registrations for teams they belong to, while apply/manage mutations remain owner/manager-only.
- [x] After completing a registration, the user can return to the hub and manage/add registrations for other teams.

## Progress Snapshot

- Added `GET /api/v1/tournaments/:tournamentId/registrations/my-registrations`.
- Updated v1 web query hooks and cache invalidation for the team-scoped list contract.
- Updated tournament apply/detail/my-registration pages to avoid reusing another team's `registrationId`.
- Synced `docs/api/v1/domains/tournaments.md`.
- Converted `/tournaments/:tournamentId/my` into the team registration hub and added `/apply?team=...` preselection.
- Added DB migration and API P2002 guard for stale unique indexes that block a second team registration with 409.
- Split registration visibility from management permission: active team members can view existing registration and roster status; owner/manager roles are still required for applying, submitting, cancelling, and roster edits.
