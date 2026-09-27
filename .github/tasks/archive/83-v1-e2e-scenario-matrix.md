# Task 83 -- V1 SM New E2E Scenario Matrix

Owner: codex
Status: Drafted
Priority: P0
Target: both
Mode: ANSWER

## Purpose

Extract the full E2E scenario set for SM New v1 from:

- `Team Design > 1차 디자인 완료`
- `docs/reference/sm-new-screen-action-inventory.md`
- `docs/reference/sm-new-api-v1-contract-checklist.md`
- `docs/reference/sm-new-db-v1-implementation-design.md`

The output is not test implementation yet. It is the canonical scenario matrix
that later Playwright specs should follow.

## Output

- Scenario matrix: `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`

## Coverage

- [x] 17 design sections mapped to E2E scenario groups.
- [x] Auth/onboarding flows mapped to API and DB evidence.
- [x] Home/search/notice flows mapped.
- [x] Personal match browse/create/apply/manage flows mapped.
- [x] Team browse/join/member-management flows mapped.
- [x] Team match browse/create/apply/manage flows mapped.
- [x] Chat/notification flows mapped.
- [x] My/profile/settings/admin flows mapped.
- [x] Payment/support deferred honesty scenarios mapped.
- [x] Desktop/common state atlas scenarios mapped.

## Progress Snapshot

- [x] Read v1 task plan and confirmed v1-only direction.
- [x] Read design section inventory and API/DB source documents.
- [x] Created `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`.
- [ ] Convert matrix into Playwright spec files after v1 routes/hooks exist.
- [ ] Add v1 Playwright config/runtime helpers after implementation reaches contract layer.

## Acceptance Criteria

- Every `SM_FIRST_DESIGN_COMPLETE_SECTIONS` entry has at least one E2E group.
- Every stateful domain has happy path, permission, duplicate/stale, and persistence checks.
- Deferred v1 domains have explicit no-fake-success scenarios.
- Scenario IDs are stable enough to reference from future Playwright tests and reports.

## Ambiguity Log

- Actual v1 route paths may shift as `apps/v1_web` moves from placeholder routes to bound screens.
- Temporary development auth headers may be replaced by real auth before E2E automation starts.
- Payment/support UI final copy still needs design binding review, but E2E must enforce no real/fake transaction success in v1.
