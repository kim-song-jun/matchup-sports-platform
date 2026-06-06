# Task 103 - V1 Admin Desktop Domain

## Goal

Rebuild the v1 admin surface as a dedicated desktop operations domain instead of a minimal support page, while preserving current v1 runtime contracts and avoiding fake operational success.

## Scope

- Routes: `/admin`, `/admin/audit`
- Frontend: `apps/v1_web/src/app/admin/**`, `apps/v1_web/src/components/community/admin-*`, `apps/v1_web/src/app/globals.css`
- Current API contracts:
  - `GET /api/v1/admin/me`
  - `GET /api/v1/admin/overview`
  - `GET /api/v1/admin/action-logs`
  - `GET /api/v1/admin/status-change-logs`
  - `POST /api/v1/admin/users/:userId/status`
  - `POST /api/v1/admin/matches/:matchId/status`
  - `POST /api/v1/admin/teams/:teamId/status`
  - `POST /api/v1/admin/team-matches/:teamMatchId/status`

## Acceptance Criteria

- [x] `/admin` reads v1 admin authority/overview/action-log data and presents a desktop operations dashboard.
- [x] `/admin/audit` reads v1 admin authority/action-log data and presents a structured audit table/list.
- [x] Unsupported admin mutations such as settlements and disputes are marked as contract-unavailable and never shown as completed.
- [x] Current status mutation contracts are shown as connected but require target id and reason before any action.
- [x] Status mutation target switches clear target-specific input so stale IDs cannot be submitted to another admin endpoint.
- [x] Admin navigation stays inside the admin shell and does not expose public app CTAs.
- [x] Visual QA covers desktop, tablet/intermediate, and mobile widths for admin pages.

## Out Of Scope

- New backend admin mutation endpoints.
- Admin user detail, settlement detail, dispute detail, or sanctions detail routes unless the v1 API contract is added first.

## Progress Snapshot

- Replaced `/admin` and `/admin/audit` FirstDesign placeholders with v1 admin clients.
- Admin client now reads `/admin/me`, `/admin/overview`, `/admin/action-logs`, and `/admin/status-change-logs`.
- Added admin view models that normalize the current backend wire shape:
  - overview state buckets (`users.active`, `matches.recruiting`, etc.)
  - action logs (`actionLogId`, `adminUserId`, `actionType`, `pageInfo.nextCursor`)
  - authority capability (`adminRole`, `status`, `capabilities`)
- Added desktop-first admin shell UI with dashboard KPIs, domain status cards, authority/capability panel, contract map, and audit log table/list.
- Kept unsupported settlement/dispute handling explicitly unavailable; no local success or fake completion path exists.
- Mobile audit logs render as stacked rows; desktop audit logs remain a dense table.
- Baseline before-screenshot for this task is not available because the admin route was already in a dirty WIP state when the task resumed; latest after-screenshots are stored below.

## Validation Evidence

- `pnpm --filter v1_web test src/app/admin/admin.open-design.test.tsx` PASS
- `corepack pnpm --filter v1_web test src/components/community/admin.status-mutation.test.tsx` PASS (5 tests, includes target switch stale-input regression)
- `corepack pnpm --filter v1_web exec tsc --noEmit` PASS
- Browser surface check PASS: `localhost:3013/admin` admin quick-login, fill status mutation target ID/reason, switch target from user to match, target-specific fields cleared and submit stayed disabled with no console/page/HTTP errors.
- `pnpm --filter v1_web build` PASS
- `git diff --check -- <admin scoped paths>` PASS
- Authenticated Playwright visual/function QA PASS:
  - routes: `/admin`, `/admin/audit`
  - account: `admin@teameet.v1`
  - API probes: `/admin/me`, `/admin/overview`, `/admin/action-logs?limit=5`, `/admin/status-change-logs?limit=5`
  - viewports: `390x844`, `900x1000`, `1440x1000`, `1920x1080`
  - latest local report: `.omo/ulw-loop/admin-desktop-remaining-v5-20260607/admin-desktop-browser.json`
  - raw screenshots: `output/playwright/visual-audit/admin-desktop-remaining-v5/admin-focus/`

## Canonical PR Screenshots

- Admin login desktop: `docs/screenshots/v1-admin-desktop-service-ui/admin-login-desktop.png`
- Admin dashboard desktop: `docs/screenshots/v1-admin-desktop-service-ui/admin-dashboard-desktop.png`
- Admin audit desktop: `docs/screenshots/v1-admin-desktop-service-ui/admin-audit-desktop.png`
- Match list narrow desktop: `docs/screenshots/v1-admin-desktop-service-ui/matches-narrow-desktop.png`
- Teams tablet: `docs/screenshots/v1-admin-desktop-service-ui/teams-tablet.png`
