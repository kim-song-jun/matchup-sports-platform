# Task 103 - V1 Customer Operations ERP

## Goal

Rebuild `/admin` as a customer-facing operations ERP for the v1 service user who runs teams and matches. This is not a developer console, root admin panel, or internal platform moderation dashboard.

## Correct Domain Meaning

- `/admin` in this task means "업체/고객 운영 워크스페이스".
- The page must use currently implemented v1 customer workflows:
  - profile/activity: `/me/profile`, `/me/activity-summary`
  - personal match operation: `/me/matches?mode=created`, `/matches/new`, `/matches/:id/edit`
  - team operation: `/me/teams?permission=manage_team`, `/my/teams/:id`, `/my/teams/:id/members`
  - team-match operation: `/me/team-matches`, `/team-matches/new`, `/team-matches/:id`
  - communication/review: `/notifications`, `/my/reviews`, `/my/reviews/:sourceType/:sourceId`
- The page must not depend on `V1AdminUser` or internal `/api/v1/admin/*` endpoints for the customer ERP experience.

## Scope

- Routes: `/admin`, `/admin/matches`, `/admin/team-matches`, `/admin/teams`, `/admin/reviews`, `/admin/notifications`, `/admin/audit`
- Frontend:
  - `apps/v1_web/src/app/admin/**`
  - `apps/v1_web/src/components/community/admin-*`
  - `apps/v1_web/src/components/v1-ui/shell.tsx`
  - `apps/v1_web/src/app/globals.css`
- Tests:
  - `apps/v1_web/src/app/admin/admin.open-design.test.tsx`
  - `apps/v1_web/src/components/v1-ui/shell.open-design.test.tsx`
- Backend: no new API in this task unless current v1 customer workflows cannot be represented honestly.

## Acceptance Criteria

- [x] `/admin` renders a customer operations ERP with summary metrics, today's work queue, personal match operation, team-match operation, team operation, and notification/review panels.
- [x] `/admin` has separate function routes for personal matches, team matches, team operations, reviews, notifications, and activity history.
- [x] `/admin/matches` renders created personal matches and links to `/matches/new`, `/matches/:id`, and `/matches/:id/edit`.
- [x] `/admin/team-matches` renders hosted/requested team matches and links hosted items to `/team-matches/:id/edit`.
- [x] `/admin/teams` renders teams the user can manage and links to `/teams/new`, `/my/teams/:id`, and `/my/teams/:id/members`.
- [x] `/admin/reviews` renders pending review work and links to `/my/reviews` and `/my/reviews/:sourceType/:sourceId`.
- [x] `/admin/reviews` has seeded local v1 review-pending data for both owner/admin operations personas and a focused API/browser QA contract proving the page is populated.
- [x] `/admin/notifications` renders service notifications and links only to implemented runtime targets, with unsafe targets normalized to `/notifications`.
- [x] `/admin/audit` renders a customer-facing "업무 이력" view derived from real match/team-match/notification/review workflows, not internal action logs.
- [x] `/admin` does not show developer/internal-copy such as API, route, contract, mutation, seed, fixture, raw capability IDs, root/admin-owner wording, or internal audit-log framing.
- [x] `/admin` does not call or require `/api/v1/admin/me`, `/api/v1/admin/overview`, `/api/v1/admin/action-logs`, or `/api/v1/admin/status-change-logs` for the customer ERP view.
- [x] Login protection remains through `RequireAuth`; unauthenticated users are redirected by the existing auth gate.
- [x] Actions only link to implemented v1 runtime routes. No fake success, disabled unsupported settlement/dispute completion, or design-only routes.
- [x] Desktop QA verifies the admin is a function-split service ERP, not a single mobile-first dashboard stretched to desktop.
- [x] Desktop/tablet/mobile QA verifies no fixed-width page feel, no mixed mobile/desktop chrome, no horizontal overflow, and no broken console/network signals.

## Out Of Scope

- New platform moderation API.
- New settlement, dispute, payment, venue, marketplace, lesson, or tournament backend contracts.
- Internal Teameet operator dashboard.

## Progress Snapshot

- Previous implementation incorrectly treated `/admin` as a platform operations console backed by `/api/v1/admin/*`.
- Current correction replaces that with customer ERP models based on existing v1 user/team/match workflows.
- `/admin` now uses `/me/profile`, `/me/activity-summary`, `/me/teams?permission=manage_team`, `/me/matches`, `/me/team-matches`, `/notifications`, `/reviews`, and team join request workflows.
- `/admin/audit` now uses customer workflow history and formats dates for mobile/desktop readability.
- `/login?redirect=/admin` now presents "업체 운영 로그인" and defaults dev-login to the team owner persona instead of the internal admin persona.
- QA scripts now treat admin routes as customer operations ERP routes and capture visible DOM text only, avoiding Next dev script-text false positives.
- Follow-up on 2026-06-07: user clarified that `/admin` must be divided by function, with each route exposing real editable/manageable v1 actions. This surface can be desktop/admin-workbench first; mobile-first is not required.
- `/admin/matches`, `/admin/team-matches`, `/admin/teams`, `/admin/reviews`, and `/admin/notifications` now exist as App Router pages and share a desktop ERP table layout with route-specific active navigation.
- Route matrix `docs/scenarios/13-v1-open-design-recovery-from-zero.md` now includes 92 current v1 routes so the QA storybook captures the new admin function pages.
- 2026-06-07 seed QA: existing v1 seed data plus `make v1-db-seed` produces two ready pending reviews for `owner@teameet.v1` and one ready pending review for `admin@teameet.v1`; both include `team_match` `00000000-0000-4000-8000-000000000304`, and owner also has `match` `00000000-0000-4000-8000-000000000203`.
- Focused `/admin/reviews` live QA proves the empty state is hidden for both owner/admin personas, pending-review rows are visible, and review actions navigate to `/my/reviews/:sourceType/:sourceId`.
- 2026-06-07 rework after user screenshot: `/admin/reviews` no longer uses a fixed-feeling `1480px` admin lane; the admin domain expands to the available desktop workspace, KPI cards use `auto-fit`, and the wide function layout uses a table plus side rail so 2048px desktop does not look like a stretched mobile page.
- Focused reviewer QA PASS: a separate QA agent reran the API seed contract and `admin@teameet.v1` 2048x900 browser live check, confirming the empty-state copy is absent, the review CTA reaches `/my/reviews/team_match/00000000-0000-4000-8000-000000000304`, and console/request failures are empty. Other review-work lanes timed out and are recorded as inconclusive rather than counted as PASS.
- 2026-06-07 loading/copy rework: admin function routes now keep KPI/table/side-rail structure during loading instead of replacing the page with a generic card, and `/admin` plus `/admin/audit` no longer leak empty-state copy while customer-operation data is still loading.
- Function page copy now uses route-specific customer tasks (`개설한 개인 매치`, `팀매치 처리`, `팀 관리`, `리뷰 관리`, `알림 관리`) and removes weak/internal phrases such as `업체 운영`, `운영 기준`, `리뷰 기준`, `서비스 알림`, and `teameet ERP` from production admin UI.

## Validation Plan

- Component/unit:
  - `corepack pnpm --filter v1_web test`
  - `corepack pnpm --filter v1_web exec tsc --noEmit`
- Build:
  - `corepack pnpm --filter v1_web build`
- QA script contracts:
  - `node --test scripts/qa/v1-open-design-parity.test.mjs scripts/qa/v1-route-walkthrough.test.mjs scripts/qa/v1-full-responsive-visual-functional.test.mjs scripts/qa/v1-page-storybook-qa.test.mjs`
- Browser/manual:
  - `/admin`, `/admin/matches`, `/admin/team-matches`, `/admin/teams`, `/admin/reviews`, `/admin/notifications`, `/admin/audit`
  - viewports: `390x844`, `768x1024`, `1024x900`, `1440x960`, `1920x1080`
  - command: `node scripts/qa/v1-page-storybook-qa.mjs --base-url http://localhost:3013 --routes /admin,/admin/matches,/admin/team-matches,/admin/teams,/admin/reviews,/admin/notifications,/admin/audit --viewports 390x844,768x1024,1024x900,1440x960,1920x1080 --out output/playwright/visual-audit/task103-admin-functional-pages-20260607/storybook --json evidence/task103-admin-functional-pages-20260607/storybook.json --html evidence/task103-admin-functional-pages-20260607/storybook.html --admin-focus`
  - result: `{"status":"pass","html":"evidence/task103-admin-functional-pages-20260607/storybook.html","stories":35}`
  - screenshots under `output/playwright/visual-audit/task103-admin-functional-pages-20260607/storybook/`
  - function link evidence: `evidence/task103-admin-functional-pages-20260607/function-links.json`
- Focused review seed/browser QA:
  - `node --test scripts/qa/v1-admin-review-seed-contract.test.mjs`
  - `node scripts/qa/v1-admin-review-page-live-check.mjs`
  - `node scripts/qa/v1-page-storybook-qa.mjs --routes /admin/reviews --viewports 390x844,768x1024,1024x900,1440x960,1920x1080 --admin-focus`
  - result: `GET /api/v1/reviews?tab=pending` returns ready items for `owner@teameet.v1` and `admin@teameet.v1`, live browser QA reaches `/my/reviews/team_match/00000000-0000-4000-8000-000000000304` for both personas, and Storybook QA passes 5/5 viewports.
  - evidence: `evidence/task103-admin-review-seed-20260607/reviews-api.json`, `evidence/task103-admin-review-seed-20260607/admin-reviews-live-check.json`, `evidence/task103-admin-review-seed-20260607/admin-reviews-storybook.json`.
- Rework QA after fixed-width/sparse desktop feedback:
  - `EVIDENCE_JSON=evidence/task103-admin-review-zero-rework-20260607/reviews-api-green-rerun.json node --test scripts/qa/v1-admin-review-seed-contract.test.mjs`
  - `REVIEW_EMAILS=admin@teameet.v1 VIEWPORT=2048x900 EVIDENCE_JSON=evidence/task103-admin-review-zero-rework-20260607/admin-wide-layout-green.json SCREENSHOT_PATH=output/playwright/visual-audit/task103-admin-review-zero-rework-20260607/admin-wide-layout-green.png node scripts/qa/v1-admin-review-page-live-check.mjs`
  - `REVIEW_EMAILS=owner@teameet.v1,admin@teameet.v1 VIEWPORT=1440x960 EVIDENCE_JSON=evidence/task103-admin-review-zero-rework-20260607/owner-admin-live-green.json SCREENSHOT_PATH=output/playwright/visual-audit/task103-admin-review-zero-rework-20260607/owner-admin-live-green.png node scripts/qa/v1-admin-review-page-live-check.mjs`
  - `node scripts/qa/v1-page-storybook-qa.mjs --base-url http://localhost:3013 --routes /admin/reviews --viewports 390x844,768x1024,1024x900,1440x960,2048x900 --out output/playwright/visual-audit/task103-admin-review-zero-rework-20260607/storybook-layout --json evidence/task103-admin-review-zero-rework-20260607/storybook-layout.json --html evidence/task103-admin-review-zero-rework-20260607/storybook-layout.html --admin-focus`
  - `corepack pnpm --filter v1_web test src/app/admin/admin.open-design.test.tsx`
  - `corepack pnpm --filter v1_web build`
- Loading/copy rework QA:
  - RED expected failure: `corepack pnpm --filter v1_web test src/app/admin/admin.loading-copy.test.tsx` initially failed on generic review loading copy, dashboard/audit empty-state leakage, and weak route copy.
  - `corepack pnpm --filter v1_web test src/app/admin/admin.loading-copy.test.tsx` -> 3/3 pass.
  - `corepack pnpm --filter v1_web test src/app/admin/admin.open-design.test.tsx` -> 7/7 pass.
  - `corepack pnpm --filter v1_web test src/components/v1-ui/shell.open-design.test.tsx` -> 3/3 pass.
  - `node --test scripts/qa/v1-open-design-parity.test.mjs scripts/qa/v1-route-walkthrough.test.mjs scripts/qa/v1-full-responsive-visual-functional.test.mjs scripts/qa/v1-page-storybook-qa.test.mjs` -> 33/33 pass.
  - `corepack pnpm --filter v1_web exec tsc --noEmit` -> pass.
  - `corepack pnpm --filter v1_web build` -> pass, all 82 app routes generated/compiled successfully.
  - `node scripts/qa/v1-page-storybook-qa.mjs --base-url http://localhost:3013 --routes /admin,/admin/matches,/admin/team-matches,/admin/teams,/admin/reviews,/admin/notifications,/admin/audit --viewports 390x844,768x1024,1024x900,1440x960,2048x900 --out output/playwright/visual-audit/task103-admin-loading-copy-20260607/full --json evidence/task103-admin-loading-copy-20260607/storybook.json --html evidence/task103-admin-loading-copy-20260607/storybook.html --admin-focus` -> `{"status":"pass","stories":35}`.
  - Storybook JSON check: blocking findings `0`, browser signals `0`, function probe failures `0`; evidence gallery `evidence/task103-admin-loading-copy-20260607/storybook.html`.
