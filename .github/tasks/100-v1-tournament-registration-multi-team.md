# Task 100 — V1 Tournament Registration Multi-Team Resume

## Problem

A user can operate multiple teams, while tournament registrations are uniquely scoped by `tournamentId + teamId`. The apply and "내 신청" flows treated a user's registration as a single record, so changing from team A draft to team B could leave the UI selected team and persisted `registrationId` out of sync.

## Acceptance Criteria

- [x] "내 신청 보기" uses a team-scoped registration list.
- [x] One registration preserves the existing direct detail behavior.
- [x] Two or more registrations show a team-by-team list first.
- [x] Applying with a different selected team no longer reuses another team's `registrationId`.
- [x] Existing single-registration endpoint remains backward compatible.

## Progress Snapshot

- Added `GET /api/v1/tournaments/:tournamentId/registrations/my-registrations`.
- Updated v1 web query hooks and cache invalidation for the new list contract.
- Updated tournament apply, detail CTA, and my-registration page to use team-scoped list state.
- Synced `docs/api/v1/domains/tournaments.md`.
