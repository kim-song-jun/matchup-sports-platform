# 88. V1 Responsive Shell Hardening

Status: Completed / Evidence Recorded
Owner: Codex
Scope: `apps/v1_web`

## Goal

Make the v1 frontend responsive across mobile viewport widths without changing the existing visual design.

This task is a responsive stability pass, not a redesign. Colors, typography, card language, button styling, route IA, labels, and overall visual impression must remain unchanged.

## Decisions

- [x] Execution plan:
  - Execution notes are folded into this task document.
  - This is the responsive execution record for continuing Task 88.
  - The existing mobile UI remains canonical; this task is natural responsive hardening, not redesign.
- [x] Baseline screens:
  - `/home`
  - `/search`
  - `/matches`
  - `/team-matches`
  - `/teams`
  - `/my`
  - `/chat`
  - `/notifications`
  - `/notices`
- [x] Full viewport matrix:
  - `320`
  - `360`
  - `375`
  - `390`
  - `412`
  - `430`
  - `480`
- [x] Tablet / desktop validation matrix:
  - `768`
  - `1024`
  - `1280`
  - `1440`
- [x] Fast diagnostic viewport matrix:
  - `320`
  - `390`
  - `430`
- [x] Design preservation principle:
  - Preserve existing design and visual impression.
  - Preserve the `375px appearance` as the baseline visual contract.
  - Only adjust responsive behavior, shell sizing, safe-area handling, wrapping, and layout tokens where needed.
  - Wider breakpoints may use selected adaptive layout only when it improves readability; do not make every page full-width.
- [x] Canonical shell direction:
  - Use v1 as the canonical shell direction.
  - Do not declare `tm-*` as the future canonical naming system.
  - Existing `AppChrome` may be evolved into the v1 canonical shell because most v1 screens already use it.
  - Existing `tm-*` classes are treated as a compatibility layer during migration, not as the long-term naming target.

## Failure Thresholds

A route fails responsive QA if any of these are observed at a required viewport:

- Horizontal overflow on the document or primary app frame.
- Clipped text inside a button, chip, card, row, or fixed chrome in a way that hides the intended label.
- CTA overlap with bottom nav, safe-area, toast, filter sheet, keyboard/input bar, or other fixed chrome.
- Hidden primary CTA or unreachable navigation/back control.
- Unsafe fixed chrome positioning, including chat input, notification toast, fixed CTA, filter sheet, topbar, or bottom nav outside the viewport.
- Broken route navigation caused by a responsive-only layout state.

## Responsive Route Matrix

| Group | Routes | Priority |
| --- | --- | --- |
| Main tabs | `/home`, `/matches`, `/team-matches`, `/teams`, `/my` | Step 4 completed; rerun as regression matrix |
| Utility | `/search`, `/chat`, `/chat/[id]`, `/notifications`, `/notices`, `/notices/[id]` | Step 5 |
| Detail / create / edit / filter | `/matches/[id]`, `/team-matches/[id]`, `/teams/[id]`, `/matches/new/*`, `/team-matches/new/*`, `/teams/new`, `/matches/filter`, `/team-matches/filter`, `/teams/filter` | Step 6 |
| Account / review | `/my/settings/*`, `/my/profile/edit`, `/my/reviews`, `/my/reviews/[sourceType]/[sourceId]`, `/my/reviews/received` | Step 6 follow-up |
| Desktop adaptive checks | Core list/detail/form pages at `768`, `1024`, `1280`, `1440` | After mobile matrix passes |

## Non-Goals

- Do not redesign the UI.
- Do not change colors, typography scale, component radius, shadows, labels, or content hierarchy unless required to prevent breakage.
- Do not rewrite all `tm-*` classes in one broad rename.
- Do not change backend/API behavior.
- Do not alter v1 mock/data contracts unless a rendering bug proves the data shape is wrong.

## Current Findings

- [x] Shell width is inconsistent:
  - `AppChrome`/`tm-*` uses a `375px` frame.
  - `AppShell`/`v1-*` uses a `480px` frame.
- [x] `/search` bypasses both shells and defines an inline `375px` app frame.
- [x] Many pages use fixed `20px` side padding, which leaves only `280px` of content width at a `320px` viewport.
- [x] `/home` quick actions use a fixed four-column grid.
- [x] List summary/footer rows rely on one-line `space-between` layouts that can compress at narrow widths.
- [x] Fixed CTA, filter sheets, and toast surfaces need safe-area-aware bottom spacing.
- [x] `/chat` has special risks around fixed input bar, keyboard/safe-area, and swipe actions.
- [x] `/notifications` and `/notices` mostly risk fixed bottom overlap rather than broad layout failure.

## Implementation Plan

- [x] 1. Add v1 shell/layout tokens while preserving current values.
  - Planned files:
    - `apps/v1_web/src/app/globals.css`
    - `apps/v1_web/src/components/v1-ui/shell.tsx`
  - Expected behavior:
    - Existing visual result remains the same around `375px`.
    - Width, padding, topbar, bottom nav, CTA, and safe-area dimensions become token-driven.

- [x] 2. Evolve `AppChrome` toward the v1 canonical shell.
  - Planned files:
    - `apps/v1_web/src/components/v1-ui/shell.tsx`
    - `apps/v1_web/src/app/globals.css`
  - Expected behavior:
    - Existing pages keep the same visual appearance.
    - Shell becomes responsive across `320-480px`.
    - Legacy `tm-*` class usage remains as compatibility where needed.

- [x] 3. Bring `/search` under the same v1 shell sizing rules.
  - Planned files:
    - `apps/v1_web/src/components/search/search-experience.tsx`
    - `apps/v1_web/src/app/globals.css`
  - Expected behavior:
    - Search still looks like the current search page.
    - Search no longer owns a separate inline `375px` app frame.

- [x] 4. Fix main-tab responsive pressure points.
  - Routes:
    - `/home`
    - `/matches`
    - `/team-matches`
    - `/teams`
    - `/my`
  - Expected behavior:
    - No horizontal overflow.
    - Home quick actions and list summary rows adapt at `320px`.
    - Cards, chips, and CTA rows preserve the current design language.

- [x] 5. Fix utility responsive pressure points.
  - Routes:
    - `/search`
    - `/chat`
    - `/notifications`
    - `/notices`
  - Expected behavior:
    - Chat input bar is safe-area-aware.
    - Notification toast and fixed elements do not overlap bottom UI.
    - Search chips/cards do not compress poorly at `320px`.

- [x] 6. Second pass for detail/create/edit/filter routes.
  - Routes:
    - `/matches/[id]`
    - `/team-matches/[id]`
    - `/teams/[id]`
    - `/matches/new/*`
    - `/team-matches/new/*`
    - `/teams/new`
    - `/matches/filter`
    - `/team-matches/filter`
    - `/teams/filter`

- [x] 7. Validate.
  - Fast diagnostic:
    - `320`
    - `390`
    - `430`
  - Full matrix:
    - `320`
    - `360`
    - `375`
    - `390`
    - `412`
    - `430`
    - `480`

- [x] 8. Restart affected server.
  - Restart `v1_web`.
  - Confirm `http://localhost:3013` responds.

## Change Log

Record every change in this section before or immediately after editing.

### 2026-05-30

- Created task document for v1 responsive shell hardening.
- No frontend runtime code changed yet in this task.

### 2026-06-02

- Step 1 complete: added `--v1-shell-*` layout tokens for frame width, topbar height, bottom-nav height, page padding, CTA bottom padding, and safe-area bottom inset.
- Connected `tm-*` compatibility shell, fixed CTA/filter surfaces, and `v1-*` shell dimensions to the new tokens without changing baseline values.
- Updated `AppChrome` scroll-area bottom padding to consume `--v1-shell-scroll-bottom-pad`.
- Step 2 complete: added `--v1-app-chrome-frame-width` and moved `AppChrome` frame, fixed CTA, and filter overlay surfaces to a 480px max frame while preserving the 375px baseline and leaving auth/design reference frames unchanged.
- Step 3 complete: replaced `/search` inline `375px` frame, topbar height, horizontal content padding, and error toast bottom spacing with the v1 shell tokens.
- Step 4 complete: added narrow-viewport wrapping for main-tab quick actions, match/team summary rows, card footer rows, and my-page card actions without changing the default design state.

### 2026-06-04

- Locked follow-up execution against this task document.
- Added tablet/desktop validation matrix: `768`, `1024`, `1280`, `1440`.
- Added explicit failure thresholds for overflow, clipped text, CTA overlap, unsafe fixed chrome, hidden primary CTA, and responsive-only broken navigation.
- Added responsive route matrix for remaining Step 5/Step 6 work and desktop adaptive checks.
- Step 5 complete: `/search`, `/notices`, `/chat/[id]`, and `/notifications` responsive pressure points were hardened with class-based frame/search CSS and safe-area-aware chat/toast chrome.
- Step 6 complete: match/team-match/team detail, create, filter, team member, account settings, and review responsive pressure points were checked and fixed within this task scope.
- Step 7 complete: responsive validation evidence was recorded for mobile widths and selected desktop routes, including `task-8-chat-input`, `task-9-list-desktop-grid`, and `task-9-mobile-regression`.
- Step 8 complete: `corepack pnpm --filter v1_web dev:e2e` was started and stopped for browser QA rounds; cleanup receipts confirm port `3013` is clear after each run.

## Backup / Rollback Map

Use this section to identify exactly what can be reverted if a step changes the design unexpectedly.

| Step | Files | Rollback Strategy |
| --- | --- | --- |
| Documentation setup | `.github/tasks/88-v1-responsive-shell-hardening.md` | Revert this task doc only if the work is abandoned. |
| Shell tokens | `apps/v1_web/src/app/globals.css`, `apps/v1_web/src/components/v1-ui/shell.tsx` | Revert CSS token block and class references from the same commit/diff chunk. |
| `AppChrome` shell update | `apps/v1_web/src/app/globals.css` | Revert `--v1-app-chrome-frame-width` and `.tm-app-frame` / `.tm-fixed-cta` / filter layer width references together. |
| Search shell alignment | `apps/v1_web/src/components/search/search-experience.tsx` | Revert search inline token references to the prior fixed values. |
| Page-specific fixes | `apps/v1_web/src/app/globals.css` | Revert the `@media (max-width: 360px)` main-tab wrapping rules and related `min-width: 0` safeguards. |
| Chat/notification safe-area | `apps/v1_web/src/app/globals.css` | Revert `.tm-chat-room`, `.tm-chat-inputbar`, `.tm-chat-bubble*`, and `.tm-notification-toast` safe-area/max-width changes together. |
| Desktop adaptive opt-in | `apps/v1_web/src/components/v1-ui/shell.tsx`, `apps/v1_web/src/components/matches/matches-page.tsx`, `apps/v1_web/src/components/team-matches/team-matches-page.tsx`, `apps/v1_web/src/components/teams/teams-page.tsx`, `apps/v1_web/src/app/globals.css` | Remove `AppChrome wide` opt-ins and the `.tm-app-frame-wide` media rules. Mobile compact layout remains the fallback. |

## Validation Log

Record commands, route checks, and viewport observations here.

- 2026-06-02: `pnpm --filter v1_web exec tsc --noEmit` passed after Steps 1-4.
- 2026-06-04: `node --test scripts/qa/v1-responsive-matrix-lib.test.mjs scripts/qa/v1-responsive-css-contract.test.mjs scripts/qa/v1-search-notice-responsive.test.mjs scripts/qa/v1-home-responsive.test.mjs scripts/qa/v1-match-flow-responsive.test.mjs scripts/qa/v1-team-my-responsive.test.mjs scripts/qa/v1-chat-notification-responsive.test.mjs scripts/qa/v1-desktop-adaptive-responsive.test.mjs` passed. Evidence: `evidence/task-9-desktop-adaptive.GREEN.txt`.
- 2026-06-04: `git diff --check` passed. Evidence: `evidence/task-9-diff-check.txt`.
- 2026-06-04: Browser QA via `corepack pnpm --filter v1_web dev:e2e` against `http://localhost:3013` passed. Evidence:
  - `evidence/task-8-chat-input.json`
  - `evidence/task-8-notification-toast.json`
  - `evidence/task-9-list-desktop-grid.json`
  - `evidence/task-9-mobile-regression.json`
  - `evidence/task-9-detail-desktop.json`
  - `output/playwright/visual-audit/v1-responsive-task-8/`
  - `output/playwright/visual-audit/v1-responsive-task-9/`
- 2026-06-04: Cleanup receipts:
  - `evidence/task-8-cleanup-port.txt`
  - `evidence/task-9-cleanup-port.txt`

## Progress Snapshot

- Current step: Steps 5, 6, 7, and 8 complete with evidence.
- Next step: final plan verification and scenario/documentation handoff.

## Ambiguity Log

- Whether to fully rename legacy `tm-*` classes is intentionally unresolved.
  - Current decision: do not broad rename. Keep compatibility while introducing v1 shell direction.
