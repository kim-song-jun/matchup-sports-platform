# 149. Admin Team Match Recruitment

Date: 2026-09-19
Owner: codex
Status: complete

## Scope

- Backend: `apps/v1_api/src/team-matches`, platform recruitment/application contract
- Frontend: `apps/v1_web/src/app/admin/team-matches`, v1 hooks/types
- Docs: `docs/api/domains/team-matches.md`, `docs/scenarios/05-team-match-flows.md`

## Requirements

- [x] Active `owner`/`ops` admins can open a teamless team-match recruitment by choosing sport, region, place, and schedule.
- [x] Managed active teams in the same sport can apply through the existing public application flow.
- [x] Creation writes only a recruiting team match; it does not create a Game or either team schedule.
- [x] An owner/ops admin can later select two distinct requested applications as home and away.
- [x] Finalization atomically creates the Game and both schedules, approves the selected applications, rejects the remaining applications, and writes audit/status logs.
- [x] Support admins and non-admin users cannot create or finalize platform recruitment.
- [x] Existing team-owner recruitment/application flow remains unchanged.

## Acceptance Criteria

- Given an owner/ops admin
  When the admin submits the recruitment form
  Then a hostless `recruiting` team match is publicly visible and no Game or team schedule exists yet.
- Given a same-sport team manager
  When the manager applies to the platform recruitment
  Then the application is stored as `requested` without requiring a host team.
- Given at least two valid requested applications
  When the admin chooses home and away and confirms them
  Then the team match becomes `matched`, the two applications are approved, remaining applications are rejected, and the detail route is returned.
- Given the same application twice, a cross-sport/inactive team, or a support admin
  When finalization is attempted
  Then the API rejects the request without partial writes.
- Given successful finalization
  When either team views its schedule/lineup flow
  Then the same team match and Game aggregate are available to both sides.

## Validation

- [x] Focused backend service tests: 68/68
- [x] Focused frontend page/model tests: 26/26
- [x] v1 API/web typecheck (once, after host-load preflight)
- [x] Admin route visual/manual QA: headed Windows Chrome, desktop/tablet/mobile, empty + completed form states.
- [x] Each viewport returned HTTP 200 with no console/page/network errors, no horizontal overflow, and an enabled submit action after valid input.
- [x] Real API/DB E2E: admin create `201` -> public list exposes the same platform-managed ID -> team manager applies through the browser with `201 requested` -> admin API/UI shows the persisted application.
- [x] Reproducible Playwright spec passed in the repository QA container (`desktop`, 1/1); headed Chrome evidence captured at 1440×900, 834×1112, and 390×844.
- [x] Touched-path debt grep and diff checks

## Ambiguity Log

- “관리자 권한” is interpreted as platform admin (`owner`/`ops`), because team owner/manager creation already exists.
- The administrator does not designate teams at creation. Teams apply first, and the administrator selects two requested applications later.

## Progress Snapshot

- 2026-09-19: Existing v1 flow and admin permissions verified. Implementation started.
- 2026-09-19: Initial direct-assignment interpretation was corrected after user clarification.
- 2026-09-19: Platform recruitment creation, public team application, and admin two-application finalization implemented; focused backend/frontend tests passed.
- 2026-09-19: Headed Windows Chrome visual QA passed at 1440×900, 768×1024, and 390×844 for empty/filled recruitment creation and two-application finalization. The isolated QA worktree used deterministic API fixtures without loading repository secrets; focused backend tests cover the server contract. Evidence is committed under `docs/screenshots/task149-admin-team-match/`.
- 2026-09-19: A fresh isolated PostgreSQL runtime proved the real public journey with `host@teameet.v1` managing `송파 풋살 모임`: admin recruitment create `201`, public list same-ID lookup, browser application `201 requested`, and admin persisted count `1`. `e2e/v1-tests/admin-platform-team-match-flow.spec.ts` passed 1/1 in the official Playwright QA container. Headed Chrome reported zero console, page, request, or API errors; 40 cancelled Next RSC prefetches were classified separately as expected navigation aborts.

## Screenshot Evidence

- Desktop: [empty](../../docs/screenshots/task149-admin-team-match/desktop-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/desktop-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/desktop-applications.png)
- Tablet: [empty](../../docs/screenshots/task149-admin-team-match/tablet-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/tablet-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/tablet-applications.png)
- Mobile: [empty](../../docs/screenshots/task149-admin-team-match/mobile-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/mobile-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/mobile-applications.png)
- Machine-readable verdict: [report.json](../../docs/screenshots/task149-admin-team-match/report.json)
- Real public/application flow — Desktop: [public list](../../docs/screenshots/task149-admin-team-match/real-desktop-public-list.png) · [before apply](../../docs/screenshots/task149-admin-team-match/real-desktop-detail-before-apply.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-desktop-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-desktop-admin-application.png)
- Real public/application flow — Tablet: [public list](../../docs/screenshots/task149-admin-team-match/real-tablet-public-list.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-tablet-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-tablet-admin-application.png)
- Real public/application flow — Mobile: [public list](../../docs/screenshots/task149-admin-team-match/real-mobile-public-list.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-mobile-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-mobile-admin-application.png)
- Real-flow machine-readable verdict: [real-flow-report.json](../../docs/screenshots/task149-admin-team-match/real-flow-report.json)
