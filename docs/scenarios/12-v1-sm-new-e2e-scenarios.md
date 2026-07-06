# V1 SM New E2E Scenario Matrix

이 문서는 `Team Design > 1차 디자인 완료`의 18개 섹션을 기준으로 v1 E2E 시나리오를 정의한다.
각 시나리오는 화면 흐름, API 계약, DB 상태 전이를 함께 검증하는 단위다.

Scenario heading numbers and IDs preserve the source design numbers from
`Team Design.html`, including `00`, `02-1`, `03-1`, and `04-1`, so publishing
work can be checked directly against the design inventory.

## Sources

- Design baseline: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Design section list: `SM_FIRST_DESIGN_COMPLETE_SECTIONS`
- Screen actions: `docs/reference/sm-new-screen-action-inventory.md`
- API contract: `docs/reference/sm-new-api-v1-contract-checklist.md`
- DB design: `docs/reference/sm-new-db-v1-implementation-design.md`
- Runtime plan: `.github/tasks/82-sm-new-rebuild-plan.md`

## Runtime Preflight

- V1 stack: `make dev-v1`
- V1 web: `http://localhost:3013`
- V1 API: `http://localhost:8121/api/v1`
- V1 DB: `teameet_v1_dev` inside `v1_postgres`
- Existing app stack is reference-only for these scenarios.
- Initial implementation may use temporary v1 development auth headers such as `x-v1-user-id` or `x-v1-user-email`.

## Status Convention

- `[ ]` Not implemented or not run
- `[~]` Implemented surface exists, latest E2E evidence pending
- `[x]` Verified against v1 runtime
- `Deferred`: v1 must show honest disabled/read-only/no-real-transaction UI, not a successful fake flow

## Global E2E Rules

- Every list/detail route validates loading, empty, error, retry, and successful data states.
- Every mutation validates success, duplicate submit, stale status conflict, permission denied, and refetch after mutation.
- Every create/edit route validates required fields, unknown UI-only field stripping, invalid time/state, and reload persistence.
- Every state-changing API validates DB state plus `v1_status_change_logs` where required.
- Every admin mutation validates `v1_admin_action_logs` plus target `v1_status_change_logs`.
- Payment/refund/dispute, marketplace, lessons, venue owner/operator, tournament, DM, permanent team chat, and file attachment are not v1 core E2E success flows.

## Source Design Inventory

| Design No | Design section | Scenario group |
|---|---|---|
| 00 | `core-shell-sm-final` | `V1-00-*` Core Shell |
| 01 | `auth-onboarding-sm-final` | `V1-01-*` Auth And Onboarding |
| 02 | `home-discovery-sm-final` | `V1-02-*` Home Discovery |
| 02-1 | `home-notice-sm-final` | `V1-02-1-*` Notice |
| 03 | `matches-core-sm-final` | `V1-03-*` Personal Match Browse And Join |
| 03-1 | `matches-core-sm-create-final` | `V1-03-1-*` Personal Match Create And Edit |
| 04 | `teams-team-matches-sm-revision-4` | `V1-04-*` Team Match Browse And Apply |
| 04-1 | `teams-team-matches-sm-create-final` | `V1-04-1-*` Team Match Create And Edit |
| 05 | `team-browse-sm-revision-5` | `V1-05-*` Team Browse And Join |
| 06 | `community-sm-final` | `V1-06-*` Community, Chat, Notifications |
| 07 | `my-profile-trust-sm-revision` | `V1-07-*` My, Profile, Trust |
| 08 | `payments-support-sm-revision` | `V1-08-*` Payment And Support Deferred Surfaces |
| 09 | `settings-states` | `V1-09-*` Settings |
| 10 | `public-marketing-sm-revision` | `V1-10-*` Public Marketing |
| 11 | `desktop-web` | `V1-11-*` Desktop Web |
| 12 | `admin-ops-sm-revision` | `V1-12-*` Admin Operations |
| 13 | `common-flows-motion` | `V1-13-*` Common Flows And Motion |
| 14 | `reviews-post-event-sm-final` | `V1-14-*` Post-event Reviews |

## 00. Core Shell

Source design no: `00`

Design section: `core-shell-sm-final`

Primary contracts:
`GET /notifications`, `PATCH /notifications/:notificationId/read`, domain list/search APIs.

DB evidence:
`v1_notifications`

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-00-001 | Bottom nav moves between `home`, `matches`, `team-matches`, `teams`, `my` | Active tab, URL, and shell state remain consistent after navigation and reload |
| V1-00-002 | Top bell opens notification center from home and detail screens | Unread count is shown, list loads from API, back returns to source route |
| V1-00-003 | Back/search shell preserves list context | Query/filter context survives detail back navigation |
| V1-00-004 | Filter sheet draft/apply/reset | Draft changes do not call API until apply; reset restores default list |
| V1-00-005 | Retry from shell-level network failure | Same route/query/filter is retried and stale results are not applied |
| V1-00-006 | Sticky CTA double click protection | One mutation request wins; duplicate click shows locked/pending UI |

## 01. Auth And Onboarding

Source design no: `01`

Design section: `auth-onboarding-sm-final`

Primary contracts:
`GET /auth/me`, `POST /auth/oauth/:provider/callback`, `POST /auth/email/login`, `POST /auth/signup`,
`GET /terms/current`, `POST /terms/consents`, `GET /onboarding`,
`PATCH /onboarding/preferences`, `POST /onboarding/complete`, `POST /onboarding/defer`.

DB evidence:
`v1_users`, `v1_auth_identities`, `v1_user_profiles`, `v1_user_onboarding_progress`,
`v1_user_terms_consents`, `v1_user_sport_preferences`, `v1_user_regions`,
`v1_notification_preferences`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-01-001 | Email signup requires current terms consent | Required terms gate signup; successful signup creates user/profile/identity/consents |
| V1-01-002 | Signup field validation | Duplicate email/nickname and password mismatch stay inline with input preserved |
| V1-01-003 | Email login success and account-state routing | Completed user enters `/home`; incomplete user resumes onboarding; blocked user cannot enter app |
| V1-01-004 | OAuth provider callback states | signed-in, needs-terms, missing-email, conflict, denied, and blocked states route correctly |
| V1-01-005 | Onboarding sport/level/region save | Sport minimum guard, level required per sport, region empty allowed |
| V1-01-006 | Onboarding resume after reload | Partial selections hydrate from API and current step is restored |
| V1-01-007 | Onboarding complete/defer | Complete requires sport+level; defer enters limited home and records deferred status |
| V1-01-008 | Unknown DTO fields are rejected | UI-only fields are stripped before submit or server returns `VALIDATION_FAILED` |

## 02. Home Discovery

Source design no: `02`

Design section: `home-discovery-sm-final`

Primary contracts:
`GET /home`, `GET /home/recommendations`, `GET /search`, `GET /notices`, `GET /notices/:noticeId`.

DB evidence:
`v1_matches`, `v1_match_participants`, `v1_sports`, `v1_regions`, `v1_notices`,
`v1_notifications`, preference and reputation tables.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-02-001 | Home loads for guest and authenticated user | Guest sees public shape; user sees personalized summary and unread count |
| V1-02-002 | Featured match card opens detail | Detail route uses selected `matchId` and back returns to home context |
| V1-02-003 | Quick action routing | Matches/team matches/teams route; unresolved my-team shortcut is disabled with copy |
| V1-02-004 | Recommendations refresh | Empty, derived, estimated/sample trust labels are honest and not overclaimed |
| V1-02-005 | Unified search latest-query-wins | Slow old response does not overwrite newer query results |
| V1-02-006 | Search group result routing | Match/team-match/team result rows route to correct detail pages |

## 02-1. Notice

Source design no: `02-1`

Design section: `home-notice-sm-final`

Primary contracts:
`GET /notices`, `GET /notices/:noticeId`.

DB evidence:
`v1_notices`

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-02-1-001 | Notice list cursor pagination | Published notices render; draft/archived notices do not |
| V1-02-1-002 | Notice detail access | Public notice opens for guest; users-only notice requires auth |
| V1-02-1-003 | Notice has no read-state side effect | Opening detail does not create notification/read rows |

## 03. Personal Match Browse And Join

Source design no: `03`

Design section: `matches-core-sm-final`

Primary contracts:
`GET /matches`, `GET /matches/:matchId`, `GET /matches/:matchId/application-eligibility`,
`GET /me/matches`, `POST /matches/:matchId/applications`,
`POST /match-applications/:applicationId/withdraw`,
`GET /matches/:matchId/applications`, `POST /match-applications/:applicationId/approve`,
`POST /match-applications/:applicationId/reject`,
`POST /match-participants/:participantId/cancel-approval`,
`POST /match-participants/:participantId/mark-cancelled`.

DB evidence:
`v1_matches`, `v1_match_applications`, `v1_match_participants`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-03-001 | Match list filter/search/sort | URL or draft filter state preserves selected query after reload |
| V1-03-002 | Match detail CTA states | Own match, already requested, approved, full, closed, cancelled, and guest states lock CTA correctly |
| V1-03-003 | Apply to match | Application row becomes `requested`; CTA changes to pending without payment copy |
| V1-03-004 | Withdraw application | Application becomes `withdrawn`; duplicate withdraw converges or returns processed conflict |
| V1-03-005 | Host approves applicant | Application approved, participant active, capacity updates, status log exists |
| V1-03-006 | Host rejects applicant | Application rejected, no participant row created, applicant sees rejected state |
| V1-03-007 | Host cancels approval | Participant removed, application history preserved |
| V1-03-008 | Participant cancellation handling | Host marks participant cancelled; participant no longer counted as active |

## 03-1. Personal Match Create And Edit

Source design no: `03-1`

Design section: `matches-core-sm-create-final`

Primary contracts:
`POST /matches`, `GET /matches/:matchId/edit`, `PATCH /matches/:matchId`, `POST /matches/:matchId/cancel`.

DB evidence:
`v1_matches`, `v1_match_participants`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-03-1-001 | Create match stepper happy path | Sport/info/place/time/confirm create recruiting match and host participant |
| V1-03-1-002 | Create validation | Missing sport/title/time/capacity and invalid end-before-start block submit |
| V1-03-1-003 | Image field behavior | One representative image URL is saved or upload-disabled UI stays honest |
| V1-03-1-004 | Edit prefill and save | Host sees current fields; save updates DB and detail after reload |
| V1-03-1-005 | Edit permission denied | Non-host cannot open edit or receives permission recovery UI |
| V1-03-1-006 | Cancel match | Host cancel changes status, logs transition, locks future applications |

## 04. Team Match Browse And Apply

Source design no: `04`

Design section: `teams-team-matches-sm-revision-4`

Primary contracts:
`GET /team-matches`, `GET /team-matches/:teamMatchId`,
`GET /team-matches/:teamMatchId/application-eligibility`, `GET /me/team-matches`,
`POST /team-matches/:teamMatchId/applications`,
`POST /team-match-applications/:applicationId/withdraw`,
`GET /team-matches/:teamMatchId/applications`,
`POST /team-match-applications/:applicationId/approve`,
`POST /team-match-applications/:applicationId/reject`,
`POST /team-matches/:teamMatchId/close`,
`POST /team-matches/:teamMatchId/reopen`,
`POST /team-matches/:teamMatchId/complete`.

DB evidence:
`v1_team_matches`, `v1_team_match_applications`, `v1_teams`, `v1_team_memberships`,
`v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-04-001 | Team match list filter/search/sort | Team match list preserves context and excludes cancelled/archived entries as contracted |
| V1-04-002 | Team match detail eligibility | User sees eligible applicant teams only when owner/manager |
| V1-04-003 | Apply with managed team | Application becomes `requested`; host team cannot apply to itself |
| V1-04-004 | Withdraw team match application | Applicant team owner/manager can withdraw; member cannot |
| V1-04-005 | Approve applicant team | Application approved, team match becomes `matched`, only one approved team remains |
| V1-04-006 | Reject applicant team | Application rejected, team match remains recruiting if no approved team |
| V1-04-007 | Close and reopen recruiting | Host owner/manager closes recruiting, pending applications become `expired`, and closed match can reopen before start |
| V1-04-008 | Complete matched team match | Host owner/manager completes a matched team match and review surfaces unlock |
| V1-04-009 | Team match notifications | Apply, withdraw, approve, reject, close, cancel, and complete create team-match notifications for affected team managers |

## 04-1. Team Match Create And Edit

Source design no: `04-1`

Design section: `teams-team-matches-sm-create-final`

Primary contracts:
`POST /team-matches`, `GET /team-matches/:teamMatchId/edit`,
`PATCH /team-matches/:teamMatchId`, `POST /team-matches/:teamMatchId/close`,
`POST /team-matches/:teamMatchId/reopen`, `POST /team-matches/:teamMatchId/cancel`,
`POST /team-matches/:teamMatchId/complete`.

DB evidence:
`v1_team_matches`, `v1_teams`, `v1_team_memberships`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-04-1-001 | Create team match as owner/manager | Selected host team creates recruiting team match |
| V1-04-1-002 | Create permission guard | Regular member or non-member cannot choose team or submit |
| V1-04-1-003 | Cost/free invitation fields | No payment API is called; cost note is text-only |
| V1-04-1-004 | Edit team match | Owner/manager sees prefilled form and persisted update |
| V1-04-1-005 | Cancel team match | Status changes to cancelled and pending applications lock |

## 05. Team Browse And Join

Source design no: `05`

Design section: `team-browse-sm-revision-5`

Primary contracts:
`GET /teams`, `GET /teams/:teamId`, `GET /teams/:teamId/join-eligibility`,
`GET /me/teams`, `POST /teams`, `PATCH /teams/:teamId`,
`GET /teams/:teamId/members`, `PATCH /team-memberships/:membershipId/role`,
`POST /team-memberships/:membershipId/remove`,
`POST /teams/:teamId/join-applications`,
`POST /team-join-applications/:applicationId/withdraw`,
`GET /teams/:teamId/join-applications`,
`POST /team-join-applications/:applicationId/approve`,
`POST /team-join-applications/:applicationId/reject`.

DB evidence:
`v1_teams`, `v1_team_profiles`, `v1_team_memberships`, `v1_team_join_applications`,
`v1_team_trust_scores`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-05-001 | Team browse filter/search | List filters by sport/region/trust and keeps context after reload |
| V1-05-002 | Team detail join eligibility | Approval-required team allows request; closed team shows disabled copy |
| V1-05-003 | Submit team join request | Application row becomes `requested`; open instant join is never shown |
| V1-05-004 | Withdraw team join request | Applicant can withdraw and detail CTA resets correctly |
| V1-05-005 | Owner/manager approve join | Application approved, membership active, member count updates |
| V1-05-006 | Owner/manager reject join | Application rejected and user remains non-member |
| V1-05-007 | Team member management | Owner changes role, manager limit is enforced, member removal persists |

## 06. Community, Chat, Notifications

Source design no: `06`

Design section: `community-sm-final`

Primary contracts:
`GET /chat/rooms`, `POST /chat/rooms/resolve`, `GET /chat/rooms/:roomId`,
`GET /chat/rooms/:roomId/messages`, `POST /chat/rooms/:roomId/messages`,
`PATCH /chat/rooms/:roomId/me`, `POST /chat/rooms/:roomId/leave`,
`GET /notifications`, `PATCH /notifications/:notificationId/read`,
`POST /notifications/read-all`, `GET /notification-preferences`, `PATCH /notification-preferences`.

DB evidence:
`v1_chat_rooms`, `v1_chat_room_participants`, `v1_chat_messages`,
`v1_notifications`, `v1_notification_preferences`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-06-001 | Chat list shows linked rooms only | Match/team-match rooms appear; DM/team permanent room entry is absent or disabled |
| V1-06-002 | Resolve linked chat room | Eligible participant resolves or creates one room; unauthorized user is denied |
| V1-06-003 | Send text message | Message persists, latest room preview updates, duplicate idempotency handled |
| V1-06-004 | Pin/unpin and leave room | Participant state persists after reload; leaving hides room or marks left |
| V1-06-005 | Notification list and deep link | Row read state updates and explicit navigation reaches target route |
| V1-06-006 | Mark all read | All unread rows get `read_at`; duplicate call remains successful |
| V1-06-007 | Notification preferences | Toggle save persists and reload hydrates server state |

## 07. My, Profile, Trust

Source design no: `07`

Design section: `my-profile-trust-sm-revision`

Primary contracts:
`GET /me/profile`, `PATCH /me/profile`, `GET /users/:userId/public-profile`,
`GET /me/matches`, `GET /me/team-matches`, `GET /me/teams`,
domain manage APIs from match/team/team-match sections.

DB evidence:
`v1_users`, `v1_user_profiles`, `v1_user_reputation_summaries`,
`v1_matches`, `v1_match_applications`, `v1_match_participants`,
`v1_teams`, `v1_team_memberships`, `v1_team_matches`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-07-001 | My page summary | Profile, reputation, activity links, and trust state render from API |
| V1-07-002 | Edit profile | Nickname/avatar validation and persistence after reload |
| V1-07-003 | Public profile trust labels | verified/estimated/sample/none are visually distinct and not misleading |
| V1-07-004 | My matches joined/created | Toggle uses correct API role and opens correct manage/detail route |
| V1-07-005 | Created match manage from My | Applicant approval/rejection works from My route and reflects in detail |
| V1-07-006 | My team matches manage | Applicant team profile opens; approve/reject updates team match status |
| V1-07-007 | My teams by role | Owner/manager/member roles render and member manage entry is role-gated |
| V1-07-008 | Deferred permanent team chat | Team chat entry is disabled/read-only unless linked chat is available |

## 08. Payment And Support Deferred Surfaces

Source design no: `08`

Design section: `payments-support-sm-revision`

Primary contracts:
No v1 payment/refund/dispute API.

DB evidence:
No v1 payment/refund/dispute tables.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-08-001 | Match/team-match CTA does not imply real payment | CTA copy maps to application request, not checkout |
| V1-08-002 | Payment history/detail route if visible | Surface is disabled/read-only/test-only and makes no payment API call |
| V1-08-003 | Refund/support action if visible | Action is blocked with deferred copy and no fake success state |

## 09. Settings

Source design no: `09`

Design section: `settings-states`

Primary contracts:
`GET /me/settings`, `PATCH /me/settings`, `GET /terms/current`,
`GET /notification-preferences`, `PATCH /notification-preferences`,
`POST /auth/logout`, `POST /me/withdrawal-request`.

DB evidence:
`v1_users`, `v1_auth_identities`, `v1_user_profiles`, `v1_terms_documents`,
`v1_user_terms_consents`, `v1_notification_preferences`, `v1_status_change_logs`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-09-001 | Settings hydrate | Account, profile visibility, notification prefs, legal links render from API |
| V1-09-002 | Save settings | Visibility and preference changes persist after reload |
| V1-09-003 | Legal document view | Terms/privacy current versions are readable from shared terms API |
| V1-09-004 | Logout | Session clears and protected routes show auth wall/login |
| V1-09-005 | Withdrawal request | Account becomes `withdrawal_pending`, status log exists, app shows recovery/hard-stop copy |
| V1-09-006 | Unsupported email/password changes | If UI exists, it is disabled or clearly deferred |

## 10. Public Marketing

Source design no: `10`

Design section: `public-marketing-sm-revision`

Primary contracts:
Optional public reads from `GET /home`, `GET /matches`, `GET /team-matches`, `GET /teams`.

DB evidence:
Public domain read tables only.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-10-001 | Landing start flow | Start CTA routes to login/signup without requiring old app routes |
| V1-10-002 | Public entry cards | Public match/team/team-match previews use public APIs or explicit sample labels |
| V1-10-003 | Public stats honesty | Sample/derived stats are labelled and not shown as verified operational truth |

## 11. Desktop Web

Source design no: `11`

Design section: `desktop-web`

Primary contracts:
Same v1 mobile/domain APIs; no separate desktop API by default.

DB evidence:
Same as active domain.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-11-001 | Desktop shell responsive layout | Nav/search/filter affordances work without mobile-only overlap |
| V1-11-002 | Desktop match search | Wider filter layout calls same `GET /matches` contract |
| V1-11-003 | Desktop keyboard flow | Enter submits search, Escape closes sheets/dialogs, focus remains visible |
| V1-11-004 | Desktop detail/manage parity | Desktop detail exposes the same CTA states and permission locks as mobile |

## 12. Admin Operations

Source design no: `12`

Design section: `admin-ops-sm-revision`

Primary contracts:
`GET /admin/me`, `GET /admin/overview`, `POST /admin/users/:userId/status`,
`POST /admin/matches/:matchId/status`, `POST /admin/teams/:teamId/status`,
`POST /admin/team-matches/:teamMatchId/status`,
`GET /admin/action-logs`, `GET /admin/status-change-logs`.

DB evidence:
`v1_admin_users`, `v1_admin_action_logs`, `v1_status_change_logs`, target domain tables.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-12-001 | Admin auth gate | Non-admin user is denied; active admin enters dashboard |
| V1-12-002 | Overview queues | Counts link to filtered operational targets and handle empty state |
| V1-12-003 | User status change | Reason required; user status changes; admin and status logs are created |
| V1-12-004 | Match/team/team-match status change | Target status changes and affected user-facing CTAs lock after refetch |
| V1-12-005 | Audit log filters | Action/status logs filter by target, actor, status, and cursor paginate |

## 13. Common Flows And Motion

Source design no: `13`

Design section: `common-flows-motion`

Primary contracts:
All v1 list/detail/mutation APIs.

DB evidence:
All mutable v1 tables plus audit/status logs where applicable.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-13-001 | List state atlas | Loading, empty, error, retry, success, and pagination states exist for every list |
| V1-13-002 | Detail state atlas | Loading, not found/archived, permission denied, stale CTA, and success states exist |
| V1-13-003 | Create/edit parity | Edit uses same validation/control language as create and prefilled values are real |
| V1-13-004 | Mutation idempotency | Required mutations handle repeated `Idempotency-Key` and conflicting payloads |
| V1-13-005 | Stale state conflict | Two actors changing same target produce latest-state recovery, not fake success |
| V1-13-006 | Navigation after optimistic mutation | Navigation is not lost when mutation invalidates/reorders/unmounts list rows |

## 14. Post-event Reviews

Source design no: `14`

Design section: `reviews-post-event-sm-final`

Primary contracts:
`GET /reviews?tab=pending|written`, `GET /reviews/received`,
`GET /reviews/sources/:sourceType/:sourceId`, `POST /reviews`.

Reviewable completed personal matches and team matches, review target eligibility,
star rating `1-5`, one or more predefined review tags, idempotent review submit,
written review list, received review grouping.

DB evidence:
`v1_matches`, `v1_match_participants`, `v1_team_matches`,
`v1_team_match_applications`, `v1_team_memberships`,
`v1_post_event_reviews`, `v1_post_event_review_tags`,
`v1_user_reputation_summaries`, `v1_team_trust_scores`.

| ID | Scenario | Expected E2E assertion |
|---|---|---|
| V1-14-001 | Personal match review unlocks after completion | A completed personal match where the user has `active` or `completed` participation appears in `/my/reviews?tab=pending`; self-review is excluded; submitted user-target reviews reduce remaining count |
| V1-14-002 | Team match review unlocks for representative team actor | A completed team match with host and approved applicant teams appears for a current active owner/manager of exactly one participating team; target is the opposing team and reviewer team context is shown |
| V1-14-003 | Submit rating and predefined tags | Source page accepts rating `1-5` plus one or more predefined tag codes, posts DTO-compatible payload, creates review/tag records, and navigates to completion or written state without free-text review body |
| V1-14-004 | Duplicate review convergence | Re-submitting the same reviewer, target, source tuple returns existing review data with `alreadySubmitted: true` and does not create duplicate review/tag records |
| V1-14-005 | Ineligible and locked source handling | Not completed, cancelled, not-participated, self-target, already submitted, missing opponent, non-manager team actor, and ambiguous two-team-manager cases show concrete lock/error reasons rather than fake success |
| V1-14-006 | Written and received review surfaces | Written reviews appear in `/my/reviews?tab=written`; received reviews appear in `/my/reviews/received` grouped by event and separated between user reviews and managed-team reviews |
| V1-14-007 | Reputation and trust score recalculation | Personal match reviews recalculate target `V1UserReputationSummary`; team match reviews recalculate target `V1TeamTrustScore` with `1-2` reviews as `estimated` and `3+` as `verified` |

Validation evidence:

- 2026-06-05: Task 89 `89-11` completed. `pnpm v1:db:generate`, API/Web `tsc --noEmit`, backend unit suite `87/87`, targeted review view-model test `1/1`, and review route responsive smoke `29 routes x 3 viewports` passed with 0 issues. Report: `output/playwright/v1-responsive-smoke/reviews-responsive-smoke-final/report.md`.

## Suggested Automation Files

Initial E2E specs should be split by product journey, not by API module.

```text
e2e/v1/auth-onboarding.spec.ts
e2e/v1/home-notice-search.spec.ts
e2e/v1/matches.spec.ts
e2e/v1/team-matches.spec.ts
e2e/v1/teams.spec.ts
e2e/v1/chat-notifications.spec.ts
e2e/v1/my-settings.spec.ts
e2e/v1/admin.spec.ts
e2e/v1/deferred-and-responsive.spec.ts
```

## Recommended Execution Order

1. `V1-01-*` auth/onboarding because all protected flows depend on personas.
2. `V1-02-*`, `V1-02-1-*` home/search/notice because these are mostly read paths.
3. `V1-03-*`, `V1-03-1-*` personal match lifecycle.
4. `V1-05-*` team browse/create/member management because team match depends on managed teams.
5. `V1-04-*`, `V1-04-1-*` team match lifecycle.
6. `V1-06-*` chat/notifications after match/team-match linked targets exist.
7. `V1-07-*`, `V1-09-*` my/profile/settings.
8. `V1-12-*` admin/audit.
9. `V1-08-*`, `V1-10-*`, `V1-11-*`, `V1-13-*` deferred honesty, public, desktop, and common state sweep.
