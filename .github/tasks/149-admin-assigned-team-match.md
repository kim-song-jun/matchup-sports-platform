# 149. Admin Assigned Team Match

Date: 2026-09-19
Owner: codex
Status: complete

## Scope

- Backend: `apps/v1_api/src/team-matches`, admin team lookup contract
- Frontend: `apps/v1_web/src/app/admin/team-matches`, v1 hooks/types
- Docs: `docs/api/domains/team-matches.md`, `docs/scenarios/05-team-match-flows.md`

## Requirements

- [x] Active `owner`/`ops` admins can create a team match by selecting two active teams.
- [x] Home and away teams must be distinct and use the same sport.
- [x] Creation atomically writes the matched team match, Game aggregate, both team schedules, approved opponent application, and admin audit/status logs.
- [x] Support admins and non-admin users cannot create assigned matches.
- [x] Admin UI exposes a clear create entry and validates required match information before submit.
- [x] Existing team-owner recruitment/application flow remains unchanged.

## Acceptance Criteria

- Given an owner/ops admin and two active same-sport teams
  When the admin submits the assignment form
  Then a `matched` team match is created with both teams attached and the detail route is returned.
- Given the same team twice, cross-sport teams, inactive teams, or a support admin
  When creation is attempted
  Then the API rejects the request without partial writes.
- Given a successful assignment
  When either team views its schedule/lineup flow
  Then the same team match and Game aggregate are available to both sides.

## Validation

- [x] Focused backend service tests: 4/4
- [x] Focused frontend page test: 2/2
- [x] v1 API/web typecheck (once, after host-load preflight)
- [x] Admin route visual/manual QA: headed Windows Chrome, desktop/tablet/mobile, empty + completed form states.
- [x] Each viewport returned HTTP 200 with no console/page/network errors, no horizontal overflow, and an enabled submit action after valid input.
- [x] Touched-path debt grep and diff checks

## Ambiguity Log

- “관리자 권한” is interpreted as platform admin (`owner`/`ops`), because team owner/manager creation already exists. The new path directly assigns two teams and does not replace recruitment.

## Progress Snapshot

- 2026-09-19: Existing v1 flow and admin permissions verified. Implementation started.
- 2026-09-19: Owner/ops direct assignment API and admin form implemented; backend/frontend focused tests and both typechecks passed.
- 2026-09-19: Headed Windows Chrome visual QA passed at 1440×900, 768×1024, and 390×844. Because the isolated QA worktree did not load repository secrets, the UI run used deterministic API fixtures while the server contract remained covered by focused backend tests. Evidence is committed under `docs/screenshots/task149-admin-team-match/`.

## Screenshot Evidence

- Desktop: [empty](../../docs/screenshots/task149-admin-team-match/desktop-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/desktop-filled.png)
- Tablet: [empty](../../docs/screenshots/task149-admin-team-match/tablet-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/tablet-filled.png)
- Mobile: [empty](../../docs/screenshots/task149-admin-team-match/mobile-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/mobile-filled.png)
- Machine-readable verdict: [report.json](../../docs/screenshots/task149-admin-team-match/report.json)
