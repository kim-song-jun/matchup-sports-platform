# 98. V1 Intermediate Responsive Breakpoint QA

Status: Superseded by `98-v1-intermediate-viewport-qa.md`
Owner: Codex
Scope: `apps/v1_web`

## Goal

Fix the intermediate tablet/desktop breakpoint regressions reported on `/matches`, then verify the same contract on:

- `/matches`
- `/team-matches`
- `/teams`
- `/my/matches/created`

Required viewport widths:

- `768`
- `900`
- `1023`
- `1024`
- `1180`
- `1280`
- `1440`
- `1920`

## Acceptance Criteria

- [x] At `768`, `900`, and `1023`, app routes may keep mobile chrome, but desktop-only filter rails must not render as inline content above the page title.
- [x] At `1024` and above, desktop chrome must be consistent: desktop nav visible, bottom nav hidden, FAB hidden.
- [x] At `1024` and `1180`, list pages must not show a cramped desktop filter rail plus unusably narrow content.
- [x] At `1280`, `1440`, and `1920`, the existing wide desktop fluid layout remains intact.
- [x] `/my/matches/created` remains a desktop-safe workbench without bottom nav on authenticated route widths.
- [x] No horizontal overflow or clipped primary route actions in the requested viewport matrix.

## Current Hypotheses

- The CSS breakpoint split is the likely fault: shell desktop chrome starts at `1024px`, while the rich list workbench starts at `1181px`.
- The list filter rail is rendered in DOM for all widths and only changes grid placement. Below desktop, it should be hidden or converted into the existing filter button/sheet path, not stacked above the title.
- Existing QA covered `768`, `1024`, `1280`, `1440`, and wide desktop, but not the `900`, `1023`, and `1180` transition widths.

## Validation Log

- 2026-06-06: RED confirmed with `node --test scripts/qa/v1-intermediate-responsive-contract.test.mjs`.
  - Missing viewport widths: `900`, `1023`, `1180`, `1920`.
  - Missing explicit `768-1023` mobile-linear card stack rule.
  - Missing explicit `1024-1180` narrow-desktop card column rule.
- 2026-06-06: Focused contracts passed:
  - `node --test scripts/qa/v1-intermediate-responsive-contract.test.mjs scripts/qa/v1-responsive-matrix-lib.test.mjs scripts/qa/v1-open-design-desktop-visual.test.mjs scripts/qa/v1-desktop-adaptive-responsive.test.mjs scripts/qa/v1-desktop-fluid-contract.test.mjs scripts/qa/v1-desktop-shell-responsive.test.mjs`
  - `node scripts/qa/v1-open-design-shared-css-contract.test.mjs`
- 2026-06-06: Browser runtime QA passed for 4 routes x 8 widths = 32 results / 0 failures.
  - Evidence: `evidence/task-98-intermediate-responsive/runtime-metrics.json`
  - Screenshots: `output/playwright/visual-audit/task-98-intermediate-responsive/final/`
  - Final measured columns:
    - `768`, `900`, `1023`: list routes `1` column, no rail, mobile chrome.
    - `1024`, `1180`: `/matches` and `/teams` `2` columns, `/team-matches` `1` column, no rail, desktop chrome.
    - `1280+`: large desktop rail restored; fluid columns continue through `1920`.
- 2026-06-06: `corepack pnpm --filter v1_web test` passed (`16` files / `33` tests).
- 2026-06-06: `corepack pnpm --filter v1_web build` passed (`77` static pages).
- 2026-06-06: `git diff --check` passed.

## Progress Snapshot

- Current step: superseded by `98-v1-intermediate-viewport-qa.md`, which includes the later function/accessibility non-OK fixes and final evidence under `evidence/desktop-fluid-qa-20260606/`.
