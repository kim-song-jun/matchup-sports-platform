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

### 2026-10-02 — Uploaded image brightness continuation

Scope: frontend presentation only; API/image storage unchanged. Branch `fix/team-match-image-brightness`
from latest fetched `origin/dev` (`be228ba1b`). Existing chat commit `9bdf16848` remains on its own branch.
Owned: team-matches-page.tsx/test, globals.css (19-line scoped addition), headed component QA runner,
changeset, this task, scenario evidence and referenced screenshots. Shared-root WIP untouched.

- [x] Root cause: list and detail shared a 58–72% full-image dark gradient.
- [x] Preserve original photo brightness in both surfaces and preserve local CSS image fallback.
- [x] Scope contrast to detail team summary/buttons; photo-less sport illustrations remain unchanged.
- [x] RED: both actual list/detail image-render regressions failed on the full-image gradient.
- [x] GREEN: page component suite 124/124. Before/after headed component QA 12/12 across 390/768/1440.
- [x] No console/page/network errors or horizontal overflow; detail summary/button computed contrast backgrounds verified.
- [x] Final Web typecheck 0 diagnostics, scoped diff/debt checks PASS; local commit scope verified.
- [ ] Alpha/live create-to-detail verification and deployment (not performed in this local change).

Evidence: `output/playwright/visual-audit/team-match-image-brightness/{before,after}/` plus
`report-before.json` and `report-after.json`. These render the real v1 components/CSS using explicit
presentation fixtures, with Next routing/image adapters; they are not real API/create-flow evidence.
Only screenshot links used by docs are promoted into `docs/screenshots/team-match-image-brightness/`.
Browser/runner PIDs are recorded in each report; owned Vite servers and Chrome instances are closed.

Reproduction from repository root (each phase runs separately to avoid Tailwind's process cache):
`QA_PHASE=before QA_BASE_REF=be228ba1b node scripts/qa/capture-team-match-image-brightness.mjs`, then
`QA_PHASE=after QA_BASE_REF=be228ba1b node scripts/qa/capture-team-match-image-brightness.mjs`.

Mobile detail: [before](../../../docs/screenshots/team-match-image-brightness/mobile-detail-before.png),
[after](../../../docs/screenshots/team-match-image-brightness/mobile-detail-after.png).
Mobile list: [before](../../../docs/screenshots/team-match-image-brightness/mobile-list-before.png),
[after](../../../docs/screenshots/team-match-image-brightness/mobile-list-after.png).

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
