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

- [ ] Personal-match creation requires real name, phone, and gender.
- [ ] Team-match creation additionally requires an active owner/manager membership.
- [ ] Sport, district region, and host team IDs come from live API data.
- [ ] Empty image selection persists as `null`; no mock image is silently submitted.
- [ ] Uploaded images are included in create/update payloads and survive detail hydration.
- [ ] Edit forms hydrate the requested entity without mock or seed fallback.
- [ ] Create/update DTO fields match frontend payloads exactly.
- [ ] Focused backend, frontend, and browser scenarios pass.

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
