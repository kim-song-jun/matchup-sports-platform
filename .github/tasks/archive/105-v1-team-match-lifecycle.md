# Task 105 — V1 Team Match Lifecycle Closure

Status: Implemented
Scope: `apps/v1_api`, `apps/v1_web`, `docs/api/v1`, `docs/scenarios`

## Goal

Close the v1 team match operational lifecycle so teams can apply, withdraw, receive host decisions, close recruiting, cancel, and complete matches with durable status transitions and notifications.

## Acceptance Criteria

- Team match recruiting can be closed and reopened by host team owner/manager.
- Requested applications can be withdrawn by applicant team owner/manager.
- Apply, withdraw, approve, reject, close, cancel, and complete actions emit team-match notifications to the affected team owner/manager recipients.
- Approval remains single-winner and moves the team match to `matched`.
- Closing recruiting prevents new applications and marks pending applications `expired`.
- Completing a matched team match records `completedAt` and unlocks review surfaces.
- Frontend CTA copy and actions match backend states.

## Progress Snapshot

- 2026-07-01: Started from current v1 implementation. Existing apply/withdraw/approve/reject/cancel APIs exist, but `closed` is not a persisted team match state, withdraw lacks host notification, and complete/close/reopen APIs are missing.
- 2026-07-01: Added `closed` team-match status, close/reopen/complete APIs, host detail actions, admin status options, notification events, focused unit tests, and docs/scenario updates.
