# Task 132 — V1 team-match full edit and image contract

## Scope

- Backend: `apps/v1_api/src/team-matches`, `apps/v1_api/prisma`
- Frontend: `apps/v1_web/src/components/team-matches`
- Contract docs: `docs/api/domains/team-matches.md`, `docs/scenarios/03-match-flows.md`

## Goal

Expose every mutable team-match creation field on edit and prove that uploaded or
removed cover images persist through PATCH and render on list/detail surfaces.

## Acceptance Criteria

- [x] Edit shows host team/sport context and every mutable match, condition,
  place/time, deadline, and image field.
- [x] Place name and detailed address hydrate and persist independently.
- [x] `deadlineAt` persists in the v1 team-match database contract.
- [x] Existing, uploaded, and removed image states map to PATCH and detail honestly.
- [x] Focused backend/frontend tests pass.

## Progress Snapshot

- 2026-08-07: Audit found edit only rendered basic/condition fields. Region,
  place/time, deadline, and live labels were absent. The active service work already
  maps `deadlineAt`, but Prisma schema/migration evidence is absent. Image storage,
  list, and detail mapping exist; edit regression coverage is incomplete.
- 2026-08-07: Full edit UI implemented. Host team/sport are visible and explicitly
  immutable per service contract; all other DTO-backed fields are editable. Place
  and address now round-trip independently. Added the missing deadline migration.
  Prisma generation passed, focused backend passed (30/30), and focused frontend
  passed (12/12 aggregate, final changed-page rerun 3/3). Image coverage proves
  upload payload, retained edit image, removal to `null`, list rendering, and detail
  hero rendering. Headed browser visual QA remains an operator follow-up.
