# Task 20261011: Team-match cost perspective labels

Status: Implementation verified locally — PR and exact-head CI pending
**Owner**: delegated bug-fix session
**Created**: 2026-10-03
**Issue**: https://github.com/kim-song-jun/matchup-sports-platform/issues/1578
**Branch**: fix/issue-1578-team-match-cost-labels

## Context
Current UI always labels the second parsed cost amount as 상대팀 부담금. V1 stores only costNote; there is no shareMode or equal-allocation contract. A total exactly twice the second amount does not establish equal sharing.

## Goal
Make the payer perspective clear while preserving known amounts, free invitation, differential allocation, null/unknown and league behavior.

## Original Conditions (must all be satisfied)
- [x] Confirm costNote first/second amount semantics and avoid inferring equal allocation from numbers.
- [x] Retain free-invitation 0, differential known costs, null, total-only and league semantics in focused regressions.
- [x] Selected C keeps 상대팀 부담금 and adds 신청하는 팀의 비용이에요 in detail/input/preview; list screen-reader text uses the same meaning without expanding the visible price row.
- [ ] Verify approved mode fixtures after deployment; current alpha fixture mode remains unconfirmed.

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
- [x] A/B/C standalone HTML delivered; user explicitly selected C before product implementation.
- [x] Issue-specific focused rendered-view regression passes.
- [x] Lint/typecheck, six aggregate gates, scoped diff and Changeset policy pass.
- [ ] Ready for review PR has base dev, Refs #1578, actual before images and exact-head CI.
- [ ] Actual alpha after at the same fixture/width/conditions is recorded after approved deployment; issue remains open until original conditions pass.

## Tech Debt Resolved
Applicant-cost explanation is defined once and reused by the existing views. No new API field, shareMode or inferred allocation is introduced.

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
- A (recommended): 신청팀 부담금; makes applicant cost clear, does not express equal allocation.
- B: 초청팀 부담금; host perspective, needs applicant interpretation.
- C: preserve 상대팀 부담금 and add applicant-cost explanation; longer text and additional wrapping checks.
- Existing 0/0 create serialization produces costNote:null; a label-only change cannot claim free/null round-trip distinction. API/save-contract change is out of scope.
- User selected A for #1577 and C for #1578 after inspecting the HTML. Existing label and amounts are preserved; uniform 각 팀 wording is not authorized by the current contract.

## Progress Snapshot
- 2026-10-03: fetched origin/dev immediately before independent worktree creation; no unrelated tree edits.
- Existing source/DTO/parser/save-path reviewed against the current issue. Only shared view copy changes; #1577's unmerged photo helper is not imported into this branch.
- Private standalone review HTML and rendered preview saved in the user's Library; user selected A + C. Actual alpha before and design examples remain explicitly distinguished.
- RED: new actual mapper/view/input/preview regressions failed 11/15 because the explanation was absent; unknown/league controls passed 4/15.
- GREEN: four relevant files passed 176/176 tests with one worker: cost explanation (15), actual page (124), create client (15), validation/payload (22).
- Initial lint caught two new test assignments dropping detail-only fields from their TypeScript return shape. Tests now preserve the detail fields while applying the actual mapper. The changed 15-test file passed again, and corrected lint/typecheck/v1 pattern checks passed. Six QA gates and patch Changeset policy passed.
- Mapper→detail/list cases cover 50,000/25,000, differential 50,000/10,000, 50,000/0 invitation, null and total-only. Actual condition/edit controls retain sequential edits and Back/cancel callback; preview and actual payload retain the original costNote and no shareMode. Existing 0/0 serialization caveat remains out of scope.
- Actual alpha after, three-width wrapping, keyboard/scroll/fixed CTA, console/network, mode confirmation and full save/payment verification wait for separately approved deployment. No actual data write or local Next server.
