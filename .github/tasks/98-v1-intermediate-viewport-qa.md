# V1 Intermediate Viewport Visual and Functional QA

Status: Completed / QA Passed

Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/desktop-fluid-qa-20260606`, `output/playwright/visual-audit/desktop-fluid-qa-20260606`

## Problem

Intermediate browser widths can show a mixed surface: mobile bottom navigation and FAB remain visible while persistent desktop filter rails are stacked above the page title, and tablet framing can read like a fixed-width canvas. The reported screenshot is from an ambiguous desktop/tablet width on `/matches`.

## Acceptance Criteria

- [x] At `768`, `900`, and `1023` widths, `/matches`, `/team-matches`, and `/teams` use mobile/tablet chrome consistently: bottom nav/FAB may be visible, but persistent desktop filter rails must be hidden and replaced by the list filter button/sheet.
- [x] At `1024`, `1180`, `1280`, `1440`, and `1920` widths, `/matches`, `/team-matches`, and `/teams` use desktop chrome consistently: sidebar visible, bottom nav/FAB hidden, no horizontal overflow, no fixed narrow canvas.
- [x] `/my/matches/created` remains usable at `900`, `1023`, `1024`, and `1280` without chrome conflict or horizontal overflow.
- [x] `/matches` search, filter, sport selection, create, card apply, and card detail controls produce observable URL or DOM changes at ambiguous widths.
- [x] Five independent xhigh reviewers reported NON-OK findings, and each blocking class was fixed then revalidated with browser evidence: visual/layout breakpoints, regression coverage, function card actions, filter overlay bounds, and accessibility dialog/focus/touch targets. Final reviewer gate is all OK.

## Evidence Plan

- RED:
  - `evidence/desktop-fluid-qa-20260606/red-intermediate-viewport-contract.txt`
  - `evidence/desktop-fluid-qa-20260606/intermediate-viewport-red.json`
- GREEN:
  - `evidence/desktop-fluid-qa-20260606/green-intermediate-viewport-contract.txt`
  - `evidence/desktop-fluid-qa-20260606/green-task98-node-suite.txt`
  - `evidence/desktop-fluid-qa-20260606/intermediate-viewport-qa.json`
  - `evidence/desktop-fluid-qa-20260606/intermediate-auth-my-qa.json`
  - `evidence/desktop-fluid-qa-20260606/intermediate-interactions.json`
  - `evidence/desktop-fluid-qa-20260606/intermediate-accessibility-qa.json`
  - `evidence/desktop-fluid-qa-20260606/green-intermediate-accessibility.txt`
  - `evidence/desktop-fluid-qa-20260606/green-v1-web-test-task98.txt`
  - `evidence/desktop-fluid-qa-20260606/green-v1-web-build-task98.txt`
  - `evidence/desktop-fluid-qa-20260606/green-diff-check-task98.txt`

## Progress Snapshot

- 2026-06-06: Task opened from user-provided ambiguous intermediate-width screenshot. Five read-only reviewers dispatched for visual, layout, function, accessibility, and regression coverage.
- 2026-06-06: RED captured for tablet frame cap and missing explicit intermediate contracts. Browser RED captured fixed-looking `768/900/1023` app frame widths and missing `1024/1180` desktop behavior.
- 2026-06-06: Fixed intermediate breakpoints: tablet app frames now use `100vw`, `768-1023` list cards are single-column with visible actions, `1024-1180` uses desktop chrome with constrained columns/no rail, and `1181+` restores desktop rails.
- 2026-06-06: Fixed accessibility reviewer findings by making filter sheets modal dialogs with focus containment, inert background chrome/content, non-tab scrims, and 44px minimum primary targets.
- 2026-06-06: Fixed final reviewer follow-ups: tablet card action hit-targets no longer sit under bottom nav/FAB, filter overlays cover the viewport bottom, and filter sheets move initial focus into the dialog on mount.
- 2026-06-06: Final evidence passed: node contract suite `27/27`, browser intermediate matrix PASS, accessibility browser PASS with recorded role/aria/initial focus/focus wrap/outside focusable values, `corepack pnpm --filter v1_web test` `16 files / 33 tests`, `corepack pnpm --filter v1_web build`, `git diff --check`, and all five final reviewers OK.
