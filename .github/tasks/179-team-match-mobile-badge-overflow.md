# Task 179 - Team Match Mobile Badge Overflow

Status: Implementation and local QA complete; merge/deploy pending
Target: frontend + docs
Branch: `fix/team-match-mobile-badge-overflow` -> `dev`

## Context

`/team-matches` cards place every state badge and the team identity in one non-wrapping flex row. A platform-managed, approved, completed match therefore clips `플랫폼 주관`, `승인 완료`, and `경기 종료` on mobile widths instead of preserving all three facts.

## Contract

- Keep every applicable semantic badge visible; do not abbreviate or hide state.
- Let the badge group wrap independently inside the card content column.
- Render team identity and record on a separate single-line, ellipsized row.
- Long team names, titles, dates, and venues must not create horizontal page or card overflow.
- Preserve tablet and desktop card density and the 96 px design-system thumbnail.

## Acceptance Criteria

- [x] `플랫폼 주관 + 승인 완료 + 경기 종료` remains readable at 320, 360, 390, and 430 px.
- [x] Open, pending, live, closed, league, and ordinary non-platform cards retain their existing labels.
- [x] The team identity is visually separate from the badge group and truncates without forcing card width.
- [x] `/matches` and tablet/desktop team-match layouts have no regression.
- [x] Focused component tests and TypeScript validation pass.
- [x] Responsive browser QA records screenshots, overflow metrics, console errors, and failed requests.
- [x] A web patch changeset is present.

## Progress Snapshot

- [x] Repository and frontend/UI/QA rules reviewed.
- [x] Alpha deployment commit and browser behavior inspected.
- [x] Root cause confirmed in `TeamMatchCard` and `.tm-team-match-row-id`.
- [x] Before screenshots captured at 320, 360, 390, 430, 768, and 1440 px.
- [x] Regression test added. Pre-implementation RED execution was blocked by missing Linux optional binaries; GREEN was recorded after repairing the isolated worktree dependencies.
- [x] Implementation complete.
- [x] Team-match component tests: 84 passed; personal-match regression tests: 53 passed.
- [x] Web TypeScript, v1 pattern checks, and production build passed.
- [x] Headed Chrome visual QA passed at 320, 360, 390, 430, 768, and 1440 px with no overflow, clipped badges, console errors, page errors, or failed requests.
- [x] Evidence: `output/playwright/visual-audit/task179-team-match-mobile-badges/after-report.json` and matching `after-*.png` screenshots.

## Ambiguity Log

- The three badges express separate facts and may legitimately coexist, so removing one is not an acceptable overflow fix.
- The existing 96 px thumbnail is retained unless post-change 320 px QA proves that it prevents a usable layout.
