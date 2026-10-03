# Task 20261012: Tournament prize caption contrast

Status: Review — local verification passed, PR/CI and actual alpha after pending
**Owner**: delegated bug-fix session
**Created**: 2026-10-03
**Issue**: https://github.com/kim-song-jun/matchup-sports-platform/issues/1579
**Branch**: fix/issue-1579-prize-caption-contrast

## Context
The 12px/700 상품 및 상금 caption uses --text-muted (#6b7684) on --orange50 (#fff3e0). Actual alpha observations at CSS405/789/1183 resolve to 4.208740854651445:1, below the unrounded normal-text 4.5:1 minimum. Prize body/rank badges are excluded from the defect.

## Goal
Change only the caption token to --grey700 while preserving every surrounding style, prize value, award rule and global token.

## Original Conditions (must all be satisfied)
- [x] Caption-only --grey700 change, calculated light contrast 6.484924628224474:1.
- [x] Body/background/rank badges/global tokens unchanged.
- [x] Actual view/token contrast regressions, lint/typecheck and required gates pass.
- [ ] Ready for review PR with base dev, Refs #1579 and exact-head CI.
- [ ] Actual alpha after recorded at the same fixture/three widths after separately approved deployment; issue stays open until original acceptance passes.

## User Scenarios
Read the completed synthetic tournament 932beb19-bc91-4446-86d8-9f69f5e4eae1 caption at CSS405×606 → 789×505 → 1183×758. Existing public evidence is read-only; completed results and QA179 roster must remain unchanged.

## Test Scenarios
- Render the actual exported TournamentDetailView for open/completed prize-bearing states and absent/blank prize states.
- Resolve the real caption inline token and card background against current globals.css declarations, then calculate light contrast; preserve body/badge/background contracts.
- Check that the selected token resolves to the same prior caption foreground in dark mode; do not claim actual dark AA from jsdom/source calculations.
- Narrow RED→GREEN, related existing rendering tests, one lint/typecheck and required aggregate gates. CI owns full suites/builds.

## Parallel Work Breakdown
- Root owns product, focused test, this task and issue-specific patch Changeset.
- Independent agent reviews the immutable committed diff read-only; no independent execution/commit or real-data write.
- Forbidden: other PR/worktree files, APIs/DTO/schema, global CSS, body/background/badges, real data/results/permissions.

## Acceptance Criteria
- [x] Parent explicitly authorized the one-line caption correction. CLAUDE.md's UI rule explicitly exempts one-line color-token substitution; no new A/B/C choice is needed.
- [x] Focused actual-render/token regressions and lint/gates pass.
- [ ] Explicit four-path commit and committed diff scope verified.
- [ ] Ready/dev PR includes actual public before, calculated-source after distinction, CI/review results and residual alpha scope.
- [ ] Actual post-deployment alpha visual/console/network verdict and same-condition after evidence recorded.

## Tech Debt Resolved
None beyond the selected caption's insufficient light contrast. No broader palette or tm-on-tint replacement.

## Security Notes
No credentials, private original attachments or conversations. No actual result/prize/roster/permission write. No merge, deployment or paid review retry.

## Risks & Dependencies
- Fresh origin/dev base 06d72a01eb63cfcb958a1521cfe562cce3997d73. Only unrelated release #1576 and #1577/#1578 PRs were open; none overlap this caption.
- Before source SHA07477376d9efadc38883c28509bc648b9200aebc under docs/qa/2026-10-03-prize-caption-contrast/. Root verified 12/12 Git blobs/bytes, manifest11/11 SHA256, PNG3/3 hashes/dimensions and actual pixels.
- Screenshot UTC2026-10-03: 08:21:56.284–.313, 08:24:28.218–.274, 08:28:46.644–.715. DPR1.25/1.5/1. DOM observations were separate moments; serving SHA/persona remain unconfirmed.
- The proposed light contrast is a CSS calculation, not an alpha after. Dark/other-state alpha, actual devices, full page/focus/scroll, console/network remain unverified.

## Ambiguity Log
- --grey700 and the original --text-muted both resolve to #9aa4b2 in dark mode. Actual dark compositing/AA is not established by this one-line change.
- A Card-wide tm-on-tint change would also recolor the badge and is outside scope.

## Progress Snapshot
- 2026-10-03: parent authorized implementation after read-only investigation. Refetched origin/dev immediately before creating independent worktree.
- One worker/serial validation planned. Host load15.98/12 cores, swap5245.88MB/6144MB, Node226/browser19; explicit user request to run validations honored without terminating others.
- RED: the new actual view file had 2 failures (open/completed prize caption still used --text-muted) and 3 PASS absent/blank-prize controls.
- GREEN: new prize-caption5 + existing detail-CTA25 + existing global-style88 = 118/118 PASS across3 files, one worker. The existing CTA file emitted an act warning; its25 tests passed. This warning was not a browser/alpha verdict or part of the new caption test.
- Lint/typecheck/v1 pattern checks, required six QA gates and patch Changeset policy PASS. The rendered caption's actual token was independently resolved against source CSS: #4e5968 on unchanged #fff3e0 =6.484924628224474, compared with original4.208740854651445. Both figures are CSS calculations; actual alpha after remains unobserved.
- Product diff is exactly one token substitution. No other surface/style/token or data modification and no local Next/browser process was started.
