# 96. V1 Desktop Family QA Loop

Status: Completed
Owner: Codex
Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/desktop-family-qa-20260606`, `output/playwright/visual-audit/desktop-family-qa-20260606`

## Goal

Re-audit and improve the desktop experience for every current v1 route in the match, team-match, team, and my page families. The end state must be proven by route-by-route browser evidence, not by aggregate claims.

## User Feedback

- Desktop pages in match, team-match, team, and my still do not feel desktop-optimized.
- The work must inspect every page one by one.
- Use an agent-all style loop with QA.

## Source Of Truth

- Project rules: `AGENTS.md`, `.codex/AGENTS.md`, `.codex/frontend-rules.md`, `.codex/design-rules.md`
- Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design reference: `docs/reference/open-design/**`
- Route matrix: `docs/scenarios/13-v1-open-design-recovery-from-zero.md`
- Runtime target: `apps/v1_web`

## Target Routes

- `matches`: 15 route rows from `personal-match`.
- `team-matches`: 14 route rows from `team-match`.
- `teams/my`: 26 route rows from `teams-account-reviews`, including the overlapping `/my/matches/*` routes.
- Combined unique current target routes: 53.

## Acceptance Criteria

- [x] Fresh 2026-06-06 route-by-route browser evidence exists for all 53 unique target routes at desktop-first viewports.
- [x] Each route row records visual checks, functional checks, screenshots, action log, and pass/fail findings.
- [x] Desktop checks include no phone-frame feel, no horizontal overflow, no mobile bottom nav leakage, constrained readable content lanes, and actionable desktop CTA placement.
- [x] Every blocking production UI finding is fixed with RED -> GREEN evidence before production changes.
- [x] Focused frontend tests and build/type verification pass after fixes.
- [x] Reviewer/QA gate confirms match, team-match, team, and my desktop surfaces are not merely mobile layouts stretched into desktop.

## Progress Snapshot

- [x] Current route matrix restored.
- [x] Target family route counts identified.
- [x] Fresh route walkthrough captured.
- [x] Blocking findings triaged.
- [x] Fixes implemented.
- [x] Final route/browser verification completed.
- [x] Reviewer gate completed.

## 2026-06-06 Evidence

- RED component/contracts:
  - `evidence/desktop-family-qa-20260606/red-desktop-family-action-lanes.txt`
  - `evidence/desktop-family-qa-20260606/red-desktop-family-components.txt`
  - `evidence/desktop-family-qa-20260606/red2-match-action-lanes.txt`
  - `evidence/desktop-family-qa-20260606/red2-matches-components.txt`
- GREEN component/contracts:
  - `evidence/desktop-family-qa-20260606/green-desktop-family-action-lanes.txt`
  - `evidence/desktop-family-qa-20260606/green-desktop-family-components.txt`
  - `evidence/desktop-family-qa-20260606/focused-node-tests-final.txt`
- Browser route walkthrough:
  - `evidence/desktop-family-qa-20260606/affected-after-fix.json`: 27 affected routes, 81 viewport captures, 0 findings.
  - `evidence/desktop-family-qa-20260606/full-after-fix-matches.json`: 15 match-family route rows, 45 viewport captures, 0 findings.
  - `evidence/desktop-family-qa-20260606/full-after-fix-team-matches.json`: 14 team-match route rows, 42 viewport captures, 0 findings.
  - `evidence/desktop-family-qa-20260606/full-after-fix-teams-my.json`: 26 team/my route rows, 78 viewport captures, 0 findings.
  - `evidence/desktop-family-qa-20260606/final-family-all-v3.json`: 53 unique target routes, 159 viewport captures, 0 route findings, 0 viewport findings, 0 horizontal overflow, 0 desktop bottom-nav leakage, 0 desktop-nav missing after review fixes.
  - `evidence/desktop-family-qa-20260606/fresh-review-smoke-20260606.json`: 12 representative desktop route captures at `1440x900`, 0 failures, 0 route findings, 0 horizontal overflow, 0 desktop bottom-nav leakage.
  - `evidence/desktop-family-qa-20260606/fresh-hands-on-final-smoke-20260606.json`: 6 representative desktop route captures at `1440x900`, 0 failures, 0 route findings, 0 failed function checks.
- Screenshots:
  - `output/playwright/visual-audit/desktop-family-qa-20260606/affected-after-fix/`
  - `output/playwright/visual-audit/desktop-family-qa-20260606/full-after-fix/`
  - `output/playwright/visual-audit/desktop-family-qa-20260606/final-family-all-v3/`
  - `output/playwright/visual-audit/desktop-family-qa-20260606/contact-sheets/final-family-all-v3-1440.png`
- Verification:
  - `evidence/desktop-family-qa-20260606/green-review-avatar-safe-url.txt`: review avatar remote URL rejection regression passed.
  - `evidence/desktop-family-qa-20260606/green-v1-web-test.txt`: `v1_web` Vitest 16 files / 33 tests passed.
  - `evidence/desktop-family-qa-20260606/green-v1-web-build.txt`: `v1_web` Next build passed.
  - `git diff --check`: passed.
- Reviewer synthesis:
  - `evidence/desktop-family-qa-20260606/review-synthesis.md`: PASS with residual risks limited to dark-mode and full keyboard/focus certification being outside this desktop-family route-fit gate.

## Implemented Fix Summary

- Team-match detail, filter, create, and complete action bars now opt into desktop constrained static action lanes.
- Match filter, create, and complete action bars now opt into desktop constrained static action lanes.
- Joined personal match state now opts into a desktop workbench grid.
- Team detail and filter action bars now opt into desktop constrained static action lanes.
- Team search/state and team members pages now opt into desktop workbench lanes.
- My matches, my teams, and my team members pages now opt into desktop workbench lanes with summary/grid behavior.
- Profile, location, withdrawal, and review compose action bars now opt into desktop constrained static action lanes.
- Review avatars now reject remote CSS background URLs and fall back to initials unless the source is a local public asset path.
- Notification settings no longer inherits the withdrawal route class/test id.
