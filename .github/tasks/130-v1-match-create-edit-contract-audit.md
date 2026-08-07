# Task 130 — V1 match create/edit contract audit

## Scope

- Backend: `apps/v1_api/src/matches`, `apps/v1_api/src/team-matches`, creator profile guard
- Frontend: `apps/v1_web/src/components/matches`, `apps/v1_web/src/components/team-matches`
- Tests: focused backend/frontend contract tests and match E2E follow-up

## Goal

Verify personal-match and team-match creation/editing end to end, including creator
profile requirements, team permissions, master-data selection, payload mapping, image
upload persistence, and the absence of hard-coded production form values.

## Acceptance Criteria

- [x] Personal-match creation requires real name, phone, and gender.
- [x] Team-match creation additionally requires an active owner/manager membership.
- [x] Sport, district region, and host team IDs come from live API data.
- [x] Empty image selection persists as `null`; no mock image is silently submitted.
- [x] Uploaded images are included in create/update payloads and survive detail hydration.
- [x] Edit forms hydrate the requested entity without mock or seed fallback.
- [x] Create/update DTO fields match frontend payloads exactly.
- [x] Personal-match detail exposes separate edit and applicant-management actions.
- [x] Personal-match edit exposes every mutable create/update field.
- [x] Focused backend, frontend, and browser scenarios pass.

## Progress Snapshot

- 2026-08-03: Static audit found a hard-coded personal-match mock image submitted for
  empty create/edit image state, plus runtime labels falling back to fixed sport/team
  examples while live selection data was unavailable. Remediation and regression tests
  started on `audit/v1-match-create-edit-contracts`.
- 2026-08-03: Added payload tests for live sport/region/team IDs, create/edit hydration,
  and both empty/uploaded image states. Frontend focused tests pass (12/12).
  Added host-team sport equality validation because the team-match API previously
  allowed a single-sport team to publish a different-sport match. Backend Jest remains
  blocked in this worktree because the shared install cannot resolve `nestjs-pino` and
  the host Node 18 runtime is below the repository's required Node 22.
- 2026-08-04: Upgraded the local toolchain to Node 22, restored the frozen pnpm install,
  regenerated the v1 Prisma client, and rebuilt a clean local QA database/stack. Focused
  backend tests pass (24/24), focused frontend tests pass (12/12 before the follow-up,
  then 7/7 for the touched create clients), and v1 web typecheck passes.
- 2026-08-04: Browser QA found two additional wizard regressions. Draft persistence used
  a passive effect/state updater that could lose the last place/time input during route
  navigation, and the legacy sample cleanup erased legitimate `+7 days, 18:00-20:00`
  values field-by-field. Drafts now persist synchronously through a ref, while legacy
  cleanup only runs when the complete historical sample draft matches.
- 2026-08-04: Production-mode local QA E2E passes for personal matches (2/2), including
  live sport/region IDs, upload, create, detail image hydration, requested-entity edit,
  and update. Team-match create/detail/edit E2E also passes (1/1), including an authorized
  live host team ID and uploaded image persistence. The v1 discovery smoke remains green
  (2/2). Task acceptance criteria are complete.
- 2026-08-06: Follow-up application lifecycle audit covers personal/team-match apply,
  approve, reject, approved presentation, and withdraw. The audit found non-atomic
  resubmit/reject/withdraw transitions, team-match deadline enforcement gaps, false
  approved presentation for unrelated viewers after a team match became matched, and
  missing audit/notification side effects for automatically rejected opponent teams.

## Application Lifecycle Follow-up

- [x] Resubmit, reject, and withdraw transitions only update the status observed by the
  caller and return a conflict when another transition wins first.
- [x] Team-match application and approval reject actions after `deadlineAt`.
- [x] Only the actually approved applicant team sees `승인 완료`; unrelated viewers see
  that opponent selection is closed without receiving approved affordances.
- [x] Automatically rejected team-match applications receive individual status logs and
  manager notifications.
- [x] Focused backend/frontend regression tests and canonical API docs cover the repaired
  lifecycle.

- 2026-08-06: Follow-up remediation completed. Added persisted
  `v1_team_matches.deadline_at`, enforced it on team-match apply/approve, made resubmit,
  reject, and withdraw expected-status transitions, logged/notified every automatically
  rejected applicant team, and limited approved UI to the actual approved viewer. Focused
  verification: API service suites 42/42, web lifecycle suites 21/21, API/web typecheck
  green, and Prisma client generation green.
- 2026-08-07: Host detail now separates `매치 수정` from `신청자 관리`, and edit exposes
  sport, region, content, image, capacity, level/gender/rules, place/address, match time,
  and application deadline. Focused release verification passed before the dev push.
