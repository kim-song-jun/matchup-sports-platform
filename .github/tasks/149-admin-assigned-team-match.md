# 149. Admin Team Match Recruitment

## 2026-10-02 platform chat continuation

Scope: backend chat/recruitment, frontend detail entitlement, data-only migration, API/scenario docs.
Worktree: `output/worktrees/platform-team-match-chat`; branch `fix/platform-team-match-chat`, latest
`origin/dev` base `be228ba1b`. Shared-root WIP is untouched. No main promotion or production DB write.

- [x] Platform recruitment creates its room and mandatory creating-operator participant in the same transaction.
- [x] HOME/AWAY approval adds that team's active owner/manager participants in the approval transaction.
- [x] List/read/send/recipient entitlement covers the active creating owner/ops operator; revocation blocks access.
- [x] Detail `viewer.canChat` gates the existing chat CTA independently of application authorship/team membership.
- [x] Data-only idempotent migration backfills nondeleted platform recruitment/matched/completed rooms and missing participants; preserves existing history/preferences/voluntary team exits.
- [x] PostgreSQL HTTP integration scenarios added for preassignment access, each side's admission,
  unauthorized members, operator exit/revocation, cancellation and migration replay/data preservation.
- [x] Narrow regressions: API 126/126 (79 unchanged team-match cases + final chat/recruitment 47/47), Web 89/89.
- [x] API including the new integration spec and Web typechecks: 0 diagnostics. Diff/debt checks PASS.
- [ ] PostgreSQL integration/migration execution (Docker daemon unavailable; no approved test DB configured).
- [ ] Headed live manual QA at 390/768/1440 (requires actual API/test DB; no screenshot success claimed).
- [ ] User promotion to main and production `migrate deploy`; existing production rows are not yet modified.

Decisions: “platform operator” means the creating operator as agreed in this conversation, not every admin.
The latest source has `platformManaged` and staged recruitment approval; old local direct-assignment
code is not used. A platform room exists immediately, with each side admitted as approval happens.
Revoked/inactive creators never gain permissions from a backfill. Existing archived rooms stay archived.
No model/schema changes; tables are `v1_team_matches`, `v1_chat_rooms`, `v1_chat_room_participants`,
`v1_team_memberships`, `v1_admin_users`, and `v1_users`.

Progress: implementation, scoped regressions, API/Web typechecks and diff/debt review complete.
Real-DB suite attempted: fails before test setup with `DATABASE_URL is required for isolated integration suites`.
Docker daemon is absent, WSL unavailable in sandbox, and no PostgreSQL CLI/server is installed on this host.
No live visual QA or migration replay success claimed; no task-created server/browser processes remain.
Code is a local branch checkpoint, not deployment/PR-ready evidence. Production data remains unchanged.

## 2026-09-30 — Additive platform match collaboration

Scope: API, Web, Prisma, docs; branch `feat/platform-team-match-collaboration`, base `46833467c`; DEV/alpha only.

- [x] Preserve both-team editing, confirmation and mutual reviews.
- [x] Add active non-revoked owner/ops as additional record writers for standalone platform matches only.
- [x] Keep team confirmations participant-only; edits reset confirmations; preserve version/idempotency and actor audit.
- [x] Add one-way platform reviews for both assigned teams and actual latest-lineup account players, excluding self.
- [x] Separate platform source from peer scores and reciprocal reveal; immediate received visibility, institutional author, one review per match/target across admins.
- [x] Add admin-shell record/review entry points using existing components.
- [x] Local API regression 82/82 and Web 40/40; API/Web typechecks PASS. Five real-DB collaboration scenarios added, including DB unique rejection; execution pending PR CI (no local PostgreSQL).
- [x] API/scenario docs and changeset; diff/debt review.
- [ ] PR to dev, review/CI, DEV deployment and Alpha visual verification (390/768/1440).

Decisions: operator status does not create a lineup entry or review target. Admins actually playing retain their ordinary participant rights. Operational reviews do not alter existing peer reputation. Completed records remain locked; existing correction workflow is unchanged.
Progress: implementation in isolated worktree; no shared-root WIP modified. Browser connector failed twice with kernel exit and QA_PASSWORD is unavailable; Alpha authenticated visual QA pending credentials. No baseline screenshots could be captured.

PR #1365 targets dev. Expand-contract gate PASS after using a nullable server-derived unique review key (old rows remain NULL). Copilot review attempts failed twice before reviewing with GitHub CAPIError 400 "The requested model is not supported" (runs 36677340867, 36677550174). No review approval is claimed. User asked whether to hold deployment or permit DEV-only deployment after CI with these two checks explicitly deferred.

2026-09-30 user approved proceeding with DEV-only deployment after CI, explicitly deferring Copilot and authenticated visual QA. CI revealed missing schema digest repins and three unsized admin links; fixed without weakening either gate. Historical schema hashes remain accepted for rollback; the M11 migration binding is unchanged.

CI run 36678867332: API/Web/Gates PASS, including real DB integration and migration replay. PR #1365 merged to dev as 782ffacb98e91f5070eab940fd197270c223224d. Alpha run 36679582565 tracks deployment. Late automated static review found no Critical/Major and two Minor findings (required operator field/fixture sync and permission copy); both addressed in fresh follow-up branch `fix/platform-match-review-contract`.

Date: 2026-09-19
Owner: codex
Status: in_progress

## Scope

- Backend: `apps/v1_api/src/team-matches`, platform recruitment/application contract
- Frontend: `apps/v1_web/src/app/admin/team-matches`, v1 hooks/types
- Docs: `docs/api/domains/team-matches.md`, `docs/scenarios/05-team-match-flows.md`

## Requirements

- [x] Active `owner`/`ops` admins can open a teamless team-match recruitment by choosing sport, region, place, and schedule.
- [x] Managed active teams in the same sport can apply through the existing public application flow.
- [x] Creation writes only a recruiting team match; it does not create a Game or either team schedule.
- [x] An owner/ops admin can later select two distinct requested applications as home and away.
- [x] The first approval atomically creates a HOME + placeholder AWAY Game and HOME schedule; finalization hydrates AWAY, creates its schedule, approves the selected application, rejects the remaining applications, and writes audit/status logs.
- [x] Support admins and non-admin users cannot create or finalize platform recruitment.
- [x] Existing team-owner recruitment/application flow remains unchanged.
- [x] The admin recruitment uses the ordinary team-match condition contract: representative image, level, format, styles, uniform, gender, total/opponent cost, place, schedule, and optional deadline.
- [x] Admin detail exposes the saved representative image and level alongside the existing format/style/gender/uniform/cost fields.
- [x] Platform-managed provenance is persisted independently of `hostTeamId` and remains visible after home/away assignment.
- [x] Admins approve applicant teams one at a time; the first approval stays recruiting and the second approval finalizes the match.
- [x] The first approved team is persisted as HOME immediately, so the public hero changes from `모집 중 vs 모집 중` to `HOME 팀명 vs 모집 중` before the second approval.
- [x] The first approved HOME team can immediately save and submit its attendance lineup without waiting for the second team.
- [x] The admin list exposes a visible application-management action as soon as one requested application exists.
- [x] HOME/AWAY assignment never promotes either participant team into the platform recruitment operator; platform HOME viewers receive no `host_team` state or recruitment-management CTA.
- [x] Owner/ops admins can reject an individual requested application with a required reason, audit log, and applicant-team notification.
- [x] Owner/ops admins can edit a still-recruiting platform match from admin detail; finalized/non-platform matches and stale versions are rejected.

## Acceptance Criteria

- Given an owner/ops admin
  When the admin submits the recruitment form
  Then a hostless `recruiting` team match is publicly visible and no Game or team schedule exists yet.
- Given a same-sport team manager
  When the manager applies to the platform recruitment
  Then the application is stored as `requested` without requiring a host team.
- Given at least two valid requested applications
  When the admin approves the first application and later approves the second
  Then the first response remains `recruiting` while the approved HOME team is publicly visible and can manage its lineup, the second hydrates the existing AWAY side, makes the team match `matched`, rejects remaining applications, and returns the detail route.
- Given the same application twice, a cross-sport/inactive team, or a support admin
  When finalization is attempted
  Then the API rejects the request without partial writes.
- Given successful finalization
  When the public list or detail is opened
  Then platform provenance remains visible at the match level, while assigned home/away identity cards contain only attributes of those teams.
- Given successful finalization
  When either team views its schedule/lineup flow
  Then the same team match and Game aggregate are available to both sides.
- Given a requested application on a recruiting platform match
  When an owner/ops admin submits a rejection reason
  Then only that application becomes `rejected`, the reason is audited and notified, and no Game or schedule is created.
- Given a recruiting platform match
  When an owner/ops admin opens the edit route and saves a current version
  Then the public recruitment fields change; sport remains immutable and a stale version returns `VERSION_CONFLICT`.

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
- [x] 2026-09-22 incremental approval focused tests: API 7/7, Web 11/11
- [x] 2026-09-22 API/Web typecheck and API/Web pattern gates
- [x] 2026-09-22 visible-entry follow-up: admin list service 53/53, team-match list page 4/4, API/Web typecheck and pattern gates
- [ ] 2026-09-22 headed visual QA: local API/Web runtime was unavailable on ports 8121/3013, so runtime screenshots and console/network evidence remain for alpha verification.
- [x] 2026-09-24 rejection/edit focused backend service tests: 11/11
- [x] 2026-09-24 rejection/edit focused frontend detail/edit tests: 15/15
- [x] 2026-09-24 API/Web `tsc --noEmit` and `git diff --check`
- [ ] 2026-09-24 rejection/edit headed visual QA: local API/Web runtime was unavailable on ports 8121/3013; verify detail rejection form and edit page on alpha after deployment.
- [x] 2026-09-28 first-approval lineup recovery: focused API unit suites 100/100 and API `tsc --noEmit`

## Ambiguity Log

- “관리자 권한” is interpreted as platform admin (`owner`/`ops`), because team owner/manager creation already exists.
- The administrator does not designate teams at creation. Teams apply first, and the administrator selects two requested applications later.

## Progress Snapshot

- 2026-09-28: First platform approval now creates the canonical HOME + placeholder AWAY Game and HOME schedule, enabling the approved team to register its attendance lineup immediately. Second approval hydrates that existing AWAY side instead of creating a replacement Game.

- 2026-09-28: Corrected the public detail team-card boundary. `플랫폼 주관` and league/match conditions remain match-level provenance and are no longer rendered as attributes inside an assigned team card.

- 2026-09-27: Fixed the first-approval projection gap reported on alpha. The approval transaction now persists the first approved applicant as `hostTeamId`, a data migration backfills existing single-approved platform recruitments, and public list/detail can render `HOME 팀명 vs 모집 중` immediately.

- 2026-09-24: Added the missing explicit rejection action and a platform-recruitment edit route. Rejection requires a reason and preserves the recruiting aggregate; editing is limited to admin-managed standalone matches in `recruiting` state and uses optimistic concurrency.

- 2026-09-22: Replaced the two-application batch selector with per-application approval. The original first-approval contract reserved HOME without a Game or schedule; the 2026-09-28 follow-up supersedes that part by creating the placeholder Game and HOME schedule immediately.
- 2026-09-22: Added `pendingApplicationCount` and a visible `신청 1건 관리` list action so operators do not need to discover the row-click detail route before approving the first team.
- 2026-09-19: Existing v1 flow and admin permissions verified. Implementation started.
- 2026-09-19: Initial direct-assignment interpretation was corrected after user clarification.
- 2026-09-19: Platform recruitment creation, public team application, and admin two-application finalization implemented; focused backend/frontend tests passed.
- 2026-09-19: Headed Windows Chrome visual QA passed at 1440×900, 768×1024, and 390×844 for empty/filled recruitment creation and two-application finalization. The isolated QA worktree used deterministic API fixtures without loading repository secrets; focused backend tests cover the server contract. Evidence is committed under `docs/screenshots/task149-admin-team-match/`.
- 2026-09-19: A fresh isolated PostgreSQL runtime proved the real public journey with `host@teameet.v1` managing `송파 풋살 모임`: admin recruitment create `201`, public list same-ID lookup, browser application `201 requested`, and admin persisted count `1`. `e2e/v1-tests/admin-platform-team-match-flow.spec.ts` passed 1/1 in the official Playwright QA container. Headed Chrome reported zero console, page, request, or API errors; 40 cancelled Next RSC prefetches were classified separately as expected navigation aborts.
- 2026-09-21: Admin recruitment condition inputs and persistence were aligned with ordinary team-match recruitment. The deadline is optional, price inputs serialize to the shared `costNote` format, and admin detail now shows the saved image and level. Focused API/Web tests passed.
- 2026-09-21: `platformManaged` became a persisted team-match source flag. Assignment keeps it true, while public cards and detail show the actual home/away teams plus an explicit platform-managed badge.
- 2026-09-23: Separated HOME-side participation from recruitment ownership. Platform-managed matches no longer return `host_team` or render “내가 만든 팀매치 / 매치 관리” for the first approved team; server mutation guards remain admin-only.

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

## 2026-10-03 platform recruitment wording

- [x] Platform-managed public list uses `팀 모집 중`; ordinary team recruitment keeps `상대 모집 중`.
- [x] Platform-managed public detail uses `각 팀 부담금`; ordinary team detail keeps `상대팀 부담금`. Amounts and cost persistence are unchanged.
- [x] Focused rendering verification: both platform/ordinary cases passed (2/2).
- Initial image intake proposal was subsequently approved by the user; implementation is tracked below.
- Alpha/manual route QA remains unverified: this local change has not been deployed and the available session has no alpha browser/login capability. No layout or image rendering styles changed.

## 2026-10-03 two optional image slots (user-approved follow-up)

Scope: ordinary/admin create, edit, public list/detail, admin detail, API, nullable Prisma migration, contract/mocks.
The user explicitly selected the previously proposed two optional slots with single-image reuse and sport defaults, then asked to implement them. Reuse the existing form/Card/control patterns for that selected flow.

- [x] Persist `listImageUrl` separately; retain `imageUrl` as the detail image and backward-compatible shared image.
- [x] Create/edit show square 1:1 and wide 16:9 previews, optional inputs, independent removal, shared fallback and sport defaults. The create confirmation and admin detail show both previews.
- [x] Reject upload failures/empty successful responses visibly, retain saved images, disable competing uploads/removal and submitting during uploads.
- [x] Nullable-only migration `20261003001000_v1_team_match_list_image` adds `v1_team_matches.list_image_url`; no rewrite/backfill is required. Old clients omitting the new field on update retain it.
- [x] Sync public/admin response, mutation and edit types, MSW fixture and API domain documentation.
- [x] API focused suites 99/99. Web affected suites 200/200 across final focused runs. Both package typechecks pass; Prisma client generated.
- [ ] Alpha and real DB HTTP create/edit/readback validation: not deployed; no configured local PostgreSQL or alpha authenticated browser is available in this session.
- [x] Headed component/CSS visual evidence at 390/768/1440: before 9/9 and after 12/12. Public list/detail, ordinary create, and shared admin/ordinary image field; console/network errors and horizontal overflow 0. This is presentation verification only, not a live API or upload success substitute. QA runner closes its own browser/server; PID metadata is in each report.
- Canonical create screenshots: `docs/screenshots/team-match-image-slots/{before,after}/{mobile,tablet,desktop}-create.png`; raw capture set/reports: `output/playwright/visual-audit/team-match-image-slots/`. Before refs use `16cf66b63`. Reproduce with `QA_MODE=slots QA_PHASE=before|after QA_BASE_REF=16cf66b63 node scripts/qa/capture-team-match-image-brightness.mjs` (set env through PowerShell on Windows).

### Release binding blocker / reviewable proposed change

Automatic approval review rejected updating the deployment schema pins and accepted manifest hash allowlist: it requires explicit approval for a separate deployment-control task. No deploy/release gate files were changed. Image implementation and local verification are prepared, but the API image will fail the old schema pin until this follow-up is approved and applied.

Canonical LF schema SHA-256 changes from `eef298c3f325d99eb5940e5a466cf6e37404c3291167afcefaa1c572a5ee7930` to `614e05114ddd39e059fc778b078c70a4d71d160c0af4b1a31c18df76d1cdc733` for the single nullable `listImageUrl` column.

| File | Proposed update after explicit approval |
| --- | --- |
| `deploy/Dockerfile.v1-api` | Replace builder schema check and generated-client attestation hash with the new schema hash. |
| `scripts/release/prepare-task168-final-steady-inputs.sh` | Replace the current live-schema pin; preserve the immutable M11 migration hash. |
| `scripts/release/create-alpha-release-manifest.sh` | Replace the current schema pin in validation and its self-test fixture. |
| `deploy/alpha-manifest-common.sh` | Append the new schema hash to the accepted final manifests; retain every predecessor hash for rollback. |

Approval scope is these four local release-binding updates and their focused verification; it does not deploy alpha/production or promote main. Frozen Task 168 cutover schemas/migrations and M11 binding remain unchanged. Linux release-binder execution and actual Docker image build remain unverified in this Windows session.

## 2026-10-03 ended card surface / requested DEV deployment

- User requested DEV-only deployment, then corrected closure visuals: the image and its containing card must darken together.
- [x] Team-match closed cards apply a single `brightness(0.88) grayscale(0.35)` filter to the entire card; remove the extra thumbnail opacity/grayscale so the image is not dimmed twice. Text/badges and click/focus behavior remain in the same card.
- [x] Completed/cancelled/expired league fixtures also use this terminal-state appearance. Upcoming league fixtures and live/completion-pending friendlies remain undimmed.
- [x] Focused lifecycle/render tests 7/7, Web typecheck PASS. Headed actual component/CSS captures before 3/3 + after 3/3 at 390/768/1440; console/network/overflow 0; browser/server cleaned up.
- Evidence: `docs/screenshots/team-match-closed-cards/{before,after}/{mobile,tablet,desktop}-list.png`; reproduce with `QA_MODE=closed`, `QA_PHASE=before|after`, `QA_BASE_REF=16cf66b63` and the same capture runner.
- [ ] DEV-only release: attempted the four proposed schema-binding edits after the DEV-only request. Automatic review rejected them again, stating that deployment authorization did not constitute explicit separate approval for these production/alpha integrity controls. The rejected action made no partial deploy/release edits; no branch push, PR merge, DB migration or deployment occurred.
- Needed next authorization: explicitly approve the four-file schema-binding proposal above for this DEV/alpha release. No main promotion or production deployment is requested or permitted.

### 2026-10-03 DEV upload continuation

- Feature commits `16cf66b63` and `55171ad3c` were pushed to `origin/fix/team-match-image-brightness`. No DEV merge/deployment has occurred.
- Latest `origin/dev` advanced to `a105f40a1490ccf228568084a43610822d7a18da`. Integrated it into the isolated review branch; resolved admin detail and scenario-index conflicts while preserving the new tournament link and both image previews. Admin detail 18/18 and both package typechecks pass after integration.
- The GitHub CLI official device-login request expired without completing authentication. CLI is installed under ignored `output/tools/github-cli/`; no Git credential was extracted, stored or reused for API calls (automatic review rejected that proposed credential reuse).
- The deployment integrity files remain unchanged. Explicit four-file approval was requested again using a selectable approval question; the user can approve the concrete proposal above. GitHub CLI login and this approval remain prerequisites for the DEV PR/release flow.

### 2026-10-03 explicit release-binding approval

- User explicitly approved the four deployment configuration edits and DEV deployment; this supersedes the prior authorization blocker. No main/production promotion is authorized.
- Updated current schema pin to `614e05114ddd39e059fc778b078c70a4d71d160c0af4b1a31c18df76d1cdc733` in the Docker builder/attestation, steady-input binder and manifest writer. Appended the pin to stored-manifest validation, retaining predecessor hashes for rollback. Frozen cutover assets and M11 digest are unchanged.
- PASS: digest from committed LF schema; real Git Bash steady-input binder execution using committed LF schema/M11 copies; tampered-schema rejection; all three changed shell scripts syntax; predecessor allowlist and immutable M11 digest checks; git diff --check. Python/jq and Docker are unavailable locally, so full stored-manifest checks and image build remain CI-owned.
- GitHub CLI device authentication is pending. Feature source and approved release bindings are committed and pushed to `origin/fix/team-match-image-brightness`. Committed-tree expand-contract migration gate and full PR diff whitespace check PASS (57 files). No DEV PR/merge, live DB migration or alpha deployment has occurred; normal CLI authentication is the remaining prerequisite for the PR/CI/review/release flow.

### 2026-10-04 DEV release resumed

- User requested DEV upload again after checking remote branches. Integrated latest DEV `8ec820cbb` and platform chat/backfill commit `9bdf16848` into the isolated image branch. Preserved DEV cost guidance and no-overlay list-photo assertions while retaining separate images, platform copy and full closed-card dimming.
- PASS: Web 225 focused tests; API 134 focused tests; API/Web tsc --noEmit. Committed LF schema digest remains the approved pin. Real PostgreSQL integration cannot run locally (no configured DB/Docker); the chat HTTP/backfill integration suite is committed for real-DB validation.
- Expand-contract initially rejected the three data-backfill statements. Reviewed exact SQL pairs for missing-room/participant insert-only conflict no-ops and mandatory active creator rejoin; recorded existing-policy exceptions with rollback entitlement and message/preferences/team-exit preservation rationale. Gate self-test negative controls PASS; no generic SQL allowance added.
- Normal GitHub CLI device login remains pending. DEV PR/CI/Copilot review, merge, migration deployment and actual alpha visual QA are not complete. No main/production mutation.
