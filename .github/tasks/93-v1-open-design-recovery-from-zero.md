# 93. V1 Open Design Recovery From Zero

Status: Completed
Owner: Codex
Scope: `apps/v1_web`, `docs/scenarios`, `docs/reference/open-design`

## Goal

Recover the v1 frontend from the user-provided Open Design export instead of inventing a new visual direction. This task supersedes stale visual assumptions from prior desktop/responsive work when they conflict with the pinned Open Design export.

## Source

- Execution notes: folded into this task and `docs/scenarios/13-v1-open-design-recovery-from-zero.md`.
- Pinned manifest: `docs/reference/open-design/teameet-desktop-20260604/manifest.md`
- Scenario matrix: `docs/scenarios/13-v1-open-design-recovery-from-zero.md`
- External export: `/Users/sungjun/Library/Application Support/Open Design/namespaces/release-stable/data/projects/dc57a253-6a77-4c01-b76b-6a4d1a9037d7`

## Current Baseline

- Open Design root HTML count: 109
- Current v1 route count: 87
- `verification-1-1-report.md` is absent from the current export root.

## Recovery Contract

- Open Design export is the visual parity target.
- Every current v1 route must have exactly one implementation family.
- Every Open Design root HTML file must be represented or classified.
- Every matrix row must include required page features, current v1 evidence, feature status, missing/weak features, implementation action, verification command, and evidence path.
- `implemented-well` requires source evidence and an executable verification command.
- Design-only and unsupported pages must not become fake runtime routes.

## Progress Snapshot

- [x] Task 1 source manifest and checksum evidence pinned.
- [x] Task 2 route/export feature implementation audit matrix completed.
- [x] Task 3 static/live Open Design parity harness completed.
- [x] Task 4 shared shell/primitives aligned to Open Design.
- [x] Route-family implementation waves completed.
- [x] Full browser parity and feature audit matrix completed.

## Final Result

- This Open Design Recovery From Zero supersedes stale visual assumptions from the prior desktop rebuild plan and prior Task 84/88 route-map assumptions when they conflict with the pinned Open Design export.
- Current Open Design root HTML inventory remains 109.
- Current v1 route inventory remains 87.
- Feature implementation audit rows: 166, with no final `blocked-unverified` rows.
- Full browser parity evidence: `evidence/task-11-full-parity.json` with 348 route/viewport captures and zero live failures.
- Final feature audit evidence: `evidence/task-11-feature-audit.json`.
- Latest regression note: Next 16 dynamic `params` handling for `/matches/[id]/edit` and `/team-matches/[id]/edit` was fixed after the full matrix pass and verified in `evidence/task-11-dynamic-edit-parity.json` plus `evidence/task-11-dynamic-params-browser.GREEN.txt`.

## Recheck 2026-06-05

- Trigger: user reopened the work because remaining work and verification depth were not trustworthy enough.
- Canonical decision: the prior desktop rebuild plan remains stale/superseded by this task; it was not re-executed as the active plan.
- Fixed verification gaps:
  - `scripts/qa/v1-open-design-desktop-visual.mjs` now treats `/search` routes as mobile standalone search flows instead of falsely requiring bottom nav.
  - Open Design QA auth now normalizes the current v1 `dev-login` response shape (`data.session.userId/userEmail`) through `scripts/qa/v1-open-design-auth.mjs`.
  - `scripts/qa/v1-open-design-parity-browser.mjs` now verifies protected routes with `auth/me` preflight before capture.
  - `scripts/qa/v1-open-design-parity.mjs` now uses the default recovery matrix for `--assert-feature-audit-contract` and fails when any live capture is not `PASS`.
- Recheck evidence:
  - Full live parity: `evidence/open-design-recheck-20260605/full-parity.json`, summarized by `evidence/open-design-recheck-20260605/full-parity-live-gate.txt` as 348 captures, 348 live PASS, 0 failures.
  - Core browser audit after fixes: `evidence/open-design-recheck-20260605/browser-core.after-auth.txt`, screenshots in `output/playwright/visual-audit/open-design-recheck-20260605-core-after-auth/`.
  - Mobile/function-map QA: `evidence/open-design-recheck-20260605/mobile-first.txt`, `evidence/open-design-recheck-20260605/function-map.txt`.
  - Final tests/build: `evidence/open-design-recheck-20260605/v1-web-test.final.txt`, `evidence/open-design-recheck-20260605/v1-web-build.final.txt`.
- Desktop fluid follow-up:
  - User feedback: desktop still felt fixed-width and not fitted to desktop.
  - Root cause: `.tm-app-frame` was capped at 1440px and `/home` content was capped to the remaining 1140px range on 1680/1920 monitors.
  - Fix evidence: `evidence/desktop-fluid-20260605/desktop-fluid.RED.txt`, `evidence/desktop-fluid-20260605/desktop-fluid-final.GREEN.txt`, and screenshots in `output/playwright/visual-audit/desktop-fluid-20260605-final/`.
  - Final metrics: `evidence/desktop-fluid-20260605/desktop-fluid-metrics.GREEN.json` records 1920 viewport with app width 1920 and home layout width 1590.
- Full visual QA follow-up:
  - User feedback: overall visual QA still did not look fully executed.
  - Harness scope: `scripts/qa/v1-open-design-desktop-visual.mjs` now supports recovery-matrix route discovery and route manifests; desktop expectations are route-aware so detail/wizard/search/auth pages are not false-failed against core app chrome.
  - Protected route preflight was broadened through `scripts/qa/v1-open-design-parity-lib.mjs` so `matches`, `team-matches`, `teams`, `my`, `chat`, `notifications`, `reviews`, and `admin` protected surfaces are authenticated before capture.
  - Broad live visual sweep: `evidence/ulw-full-visual-qa-20260605/full-parity.json` and `evidence/ulw-full-visual-qa-20260605/full-parity-live-gate.txt` cover 87 current v1 routes across `375x812`, `390x844`, `1280x900`, `1440x900`, `1680x1000`, and `1920x1080`: 522 live captures, 522 PASS, 0 FAIL/BLOCKED/MISSING.
  - Wide desktop fluid sweep: `output/playwright/visual-audit/ulw-full-visual-qa-20260605-wide/desktop-summary.json` and `evidence/ulw-full-visual-qa-20260605/wide-desktop-fluid.txt` cover 87 routes across `1280x900`, `1440x900`, `1680x1000`, and `1920x1080`: 348 results, 0 failures.
  - Static reference gap: `evidence/ulw-full-visual-qa-20260605/full-parity-static-reference-gaps.txt` records 12 static-reference gaps caused by the pinned external export missing `notifications.html`; live v1 route captures for the same routes still passed.

## Evidence

- Task 1 acceptance: `evidence/task-1-acceptance.GREEN.txt`
- Task 1 manual QA: `evidence/task-1-terminal-manual-qa.txt`
- Task 1 adversarial QA: `evidence/task-1-adversarial-qa.md`
- Task 2 RED: `evidence/task-2-route-matrix.RED.txt`
- Task 2 route/export matrix: `evidence/task-2-route-matrix.GREEN.txt`
- Task 2 feature implementation audit: `evidence/task-2-feature-audit.GREEN.txt`
- Task 3 parity harness: `evidence/task-3-parity.GREEN.txt`
- Task 4 shared shell/primitives: `evidence/task-4-shared.GREEN.txt`, `evidence/task-4-css.GREEN.txt`
- Task 5 public/auth/discovery parity: `evidence/task-5-live-contract.GREEN.txt`
- Task 6 personal match parity: `evidence/task-6-live-contract.GREEN.txt`
- Task 7 team match parity: `evidence/task-7-live-contract.GREEN.txt`
- Task 8 teams/account/reviews parity: `evidence/task-8-live-contract.GREEN.txt`
- Task 9 community/admin parity: `evidence/task-9-live-contract.GREEN.txt`
- Task 10 final classification and function-map: `evidence/task-10-feature-audit-final.GREEN.txt`, `evidence/task-10-function-map/function-map.json`
- Task 11 web unit suite: `evidence/task-11-v1-web-test.GREEN.txt`
- Task 11 web build: `evidence/task-11-v1-web-build.GREEN.txt`
- Task 11 full Open Design parity: `evidence/task-11-full-parity.json`
- Task 11 feature audit contract: `evidence/task-11-feature-audit.json`
- Task 11 screenshots: `output/playwright/visual-audit/task-11-open-design-full/`
- Task 11 cleanup: `evidence/task-11-cleanup.txt`, `evidence/task-11-cleanup-port.txt`
- 2026-06-05 full visual QA route matrix: `evidence/ulw-full-visual-qa-20260605/route-matrix.txt`, `evidence/ulw-full-visual-qa-20260605/feature-audit.json`, `evidence/ulw-full-visual-qa-20260605/route-manifest.json`
- 2026-06-05 full live visual QA: `evidence/ulw-full-visual-qa-20260605/full-parity.json`, `evidence/ulw-full-visual-qa-20260605/full-parity-live-gate.txt`, `output/playwright/visual-audit/ulw-full-visual-qa-20260605/live/`
- 2026-06-05 wide desktop visual QA: `evidence/ulw-full-visual-qa-20260605/wide-desktop-fluid.txt`, `output/playwright/visual-audit/ulw-full-visual-qa-20260605-wide/desktop-summary.json`, `output/playwright/visual-audit/ulw-full-visual-qa-20260605-wide/screenshots/`
- 2026-06-05 static reference gaps: `evidence/ulw-full-visual-qa-20260605/full-parity-static-reference-gaps.txt`

## Focused Follow-up: `/home` Desktop Remake

- Date: 2026-06-05
- Execution notes: folded into this focused follow-up section.
- Scope: current v1 `/home` only; no backend/API changes and no unsupported Open Design runtime routes.
- Result: `/home` now uses the Open Design `home.html` desktop structure through current v1 React/view-model data: blue hero, sport chips, recommended match grid, team-match summary, desktop right rail, honest network retry, signed-out copy, and v1-only route links.
- Component evidence:
  - RED: `evidence/v1-home-open-design-desktop-remake/task-1-home-contract.RED.txt`
  - GREEN: `evidence/v1-home-open-design-desktop-remake/task-1-home-contract.GREEN.txt`
  - Runtime/mobile GREEN: `evidence/v1-home-open-design-desktop-remake/task-2-runtime-mobile.GREEN.txt`
- Browser evidence:
  - Summary: `output/playwright/visual-audit/v1-home-open-design-desktop-remake/desktop-summary.json`
  - Screenshots: `output/playwright/visual-audit/v1-home-open-design-desktop-remake/screenshots/`
- Final checks:
  - `evidence/v1-home-open-design-desktop-remake/v1-web-test.GREEN.txt`
  - `evidence/v1-home-open-design-desktop-remake/v1-web-build.GREEN.txt`

## Handoff

- Resume cursor: this task plus `docs/scenarios/13-v1-open-design-recovery-from-zero.md`.
- Next execution option: implement only explicitly approved design-only backlog rows after adding v1 route/API contracts first; do not create fake routes for unsupported Open Design pages.
