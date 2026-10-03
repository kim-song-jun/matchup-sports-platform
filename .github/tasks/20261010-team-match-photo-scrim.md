# Task 20261010: Team-match list photo overlay

Status: Implementation verified locally — PR and exact-head CI pending
**Owner**: delegated bug-fix session
**Created**: 2026-10-03
**Issue**: https://github.com/kim-song-jun/matchup-sports-platform/issues/1577
**Branch**: fix/issue-1577-team-match-photo-scrim

## Context
Text-free list thumbnails and detail heroes share the same 58–72% dark gradient. The list image has no overlaid text; the detail hero has white text. Closed-card opacity/grayscale is a separate lifecycle contract.

## Goal
Improve text-free list photo identification while retaining hero readability and existing thumbnail dimensions/crop/fallback.

## Original Conditions (must all be satisfied)
- [x] Remove the dark gradient on text-free list photos (selected A).
- [x] Preserve no-photo sport graphics and detail hero text overlay in actual rendered-view regressions.
- [x] Preserve the existing 96px crop/radius CSS, local fallback, adjacent title/status/CTA and links; visual acceptance remains pending.
- [ ] Compare actual alpha before/after for the same fixture in all three widths.

## User Scenarios
- Existing alpha synthetic fixture, CSS mobile 405×606 → tablet 789×505 → desktop 1183×758.
- Read the existing list/detail/create/preview contract without changing actual data.
- Actual after validation waits for separately approved alpha deployment.

## Test Scenarios
- Narrow actual rendered-view regressions; preserve existing API/model values, fallback and route/link behavior.
- Run frontend lint/typecheck and required repository gates once before an explicit pathspec commit.
- Verify exact remote head CI; do not substitute jsdom for visual alpha acceptance.
- No API/DTO/schema/fixture data changes are planned.

## Parallel Work Breakdown
- Frontend: A/B/C comparison → explicit choice → minimal implementation → focused regression.
- Read-only helper agent investigated both issues; product file is shared, so implementation is serial.
- Owned: `apps/v1_web/src/components/team-matches/team-matches-page.tsx`, issue-specific tests, this task, issue-specific Changeset.
- Forbidden: API/DB/contracts, shared global CSS, other session files, other unmerged PR code and protected QA data.

## Acceptance Criteria
- [x] A/B/C comparison delivered in the standalone HTML; user explicitly selected A before product implementation.
- [x] Issue-specific focused rendered-view regression passes.
- [x] Lint/typecheck, six aggregate gates, scoped diff and Changeset policy pass.
- [ ] Ready for review PR has base dev, Refs #1577, actual before images and exact-head CI.
- [ ] Actual alpha after at the same fixture/width/conditions is recorded after approved deployment; issue remains open until original conditions pass.

## Tech Debt Resolved
The shared background helper now distinguishes text-free list photos from white-text detail heroes. No new dependency or API contract is introduced.

## Security Notes
No original private conversation/attachments, credentials, account identities or real-data changes. Preserve QA179 roster and completed QA results. No merge, deployment or paid review request.

## Risks & Dependencies
- Current baseline is exact dev `c25687b2c9d9a39acb0ec5da29e527906ef082fe`.
- Open PR check found only release PR #1576 (base main); it is not touched.
- Visual before is the existing public fixed SHA `22775cdf98f175dad3a5b40c0fba1ab46b0190e6` under `docs/qa/2026-10-03-team-photo-cost/`.
- All 14 Git blobs/bytes and manifest 13 SHA256 hashes match; six actual PNGs were visually reviewed and dimensions verified by root.
- Crop pixels are not full-page QA; DOM and screenshot timestamps differ. Serving SHA, browser persona and cost allocation mode are unconfirmed.
- After screenshots, console/network, full flow and real device verification remain pending.

## Ambiguity Log
- A (recommended): remove gradient only on text-free list photos; smallest change, more variation in photo brightness.
- B: use a weaker list gradient; tonal consistency but needs a new intensity choice and can obscure photos.
- C: use existing sport graphics instead of uploaded photos; consistent presentation but loses photo identification and expands scope.
- User selected A for #1577 and C for #1578 after inspecting the HTML. The #1578 changes stay in their own worktree/PR.

## Progress Snapshot
- 2026-10-03: fetched origin/dev immediately before independent worktree creation; no unrelated tree edits.
- Existing source/DTO/parser/save-path reviewed. The list passes `false` to the shared background helper; the detail hero keeps its default text overlay. No CSS dimensions, crop, closed-card opacity/grayscale, sport graphic or route behavior changed.
- Private standalone A/B/C HTML and its rendered preview were saved in the user's Library. Six actual alpha PNGs were embedded byte-identically; design examples were separately identified as examples, not alpha after evidence. User then selected A + C.
- RED: actual list-image regressions failed 3/3 (remote, uploaded and local fallback photos) with the original gradient; 3 other image checks passed, 121 tests intentionally excluded.
- GREEN: `vitest run src/components/team-matches/team-matches-page.test.tsx src/components/team-matches/team-matches-wave4.test.tsx --maxWorkers=1 --minWorkers=1`: 2 files, 133 tests passed on 2026-10-03.
- `pnpm --filter v1_web lint`: typecheck and v1 pattern checks passed. Six required QA gates and patch Changeset policy passed. An initial production-security invocation used incompatible arguments and stopped before validation; the corrected invocation passed.
- Actual alpha after, console/network, full-page/focus/scroll and three-width visual acceptance wait for separately approved deployment. No real-data write or local Next server was used.
