# 99. V1 Full Responsive Visual and Functional QA

Status: Passed
Owner: Codex
Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/task99-full-responsive-qa-20260606`, `output/playwright/visual-audit/task99-full-responsive-qa-20260606`

## Prompt Contract

The user has repeatedly rejected partial visual QA as insufficient. The accumulated request is:

- Rebuild and verify the v1 desktop experience against the pinned Open Design direction and the Teameet design source.
- Do not treat a fixed-width desktop canvas as acceptable; desktop should expand naturally from mobile to tablet to desktop.
- Specifically inspect ambiguous widths where mobile and desktop chrome mix, such as `768`, `900`, `1023`, `1024`, and `1180`.
- Check route-by-route visuals and actual functions, not only static screenshots.
- Use parallel review agents and continue the loop whenever any reviewer reports non-OK.
- The final UI should feel modern and Toss-like: clean hierarchy, restrained chrome, obvious actions, no cramped mobile controls on desktop, and no incoherent overlap.

## Acceptance Criteria

- [x] Current route matrix is revalidated and every implemented v1 route is in scope.
- [x] A full browser QA script covers every implemented route across `390`, `768`, `900`, `1023`, `1024`, `1180`, `1280`, `1440`, and `1920` widths.
- [x] The script fails on horizontal overflow, text clipping, desktop/mobile chrome mixing, fixed/narrow app frames, broken/dead links, obstructed visible controls, and route-family filter/search regressions.
- [x] Browser evidence includes JSON metrics and screenshots under the Task 99 evidence/output paths.
- [x] If any visual or functional finding is non-OK, RED evidence is recorded before the fix and GREEN evidence after the fix.
- [x] `v1_web` tests and build pass after any source changes.
- [x] Five independent reviewers return OK before completion.

## QA Scenarios

1. Prompt contract and manifest proof:
   - Command: `node scripts/qa/v1-open-design-route-matrix.test.mjs --assert-all-routes --expected-route-count 87`
   - Evidence: `evidence/task99-full-responsive-qa-20260606/route-matrix.txt`

2. Full responsive visual/function browser matrix:
   - Command: `node scripts/qa/v1-full-responsive-visual-functional.mjs --matrix docs/scenarios/13-v1-open-design-recovery-from-zero.md --viewports 390x844,768x1024,900x1024,1023x1024,1024x900,1180x900,1280x900,1440x960,1920x1080 --out output/playwright/visual-audit/task99-full-responsive-qa-20260606/full --json evidence/task99-full-responsive-qa-20260606/full-responsive.json`
   - Evidence: `evidence/task99-full-responsive-qa-20260606/final-full-responsive.RECHECK.json`
   - Executive report: `evidence/task99-full-responsive-qa-20260606/final-full-responsive-summary.RECHECK.json`
   - Deep report and index: `evidence/task99-full-responsive-qa-20260606/README.md`, `evidence/task99-full-responsive-qa-20260606/final-evidence-index.RECHECK.txt`
   - Family evidence:
     - `evidence/task99-full-responsive-qa-20260606/full-responsive-community-admin-utility.GREEN.json`
     - `evidence/task99-full-responsive-qa-20260606/full-responsive-personal-match.GREEN.json`
     - `evidence/task99-full-responsive-qa-20260606/full-responsive-public-auth-discovery.GREEN.json`
     - `evidence/task99-full-responsive-qa-20260606/full-responsive-team-match.GREEN.json`
     - `evidence/task99-full-responsive-qa-20260606/full-responsive-teams-account-reviews.GREEN.json`

3. Functional and route honesty regression:
   - Commands: `node --test scripts/qa/v1-full-responsive-visual-functional.test.mjs scripts/qa/v1-route-walkthrough.test.mjs` and existing `v1_web` test/build gates.
   - Evidence: `evidence/task99-full-responsive-qa-20260606/final-contract-tests.RECHECK.txt`, `final-v1-web-test.RECHECK.txt`, `final-v1-web-build.RECHECK.txt`

## Progress Snapshot

- 2026-06-06: Task opened from renewed ULW request. Existing Task 95-98 evidence is useful but too fragmented for the user's latest request because no single contract forces all implemented routes through mobile, tablet, intermediate, desktop, and wide desktop widths with both visual and function checks.
- 2026-06-06: RED browser evidence recorded. Initial family sweeps found fixed/narrow `480px` app frames at `768/900/1023` and desktop mobile-CTA/chrome findings across `public-auth-discovery`, `personal-match`, `team-match`, `teams-account-reviews`, and `community-admin-utility`. RED JSONs are preserved as `evidence/task99-full-responsive-qa-20260606/full-responsive-*.RED.json`.
- 2026-06-06: Fixed the shared `AppChrome` contract so every v1 shell emits `tm-app-frame-wide`, allowing the existing tablet/desktop CSS to expand from mobile to tablet to desktop instead of keeping a fixed phone canvas. Locked with `apps/v1_web/src/components/v1-ui/shell.open-design.test.tsx`.
- 2026-06-06: GREEN family reruns passed: `community-admin-utility` 6 routes / 54 results, `personal-match` 15 / 135, `public-auth-discovery` 28 / 252, `team-match` 14 / 126, `teams-account-reviews` 24 / 216. Aggregate `full-responsive.GREEN.json` records 87 routes / 783 viewport results / 0 failures.
- 2026-06-06: Verification passed: route matrix proof, `node --test scripts/qa/v1-full-responsive-visual-functional.test.mjs scripts/qa/v1-route-walkthrough.test.mjs` (14 tests), `corepack pnpm --filter v1_web test` (16 files / 34 tests), `corepack pnpm --filter v1_web build`, and `git diff --check`.
- 2026-06-06: Five-reviewer gate PASS. Goal/constraint, code quality, security/honesty, context/docs, and hands-on QA reviewers returned PASS. Hands-on reviewer reran `/home`, `/chat/[id]`, and `/teams/search` for 3 routes / 27 viewport results / 0 failures in `evidence/task99-full-responsive-qa-20260606/review-hands-on-2.json`.
