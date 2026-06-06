# V1 Desktop Fluid Width and Functional QA

Status: QA Passed

Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/desktop-fluid-qa-20260606`, `output/playwright/visual-audit/desktop-fluid-qa-20260606`

## Problem

The previous desktop family QA removed several mobile fixed CTA leaks, but the main desktop shell still behaves like a fixed-width canvas. At wide desktop sizes such as `1920x1080`, the app frame remains capped around `1440px`, list content remains effectively fixed around a 3-column/900px card area, and the route-level search/filter controls still read like mobile surfaces. The route QA also needs to prove real interaction behavior, not just static screenshots.

## Acceptance Criteria

- [x] At `1920x1080`, wide list routes use the available desktop width instead of leaving a fixed-width app canvas centered with large right/left gutters.
- [x] `/matches`, `/team-matches`, and `/teams` use desktop-grade search/filter/list composition: useful filter rail width, non-mobile sticky search behavior, and adaptive card columns instead of hard-coded 3-column grids.
- [x] List-card visible actions are honest interactions: `참가 신청` and `상세 보기` are independently focusable/navigable controls, not inert text inside a single card link.
- [x] Browser QA verifies representative search, filter, sport selection, create CTA, card action, and detail route behavior with observable URL or DOM changes.
- [x] Final QA includes `1440x900`, `1680x1000`, and `1920x1080` captures for match/team-match/team/my target routes, plus focused interaction smoke.

## Evidence Plan

- RED:
  - `evidence/desktop-fluid-qa-20260606/red-fluid-contract.txt`
  - `evidence/desktop-fluid-qa-20260606/red-matches-component-actions.txt`
- GREEN:
  - `evidence/desktop-fluid-qa-20260606/green-fluid-contract.txt`
  - `evidence/desktop-fluid-qa-20260606/green-matches-component-actions.txt`
  - `evidence/desktop-fluid-qa-20260606/green-v1-web-test.txt`
  - `evidence/desktop-fluid-qa-20260606/green-v1-web-build.txt`
- Browser:
  - `evidence/desktop-fluid-qa-20260606/final-fluid-routes.json`
  - `evidence/desktop-fluid-qa-20260606/final-interactions.json`
  - `output/playwright/visual-audit/desktop-fluid-qa-20260606/`

## Progress Snapshot

- 2026-06-06: User supplied 1920px screenshot showing fixed-width app frame, mobile-like search/filter controls, and insufficient function-level QA. Task opened as Task 96 follow-up.
- 2026-06-06: Removed desktop app frame `1440px` cap, converted main list search to a desktop toolbar, widened filter/list workbenches, and made match/team-match/team visible card actions independent links.
- 2026-06-06: Full route matrix captured 53 routes x 3 desktop viewports. Initial rerun found `/teams` `1440x900` title clipping; adjusted team-card grid to 2/3/4 columns across `1440/1680/1920` and reran `/teams` successfully.
- 2026-06-06: Representative browser interaction smoke passed for `/matches`, `/team-matches`, and `/teams`: search, filter sort chip, sport rail link, create CTA, card action, and detail link all produced observable URL/DOM changes.
- 2026-06-06: Intermediate-width follow-up checked `/matches` at `768/900/1023/1024/1180/1181/1280`. The route now hides desktop filter rails through `1180px`, keeps the list content single-column until the rail breakpoint, and promotes the side filter rail from `1181px`.
- 2026-06-06: Reviewer-requested `/marketplace` and `/lessons` captures were recorded as unsupported current v1 routes. `apps/v1_web/src/app` has no `marketplace` or `lessons` route folders, and browser captures return 404 across the intermediate-width matrix.

## Evidence Summary

- `evidence/desktop-fluid-qa-20260606/green-desktop-script-suite.txt`
- `evidence/desktop-fluid-qa-20260606/green-card-actions-all.txt`
- `evidence/desktop-fluid-qa-20260606/green-v1-web-test.txt`
- `evidence/desktop-fluid-qa-20260606/green-v1-web-build.txt`
- `evidence/desktop-fluid-qa-20260606/final-interactions.json`
- `evidence/desktop-fluid-qa-20260606/team-match-detail-click-evidence.json`
- `evidence/desktop-fluid-qa-20260606/post-fix-fluid-metrics.json`
- `evidence/desktop-fluid-qa-20260606/post-fix-auth-my-metrics.json`
- `evidence/desktop-fluid-qa-20260606/final-fluid-routes.json`
- `evidence/desktop-fluid-qa-20260606/final-fluid-routes-teams-rerun.json`
- `evidence/desktop-fluid-qa-20260606/intermediate-widths-post-fix.json`
- `output/playwright/visual-audit/desktop-fluid-qa-20260606/final-fluid-routes/`
- `output/playwright/visual-audit/desktop-fluid-qa-20260606/final-fluid-routes-rerun/`
- `output/playwright/visual-audit/desktop-fluid-qa-20260606/final-auth-routes/`
- `output/playwright/visual-audit/desktop-fluid-qa-20260606/intermediate-widths/`

## Residual Notes

- Full matrix JSON still records the pre-fix `/teams` clipping failure; the corrected `/teams` rerun is stored separately at `final-fluid-routes-teams-rerun.json`.
- Interaction network logs include benign `net::ERR_ABORTED` entries from rapid route transitions and expected unauthenticated guard checks on protected create/apply paths. URL-level assertions passed.
- `/marketplace` and `/lessons` remain referenced by older scenario/backlog material, but they are not valid current `apps/v1_web` runtime routes until a v1 route/API contract is reintroduced.
