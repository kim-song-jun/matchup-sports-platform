# 101. V1 No-Fallback Storybook Functional/UI QA

Status: Completed
Owner: Codex
Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/task101-no-fallback-storybook-qa-20260606`, `output/playwright/visual-audit/task101-no-fallback-storybook-qa-20260606`

## Prompt Contract

The renewed ULW request tightens Task 99:

- Do not create new fallback behavior while building QA/reporting. If a route, asset, screenshot, API call, or interaction fails, the raw failure must be visible and must count against the run.
- Re-run route-by-route functional checks and page UI checks one by one, not only broad summary screenshots.
- Build a Storybook-like page QA gallery so each route/viewport can be visually inspected from one artifact.
- Desktop admin pages need special scrutiny because admin/ops surfaces must feel like serious desktop tooling and must not fake unsupported operations as local success.
- Mobile, tablet, intermediate, desktop, and wide desktop must expand naturally with a modern Toss-like hierarchy.

## Acceptance Criteria

- [x] Storybook-like QA report contract is covered by RED -> GREEN tests.
- [x] The report lists every implemented v1 route target, its capture route, auth mode, family, viewport stories, screenshots, raw findings, and raw browser/runtime errors.
- [x] Missing screenshots or browser errors are displayed as errors in the report and never replaced by generated placeholder imagery.
- [x] Admin routes `/admin` and `/admin/audit` have a desktop-focused QA section covering at least `1024`, `1180`, `1280`, `1440`, and `1920` widths.
- [x] Admin desktop QA checks unsupported operations are disabled or explicit, audit/admin links stay inside the admin shell, desktop bottom nav is absent, and visible controls pass Playwright trial actionability.
- [x] Full route browser QA is rerun against the current v1 route matrix with functional probes enabled.
- [x] Browser evidence and the generated QA gallery are saved under the Task 101 evidence/output paths.
- [x] Five independent reviewers return OK; any non-OK finding opens another fix/QA loop.

## Validation

- RED contract: `node --test scripts/qa/v1-page-storybook-qa.test.mjs`
- GREEN contract: `node --test scripts/qa/v1-page-storybook-qa.test.mjs scripts/qa/v1-route-walkthrough.test.mjs scripts/qa/v1-full-responsive-visual-functional.test.mjs scripts/qa/v1-public-protected-request-contract.test.mjs`
- Browser QA: `node scripts/qa/v1-page-storybook-qa.mjs --base-url http://localhost:3013 --matrix docs/scenarios/13-v1-open-design-recovery-from-zero.md --viewports 390x844,768x1024,900x1024,1023x1024,1024x900,1180x900,1280x900,1440x960,1920x1080 --out output/playwright/visual-audit/task101-no-fallback-storybook-qa-20260606/full --json evidence/task101-no-fallback-storybook-qa-20260606/page-storybook-full.json --html evidence/task101-no-fallback-storybook-qa-20260606/page-storybook-full.html`
- Admin desktop browser QA: `node scripts/qa/v1-page-storybook-qa.mjs --base-url http://localhost:3013 --routes /admin,/admin/audit --viewports 1024x900,1180x900,1280x900,1440x960,1920x1080 --out output/playwright/visual-audit/task101-no-fallback-storybook-qa-20260606/admin-desktop --json evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.json --html evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.html --admin-focus`
- v1 web regression: `corepack pnpm --filter v1_web test`, `corepack pnpm --filter v1_web build`

## Progress Snapshot

- 2026-06-06: Task opened from renewed ULW request. Task 99 has 87 routes / 783 viewport results / 0 failures, but it does not yet provide a Storybook-like per-page inspection artifact or an admin desktop deep-check contract.
- 2026-06-06: Implemented `scripts/qa/v1-page-storybook-qa.mjs` and contract tests. RED evidence captured missing runner, duplicate raw finding, failed-request blocking, and response-error screenshot-retention gaps. Final GREEN contract run passed 27/27.
- 2026-06-06: Full Storybook QA gallery regenerated at `evidence/task101-no-fallback-storybook-qa-20260606/page-storybook-full.json` and `.html`: 87 routes, 783 stories/results, 0 failures, 0 findings, 0 page errors, 0 response errors, 0 failed requests, 783/783 referenced screenshots present.
- 2026-06-06: Admin desktop focus at `evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.json` and `.html`: `/admin` and `/admin/audit` across `1024x900`, `1180x900`, `1280x900`, `1440x960`, `1920x1080`, 10/10 stories pass. Desktop nav visible, bottom nav absent, no horizontal overflow, disabled `처리 불가` unsupported operation, and no browser/probe failures.
- 2026-06-06: Focused public protected-request recheck at `evidence/task101-no-fallback-storybook-qa-20260606/focused-401-recheck.json` and `.html`: 4 routes, 36 stories, 0 failures, 0 protected request leakage.
- 2026-06-06: HTML integrity recheck opened the full gallery at `1440x960` and `390x844`; each viewport loaded 783/783 images, with 0 error cards and no horizontal overflow. File inspection found 0 placeholder image refs, 0 `data:image` refs, and 0 missing HTML images.
- 2026-06-06: Regression gates passed: `corepack pnpm --filter v1_web test` (16 files / 34 tests) and `corepack pnpm --filter v1_web build` (77 routes/pages generated). Post-fix review lanes returned PASS for goal/constraint, code quality, hands-on evidence, security/honesty, and admin evidence.
- 2026-06-06: Follow-up desktop admin visual review found `/admin` still using the general user rail (`마이` active and `매치 만들기` CTA). Added an admin desktop rail variant with only `운영 상태` and `감사 로그`, then reran focused admin browser QA at `admin-desktop-final.json` and `.html`: `/admin`, `/admin/audit`, five desktop widths, 10/10 stories pass, 0 findings/errors/failed requests.

## Ambiguity Log

- "Fallback" in this task means newly masking a missing route, failed screenshot, failed asset, failed API call, or failed interaction with a replacement success surface. Seeded capture IDs used by the existing route walker remain explicit test bindings; if they fail to resolve, the QA run must expose the failure rather than inventing a route.
