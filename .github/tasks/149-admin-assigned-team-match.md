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
- [x] The admin recruitment uses the ordinary team-match condition contract: representative image, level, format, styles, uniform, gender, total/opponent cost, place, schedule, and optional deadline.
- [x] Admin detail exposes the saved representative image and level alongside the existing format/style/gender/uniform/cost fields.
- [x] Platform-managed provenance is persisted independently of `hostTeamId` and remains visible after home/away assignment.

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
  When the public list or detail is opened
  Then the platform-managed badge remains visible beside the assigned home and away teams.
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
- [x] 2026-09-21 condition-parity focused tests: API 6/6, Web 13/13
- [x] 2026-09-21 condition-parity API/Web typecheck and headed visual QA: desktop + mobile 4/4, no console/API errors or horizontal overflow
- [x] 2026-09-21 provenance regression tests: API 71/71, Web 75/75

## Ambiguity Log

- “관리자 권한” is interpreted as platform admin (`owner`/`ops`), because team owner/manager creation already exists.
- The administrator does not designate teams at creation. Teams apply first, and the administrator selects two requested applications later.

## Progress Snapshot

- 2026-09-19: Existing v1 flow and admin permissions verified. Implementation started.
- 2026-09-19: Initial direct-assignment interpretation was corrected after user clarification.
- 2026-09-19: Platform recruitment creation, public team application, and admin two-application finalization implemented; focused backend/frontend tests passed.
- 2026-09-19: Headed Windows Chrome visual QA passed at 1440×900, 768×1024, and 390×844 for empty/filled recruitment creation and two-application finalization. The isolated QA worktree used deterministic API fixtures without loading repository secrets; focused backend tests cover the server contract. Evidence is committed under `docs/screenshots/task149-admin-team-match/`.
- 2026-09-19: A fresh isolated PostgreSQL runtime proved the real public journey with `host@teameet.v1` managing `송파 풋살 모임`: admin recruitment create `201`, public list same-ID lookup, browser application `201 requested`, and admin persisted count `1`. `e2e/v1-tests/admin-platform-team-match-flow.spec.ts` passed 1/1 in the official Playwright QA container. Headed Chrome reported zero console, page, request, or API errors; 40 cancelled Next RSC prefetches were classified separately as expected navigation aborts.
- 2026-09-21: Admin recruitment condition inputs and persistence were aligned with ordinary team-match recruitment. The deadline is optional, price inputs serialize to the shared `costNote` format, and admin detail now shows the saved image and level. Focused API/Web tests passed.
- 2026-09-21: `platformManaged` became a persisted team-match source flag. Assignment keeps it true, while public cards and detail show the actual home/away teams plus an explicit platform-managed badge.

- 2026-09-21: Headed Chrome real-runtime capture created a platform recruitment, accepted two real team applications, assigned HOME/AWAY, followed the public list card link, and verified the persisted platform badge, both team names, and 120,000/60,000 cost split on the public detail at desktop, tablet, and mobile viewports.

## Condition Parity Screenshot Evidence (2026-09-21)

- Desktop: [empty form](../../docs/screenshots/task149-admin-team-match-condition-parity/desktop-form-empty.png) · [filled form](../../docs/screenshots/task149-admin-team-match-condition-parity/desktop-form-filled.png) · [detail](../../docs/screenshots/task149-admin-team-match-condition-parity/desktop-detail.png)
- Tablet: [empty form](../../docs/screenshots/task149-admin-team-match-condition-parity/tablet-form-empty.png) · [filled form](../../docs/screenshots/task149-admin-team-match-condition-parity/tablet-form-filled.png) · [detail](../../docs/screenshots/task149-admin-team-match-condition-parity/tablet-detail.png)
- Mobile: [empty form](../../docs/screenshots/task149-admin-team-match-condition-parity/mobile-form-empty.png) · [filled form](../../docs/screenshots/task149-admin-team-match-condition-parity/mobile-form-filled.png) · [detail](../../docs/screenshots/task149-admin-team-match-condition-parity/mobile-detail.png)
- Public list provenance: [desktop](../../docs/screenshots/task149-admin-team-match-condition-parity/desktop-public-list-provenance.png) · [tablet](../../docs/screenshots/task149-admin-team-match-condition-parity/tablet-public-list-provenance.png) · [mobile](../../docs/screenshots/task149-admin-team-match-condition-parity/mobile-public-list-provenance.png)
- Public assigned-match detail provenance: [desktop](../../docs/screenshots/task149-admin-team-match-condition-parity/desktop-public-detail-provenance.png) · [tablet](../../docs/screenshots/task149-admin-team-match-condition-parity/tablet-public-detail-provenance.png) · [mobile](../../docs/screenshots/task149-admin-team-match-condition-parity/mobile-public-detail-provenance.png)
- Machine-readable verdict: [report.json](../../docs/screenshots/task149-admin-team-match-condition-parity/report.json)
## Screenshot Evidence

- Desktop: [empty](../../docs/screenshots/task149-admin-team-match/desktop-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/desktop-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/desktop-applications.png)
- Tablet: [empty](../../docs/screenshots/task149-admin-team-match/tablet-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/tablet-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/tablet-applications.png)
- Mobile: [empty](../../docs/screenshots/task149-admin-team-match/mobile-empty.png) · [completed](../../docs/screenshots/task149-admin-team-match/mobile-filled.png) · [applications](../../docs/screenshots/task149-admin-team-match/mobile-applications.png)
- Machine-readable verdict: [report.json](../../docs/screenshots/task149-admin-team-match/report.json)
- Real public/application flow — Desktop: [public list](../../docs/screenshots/task149-admin-team-match/real-desktop-public-list.png) · [before apply](../../docs/screenshots/task149-admin-team-match/real-desktop-detail-before-apply.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-desktop-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-desktop-admin-application.png)
- Real public/application flow — Tablet: [public list](../../docs/screenshots/task149-admin-team-match/real-tablet-public-list.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-tablet-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-tablet-admin-application.png)
- Real public/application flow — Mobile: [public list](../../docs/screenshots/task149-admin-team-match/real-mobile-public-list.png) · [applied](../../docs/screenshots/task149-admin-team-match/real-mobile-detail-applied.png) · [admin received](../../docs/screenshots/task149-admin-team-match/real-mobile-admin-application.png)
- Real-flow machine-readable verdict: [real-flow-report.json](../../docs/screenshots/task149-admin-team-match/real-flow-report.json)

## 2026-09-21 parity follow-up

Scope: existing PR #1237, isolated worktree; preserve the shared dirty tree.

- [x] Compare ordinary creation with admin creation and committed API contracts.
- [x] RED evidence: four frontend payload regressions (past deadline, discarded end, overnight end, incomplete end).
- [x] Share API date/confirmation rules; intake closes at deadline, received applications remain confirmable until kickoff.
- [x] Allow admin custom styles and ordinary explicit end dates; preserve edit datetime round trips.
- [x] Run focused API/Web tests and one typecheck per package.
- [x] Capture real runtime before/after at 390/768/1440, verify console/network and stored conditions.
- [ ] Update API/scenario docs, push scoped changes and screenshot gallery to PR #1237; review/CI.

Decisions: creation/new deadlines must be in the future. Edits may keep the exact existing elapsed deadline. Explicitly closed/cancelled/matched records remain non-confirmable. Admin still recruits two teams; ordinary creation keeps its host team.

Runtime: a fresh PostgreSQL cluster in /tmp on 55439, API 18149, web 3149; no existing database is changed. Browser is headed WSLg Chromium. Cleanup only this task's processes.

### Follow-up verification evidence

- A fresh 171-migration database reproduced admin create HTTP 500: `v1_team_matches_friendly_required_ck` still required a host. Follow-up migration `20260921141000_v1_platform_recruitment_host_constraint` fixes only the platform-host exception inside one transaction.
- API focused suite: **80/80 PASS**. Web affected suites: **40/40 PASS** across final runs (18 date/payload, 10 create/edit, 4 admin form, 8 shared selector). Initial four regressions failed before implementation.
- API and Web `tsc --noEmit`: PASS. Web pattern check: PASS (the sandbox disallowed process spawning; rerun with normal process permissions passed).
- Real API/DB: ordinary + admin create, requested applications, elapsed deadline rejection of new applicants, confirmation before kickoff, rejection of explicitly closed/already started matches, matched Game + two schedules: PASS. Five invalid metadata/ordinary-host mutations still rejected by DB CHECK.
- Headed Chromium at **390×844, 768×1024, 1440×900**: baseline 6/6 and after 6/6 PASS; no console errors, API failures or horizontal overflow. Both paths persist a 23:00 → next-day 01:00 match and custom style; regular edit preserves both ISO timestamps.
- [Before report](../../docs/screenshots/task149-parity-validation/before/report.json), [after report](../../docs/screenshots/task149-parity-validation/after/report.json), [API/DB report](../../docs/screenshots/task149-parity-validation/api-report.json).
- Reproduction: `scripts/qa/capture-task149-parity.mjs` (headed, `QA_PHASE=before|after`) and `scripts/qa/verify-task149-parity.mjs` (restricted to the isolated local fixture DB). Screenshots use real API data; no network interception or mock completion.

## 2026-09-22 two-team hero correction

- User correction: the organizer must not occupy the home-team slot while recruiting both teams.
- Unassigned platform detail shows equal HOME/AWAY slots, both `모집 중`; organizer provenance is a separate centered caption. Closed recruitment uses `미정`. Assigned and ordinary matches retain their existing team rendering.
- Reduced the unassigned platform sport illustration opacity so both slots remain readable.
- RED: two open/closed hero regressions failed before the fix. GREEN: detail/page suite 62/62.
- Headed Chromium + real isolated API/DB: before/after at 390×844, 768×1024, 1440×900. Zero console/API errors and horizontal overflow.
- Evidence: `docs/screenshots/task149-two-team-hero/{before,after}/`; reproduction: `scripts/qa/capture-task149-two-team-hero.mjs` with the local fixture match ID supplied through `QA_MATCH_ID`.
