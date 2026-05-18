# Task 82 -- SM New Full Rebuild Plan

Owner: codex
Status: Implementation in progress
Priority: P0
Target: both
Mode: CODE

## 1. Purpose

SM New는 기존 Teameet 프론트엔드/백엔드를 부분 수정하는 작업이 아니다.
목표는 현재 저장소의 실행 환경, 문서, QA, 배포 기반은 유지하되 제품 코드와
도메인 계약을 SM New 기준으로 다시 설계하고 새로 구현하는 것이다.

이 문서는 다음 결정을 고정한다.

- 기존 저장소를 버리지 않는다.
- 기존 `apps/web`, `apps/api`의 구현은 참조 자료로만 본다.
- SM New planning 결과물은 같은 모노레포 안에서 `apps/v1_api`, `apps/v1_web` 신규 앱으로 병행 구축한다.
- v1은 기존 DB가 아니라 신규 DB를 사용한다.
- 기존 서비스 코드를 바로 삭제하거나 대량 치환하지 않는다.
- SM New v1이 기능/검증 기준을 통과한 뒤 cutover 여부를 결정한다.

## 1.1 Current Decision Summary

As of 2026-05-18, the working direction is locked to v1-only feature
completion. Do not plan or implement a v2 path in this task.

Confirmed decisions:

- `SM New` remains the planning codename only.
- Implementation names use `v1`.
- V1 is built in the same monorepo, not a new repository.
- V1 uses new apps:
  - `apps/v1_api`
  - `apps/v1_web`
- V1 uses a new DB:
  - local dev DB name: `teameet_v1_dev`
  - Docker service: `v1_postgres`
- V1 DB objects still use explicit `v1_` names:
  - tables: `v1_*`
  - Prisma models: `V1*`
- Existing `apps/api`, `apps/web`, and the existing DB are not deleted or
  directly replaced during v1 feature development.
- Existing app and v1 app should keep the same general Docker/domain/runtime
  structure, with v1-specific service names and ports while running in
  parallel.
- Design implementation uses `Team Design > 1차 디자인 완료` as the visual
  baseline.
- Delivery order is:

```text
Prisma/data model -> API features -> frontend contract -> design binding -> QA/cutover review
```

## 2. Source Of Truth

SM New 구현 기준 문서는 아래 순서를 따른다.

1. `docs/reference/sm-new-api-db-baseline.md`
2. `docs/reference/sm-new-screen-action-inventory.md`
3. `docs/reference/sm-new-db-v1-table-decision-checklist.md`
4. `docs/reference/sm-new-api-surface-map.md`
5. `docs/reference/sm-new-api-v1-contract-checklist.md`
6. `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
7. Existing code under `apps/api` and `apps/web` as reference-only evidence

기존 구현 문서인 `docs/api/**`, 기존 Prisma schema, 기존 page/controller는
"현재 무엇이 있는지"를 알려주는 자료일 뿐 SM New 요구사항의 source of truth가
아니다.

## 3. Rebuild Strategy

### Recommended Path

Use an in-repo parallel rebuild with new apps and a new database. `SM New` is
the planning codename in reference documents; implementation naming should use
`v1`.

```text
Existing product:
apps/web
apps/api
existing dev/prod DB

New v1 product:
apps/v1_web
apps/v1_api
new v1 dev/prod DB
```

The existing app remains runnable while SM New is built. This protects the
current codebase and current data from a long broken transition and allows
side-by-side QA.

### Runtime Boundary

Recommended local runtime:

```text
Existing web: http://localhost:3003
Existing api: http://localhost:8111/api/v1

v1 web: http://localhost:3013
v1 api: http://localhost:8121/api/v1
v1 DB: teameet_v1_dev
```

The v1 API can use `/api/v1/*` inside `apps/v1_api` because it runs as a
separate server. Do not mount v1 under existing `apps/api` as
`/api/v1/sm-new/*` unless this decision is explicitly reversed.

### Database Boundary

Use a new database for v1 instead of adding prefixed tables to the existing
database.

```text
Existing DB: teameet_dev / current production DB
v1 DB:       teameet_v1_dev / v1 production candidate DB
```

V1 table names must use a `v1_` prefix even though the database itself is
isolated. This keeps every newly added database object visibly tied to the v1
runtime.

```text
Tables: v1_users, v1_matches, v1_teams, ...
Prisma models: V1User, V1Match, V1Team, ...
```

Prisma schema and migrations live under `apps/v1_api`.

```text
apps/v1_api/prisma/schema.prisma
apps/v1_api/prisma/migrations/
apps/v1_api/prisma/seed.ts
```

Initial v1 development should not share old auth/user tables. Create v1 users,
auth identities, profiles, and seed accounts in the v1 DB. Existing user/data
migration becomes a cutover task, not a v1 feature-development blocker.

### Why Not A Fresh Repository

A new repository would require re-creating or moving Docker, Prisma, QA scripts,
Playwright setup, deployment, design references, and task history. The current
repository already has those assets and recent SM New planning commits.

### Why Not Direct Replacement

Directly replacing `apps/web` and `apps/api` would create a large unstable
window. Current domain names also conflict with SM New planning names:

- Existing `Team` means personal match internal team.
- Existing `SportTeam` means service team.
- SM New should use clear names like `team`, `match_application`,
  `match_participant`, and `match_side`.

### Why Not Same-App Slice

The earlier candidate was to add `apps/api/src/sm-new/**` and
`apps/web/src/app/(sm-new)/**`. That is no longer the recommended path.

Reasons:

- Existing Prisma models and DB tables already contain conflicting concepts.
- Existing frontend hooks/components carry old API assumptions.
- New DB development is cleaner when the Prisma schema belongs to a new API app.
- V1 completion is faster if old runtime regressions are kept out of the
  critical path.

## 4. Scope For SM New v1

### Team Design First Complete Baseline

The current SM New v1 planning baseline is `Team Design > 1차 디자인 완료`.
The canonical source is:

```text
docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html
SMNewViewerGuide > 1차 디자인 완료
SM_FIRST_DESIGN_COMPLETE_SECTIONS
```

This mode contains 17 sections:

| No | Section id | Product area | v1 implementation stance |
|---:|---|---|---|
| 1 | `core-shell-sm-final` | App shell, top bar, 5-tab bottom nav, search/notification entry | Implement |
| 2 | `auth-onboarding-sm-final` | Login, signup, terms, onboarding preferences | Implement |
| 3 | `home-discovery-sm-final` | Home aggregate, recommendations, quick actions, search/notice entry | Implement |
| 4 | `home-notice-sm-final` | Notice list/detail | Implement as read-only notices |
| 5 | `matches-core-sm-final` | Personal match list/detail/join/manage states | Implement |
| 6 | `matches-core-sm-create-final` | Personal match create/edit/cancel | Implement |
| 7 | `teams-team-matches-sm-revision-4` | Team match list/detail/apply/manage | Implement |
| 8 | `teams-team-matches-sm-create-final` | Team match create/edit/cancel | Implement |
| 9 | `team-browse-sm-revision-5` | Team browse/detail/join flow | Implement |
| 10 | `community-sm-final` | Chat and notifications | Implement only linked match/team-match chat and in-app notifications |
| 11 | `my-profile-trust-sm-revision` | My page, profile, trust/reputation | Implement core profile/trust states |
| 12 | `payments-support-sm-revision` | Payment, refund, support/dispute surfaces | Defer real transaction/support flows; use disabled/read-only/test-only copy if displayed |
| 13 | `settings-states` | Settings, account, notification preferences, withdrawal | Implement basic settings/account states |
| 14 | `public-marketing-sm-revision` | Public/marketing surface | Defer unless launch route requires it |
| 15 | `desktop-web` | Desktop responsive treatment | Implement only after mobile core is stable |
| 16 | `admin-ops-sm-revision` | Admin operations | Implement minimum admin/audit only |
| 17 | `common-flows-motion` | Shared states, motion, interaction rules | Apply as UI/QA rules, not a separate backend scope |

The practical v1 product slice is:

```text
core shell
auth/onboarding
home
notice
personal match
team browse/join
team match
linked chat
notifications
my/profile/trust
basic settings
admin minimum
```

The practical v1 deferred slice is:

```text
real payment
refund
dispute/support case handling
marketplace
lessons
venue owner/operator flows
tournaments
1:1 DM
permanent team chat
chat file attachment
full admin ops
full desktop-specific rebuild
advanced motion polish
```

This means the 17 design sections are valid as the planning baseline, but not
every visual surface becomes a full v1 backend feature. Deferred surfaces must
still have honest UI treatment: disabled state, read-only state, or explicit
test-only/no-real-transaction copy.

### In Scope

- Auth/session baseline
- Onboarding
- Home/discovery
- Notice read-only flow
- Personal match browse/detail/create/edit/apply/manage
- Team browse/detail/create/edit/join/manage
- Team match browse/detail/create/edit/apply/manage
- Match-linked and team-match-linked chat
- In-app notifications and read state
- My/profile/trust surfaces needed by the above flows
- Admin/audit primitives needed to operate v1
- Shared mobile shell with 5 tabs:
  - home
  - matches
  - team-matches
  - teams
  - my

### Deferred

- Real payment
- Refund lifecycle
- Payment disputes
- Marketplace
- Lessons
- Venue owner/operator self-service
- 1:1 DM
- Permanent team chat
- Chat file attachment
- Tournament feature set
- Advanced AI matching beyond deterministic recommendations

Deferred domains remain outside the current v1 completion target.

## 5. Backend Plan

### App Boundary

Create a new Nest app:

```text
apps/v1_api/
  prisma/
    schema.prisma
    seed.ts
  src/
    main.ts
    app.module.ts
  common/
  auth/
  onboarding/
  home/
  notices/
  matches/
  teams/
  team-matches/
  chat/
  notifications/
  profile/
  admin/
```

All v1 controllers should be mounted under:

```text
/api/v1
```

Existing controllers in `apps/api` remain unchanged during the rebuild. The
port/app boundary keeps existing `/api/v1/*` and new v1 `/api/v1/*` from
colliding.

### API Contract

Use the same global success envelope:

```text
{ status: "success", data, timestamp }
```

Use a stricter error shape in v1 services and filters where possible:

```text
{ status: "error", statusCode, code, message, details?, timestamp }
```

All list APIs use cursor pagination by default.

Mutation categories requiring idempotency or explicit state conflict handling:

- match application submit/withdraw/approve/reject
- match participant cancellation handling
- match create/update/cancel
- team join application submit/withdraw/approve/reject
- team membership role change/remove
- team match application submit/withdraw/approve/reject
- team match create/update/cancel
- notification read mutation
- admin state changes

Recommended common error codes:

```text
VALIDATION_FAILED
AUTH_REQUIRED
PERMISSION_DENIED
NOT_FOUND_OR_ARCHIVED
STATE_CONFLICT
DUPLICATE_REQUEST
ALREADY_PROCESSED
RATE_LIMITED
```

### DB Direction

Do not edit the existing `apps/api/prisma/schema.prisma` for v1 feature work.
First produce a concrete v1 Prisma design document from the table decision
checklist, then implement it under `apps/v1_api/prisma/schema.prisma`.

Required DB design outputs before migration:

- Final table list
- Final enum list
- Relation diagram
- Soft-delete policy
- Audit/status-change policy
- Index and unique constraint list
- Seed/mock data plan
- Migration strategy for the new v1 DB
- Explicit post-v1-completion data handling stance for existing production data

Candidate v1 table families:

```text
identity:
v1_users, v1_auth_identities, v1_user_profiles, v1_user_onboarding_progress

terms/master:
v1_terms_documents, v1_user_terms_consents, v1_sports, v1_sport_levels,
v1_regions, v1_notices

preference/home:
v1_user_sport_preferences, v1_user_regions, v1_user_reputation_summaries

personal match:
v1_matches, v1_match_applications, v1_match_participants

team:
v1_teams, v1_team_profiles, v1_team_memberships, v1_team_join_applications,
v1_team_trust_scores

team match:
v1_team_matches, v1_team_match_applications

chat/notification:
v1_chat_rooms, v1_chat_room_participants, v1_chat_messages, v1_notifications,
v1_notification_preferences

admin/audit:
v1_admin_users, v1_admin_action_logs, v1_status_change_logs
```

Payment/support tables are deferred for v1.

### Backend Reuse Candidates

Reuse cautiously:

- Nest app bootstrap patterns
- global validation/filter/interceptor patterns
- auth token issuing/verification primitives
- Redis/socket infrastructure patterns if useful
- upload static serving
- test helper conventions

Do not blindly reuse:

- old `PrismaModule` tied to the existing datasource
- old `matches` state model
- old `SportTeam`/`Team` naming
- old payment participant binding
- old admin mutation shortcuts
- old mock data assumptions

## 6. Frontend Plan

### App Boundary

Create a new Next app:

```text
apps/v1_web/
  src/
    app/
      layout.tsx
      page.tsx
      home/page.tsx
      matches/page.tsx
      matches/new/page.tsx
      matches/[id]/page.tsx
      matches/[id]/edit/page.tsx
      team-matches/page.tsx
      team-matches/new/page.tsx
      team-matches/[id]/page.tsx
      team-matches/[id]/edit/page.tsx
      teams/page.tsx
      teams/new/page.tsx
      teams/[id]/page.tsx
      teams/[id]/edit/page.tsx
      teams/[id]/members/page.tsx
      my/page.tsx
      notifications/page.tsx
      chat/[id]/page.tsx
      onboarding/page.tsx
      admin/page.tsx
    components/
    hooks/
    types/
    lib/
```

Candidate public entry:

```text
/home
/matches
/team-matches
/teams
/my
```

These routes live on the v1 web server, for example
`http://localhost:3013/home`. After cutover, these can become the production
routes on the main domain.

Do not add the v1 app as an `(sm-new)` route group under existing `apps/web`
unless this decision is explicitly reversed.

### Route Boundary

The v1 web route map starts as:

```text
apps/v1_web/src/app/
  layout.tsx
  home/page.tsx
  matches/page.tsx
  matches/new/page.tsx
  matches/[id]/page.tsx
  matches/[id]/edit/page.tsx
  team-matches/page.tsx
  team-matches/new/page.tsx
  team-matches/[id]/page.tsx
  team-matches/[id]/edit/page.tsx
  teams/page.tsx
  teams/new/page.tsx
  teams/[id]/page.tsx
  teams/[id]/edit/page.tsx
  teams/[id]/members/page.tsx
  my/page.tsx
  notifications/page.tsx
  chat/[id]/page.tsx
  onboarding/page.tsx
```

### UI Boundary

Create v1-specific UI under:

```text
apps/v1_web/src/components/
```

Use existing shared primitives only when they fit the SM design language without
modification. Avoid importing large existing domain components that carry old
data assumptions.

Suggested component groups:

```text
components/shell/
components/home/
components/matches/
components/teams/
components/team-matches/
components/chat/
components/notifications/
components/forms/
components/primitives/
```

### API Hooks

Create a clean v1 API integration surface:

```text
apps/v1_web/src/hooks/
  use-auth.ts
  use-home.ts
  use-matches.ts
  use-teams.ts
  use-team-matches.ts
  use-chat.ts
  use-notifications.ts
  query-keys.ts
  shared.ts
```

Types should start in:

```text
apps/v1_web/src/types/api.ts
```

Move to per-domain files only when the type file becomes difficult to maintain.

### Frontend State Rules

- URL filter pages use local draft state and debounce/replace sync.
- List/detail/create/edit journeys share one control language.
- Mutation CTAs must preserve navigation even if optimistic updates reorder data.
- Empty upload slots should show realistic local mock guidance, not plain grey boxes.
- Trust/reputation signals must distinguish verified, estimated, sample, and none.
- Payment-like copy must not imply real billing in v1.

## 7. Cutover Strategy

### Phase A -- Parallel Prototype Runtime

- Build v1 in `apps/v1_api` and `apps/v1_web`.
- Existing `apps/api`, `apps/web`, existing routes, and existing DB remain
  unchanged.
- Seed/mock data can be v1-specific.
- QA compares SM design reference to v1 web routes on the v1 server.

### Phase B -- API Contract Lock

- Freeze `apps/v1_api` `/api/v1/*` endpoints.
- Add API integration docs under `docs/api/v1/` with a note that `sm-new` is
  the planning codename in reference files.
- Add backend integration tests for state transitions and permissions.
- Add MSW handlers for v1 frontend tests.

### Phase C -- Product Cutover Candidate

- Decide whether `/home`, `/matches`, `/team-matches`, `/teams`, `/my` should
  be served by v1 web or redirected from the existing web app.
- Keep admin and out-of-scope domains on the old app unless a separate
  post-v1 completion decision changes that.
- Run route smoke, focused E2E, and visual audit.

### Phase D -- Old Code Retirement

Only after v1 production candidate routes are stable:

- remove unused old pages
- remove old hooks/types
- retire old backend controllers
- migrate or archive old docs
- plan existing DB to v1 DB migration/backfill or archive posture

## 8. Implementation Waves

### Delivery Pipeline Overview

The practical delivery order is:

```text
API design freeze
-> DB design freeze
-> Prisma migration and seed
-> backend API implementation
-> frontend contract layer
-> v1 design binding
-> integrated QA
-> cutover or continue parallel runtime
```

Each stage must leave a concrete handoff artifact. Do not advance to the next
stage on verbal agreement only.

| Stage | Main question | Output | Hard gate |
|---|---|---|---|
| 0. Scope lock | What exactly is v1? | v1 inclusion/defer list | No ambiguous feature remains in "maybe" state |
| 1. API freeze | What does the frontend call? | endpoint/DTO/error contract | Every screen action has API/deferred/no-op outcome |
| 2. DB freeze | What data supports the API? | ERD, table spec, enum/state/audit plan | Every endpoint field and mutation maps to data |
| 3. App scaffold + Prisma | Can the new apps and schema run? | `apps/v1_api`, `apps/v1_web`, migration, generated client, seed/fixture data | v1 app scaffold builds and v1 migration/seed pass locally |
| 4. Backend | Does the API behave correctly? | `apps/v1_api/src/**` | integration tests cover state/permission/error cases |
| 5. Frontend contract | Can UI consume API safely? | types, hooks, MSW, query keys | hooks cover loading/error/empty/success/mutation states |
| 6. Design binding | Does the v1 UI work with real data? | `apps/v1_web/src/app/**` routes wired to hooks | primary user journeys use v1 API, not hardcoded data |
| 7. QA/cutover | Is it releasable or still parallel? | scenario/E2E/visual/cutover report | cutover decision has blocker and rollback list |

### Stage 0 -- Scope Lock

Purpose:

Fix the SM New v1 boundary before API and DB design become too wide.

Inputs:

- `docs/reference/sm-new-api-db-baseline.md`
- `docs/reference/sm-new-screen-action-inventory.md`
- Current SM design sections
- User/product decisions

Work:

- Divide all design sections into `v1`, `v1-shell-only`, `deferred`, and
  `removed`.
- Runtime starts as a separate v1 web app on its own local port.
- Old auth/session tables are not shared for initial v1 development.
- Decide whether payment/support/admin are disabled, read-only, or excluded.
- Decide whether admin minimum is required before cutover.

Artifacts:

- Update this task doc's scope if the v1 boundary changes.
- Add a compact scope table to `docs/reference/sm-new-api-db-baseline.md` or a
  linked follow-up doc.

Done when:

- [x] Every baseline section is marked v1/deferred/removed.
- [x] Every deferred section has user-facing copy/disabled-state direction.
- [x] Payment/support stance is explicit.
- [x] Admin minimum stance is explicit.
- [x] First runtime route strategy is explicit: `apps/v1_web` on the v1 web server.
- [x] Initial DB strategy is explicit: new v1 DB, no existing DB table reuse.

Risks:

- Letting payment/support back into v1 will expand DB/API state machines.
- Keeping admin vague will block final cutover even if user flows work.

### Stage 1 -- API Design Freeze

Status: Done as a reference contract.

Current frozen artifact:

```text
docs/reference/sm-new-api-v1-contract-checklist.md
Status: v1 contract complete
Progress: 84/84 Done
```

The later `docs/api/v1/**` files should be implementation-facing domain docs
generated from this frozen reference contract instead of reopening endpoint
decisions.

Purpose:

Convert screen actions into a frozen API contract before DB work starts.

Inputs:

- Stage 0 scope decision
- `docs/reference/sm-new-screen-action-inventory.md`
- `docs/reference/sm-new-api-surface-map.md`
- Current design prototype

Work:

- Create the global API contract:
  - base prefix
  - envelope
  - auth/session behavior
  - pagination
  - file/media convention
  - idempotency
  - error shape and error codes
- Create endpoint tables by domain.
- Define request DTO draft for every write endpoint.
- Define response shape for every screen-level read endpoint.
- Define permission and actor for every endpoint.
- Define empty/loading/error/deferred behavior per endpoint where the frontend
  needs it.
- Mark every design action as one of:
  - read endpoint
  - mutation endpoint
  - client-only action
  - no-op in v1
  - deferred after v1

Required API design outputs:

- Global SM New contract:
  - prefix
  - envelope
  - auth requirement rules
  - pagination shape
  - idempotency rule
  - error code catalogue
- Domain endpoint tables:
  - auth/onboarding
  - home/search/notices
  - personal matches
  - teams
  - team matches
  - chat
  - notifications
  - my/profile
  - admin minimum
- DTO draft for every write endpoint.
- Response shape draft for every screen-level read endpoint.
- Permission requirement for every endpoint.
- Deferred/no-op decision for every design action that is not implemented in v1.

Suggested document layout:

```text
docs/api/v1/
  README.md
  global-contract.md
  errors-and-validation.md
  pagination-filtering-and-sorting.md
  auth-and-session.md
  domains/
    onboarding.md
    home-and-notices.md
    matches.md
    teams.md
    team-matches.md
    chat.md
    notifications.md
    my-profile.md
    admin.md
```

API freeze checklist:

- [x] Every row in `sm-new-screen-action-inventory.md` has an API outcome.
- [x] Every mutation has an actor and permission rule.
- [x] Every state-changing mutation has conflict behavior.
- [x] Every list endpoint has cursor, limit, sort/filter behavior.
- [x] Every detail endpoint defines not found, archived, blocked, and permission behavior.
- [x] Every create/update endpoint defines validation errors.
- [x] Every v1-deferred design action has disabled/loading/copy behavior.
- [x] Every response field has a preliminary data source category.
- [ ] Every endpoint has a test case name placeholder.
- [ ] Every endpoint has a frontend hook name placeholder.

Completion note:

- Endpoint/DTO/error/permission/state/deferred decisions are frozen in
  `docs/reference/sm-new-api-v1-contract-checklist.md`.
- Test case names and frontend hook names are intentionally left for Stage 4/5
  task breakdown so they can match the final implementation files.

Done when:

- API documents can be handed to DB design without needing UI screenshots open.
- The frontend route list can be mapped to hook names.
- The backend controller list can be generated from the contract.

Risks:

- Designing endpoint paths from old controllers will carry old assumptions.
- Omitting error and permission behavior now will create frontend rework later.

### Stage 2 -- DB Design From API

After API design is frozen, DB design should be derived from API reads/writes,
not from the existing Prisma schema.

Purpose:

Turn the frozen API into a concrete relational model and migration strategy.

Inputs:

- Stage 1 API contract
- `docs/reference/sm-new-db-v1-table-decision-checklist.md`
- Existing `apps/api/prisma/schema.prisma` as reference-only evidence
- New v1 DB strategy: `apps/v1_api/prisma/schema.prisma`

Work:

- Build field-by-field mapping:
  - API request field -> validation/source table
  - API response field -> table/computed/deferred source
  - mutation -> write set
  - state transition -> enum and audit row
- Implement v1 in a new database. Existing table reuse is out of scope for
  initial v1 feature development.
- Resolve naming collisions:
  - service team vs personal match side
  - application vs participant
  - team match host vs applicant team
  - payment target is deferred
- Define indexes for common queries.
- Define unique constraints for duplicate prevention.
- Define audit and status log table usage.
- Define soft delete, archive, and visibility rules.

Required DB outputs:

- Final entity list.
- ERD with all FK directions.
- Enum and lifecycle table.
- Index/unique constraints.
- Soft-delete and archival rules.
- Status/audit log rules.
- Seed and mock data plan.
- Migration strategy:
  - create and migrate the new v1 DB
  - seed v1 dev/test data
  - document v1 completion post-decision data handling separately

Recommended DB document layout:

```text
docs/reference/sm-new-db-v1-implementation-design.md

Sections:
1. Naming decisions
2. ERD
3. Table catalogue
4. Enum catalogue
5. State lifecycle mapping
6. Permission support mapping
7. Index and unique constraints
8. Audit/status-change rules
9. Seed/mock plan
10. Migration plan
11. Open questions
```

DB design checklist:

- [x] Every API response field has a source: table, computed, external, mock, or deferred.
- [x] Every API mutation has a write set.
- [x] Every lifecycle transition maps to enum/state columns and audit rows.
- [x] Every permission check has enough table data to evaluate it.
- [x] Every common list filter has supporting indexes.
- [x] Every uniqueness rule is enforced in DB where possible.
- [x] Payment/support tables remain deferred unless v1 scope changes.
- [x] Existing table reuse decisions are explicit: no existing DB table reuse for initial v1.
- [x] Post-v1-completion data handling requirement is explicit.
- [x] Seed data ownership is explicit.
- [x] Dev-only mock fields do not leak into production contract.

Done when:

- Prisma changes can be written without inventing new table decisions.
- Backend service tests can create all needed fixtures.
- API documents and DB document agree on names and states.

Risks:

- In-place migration can be faster but may preserve old naming mistakes.
- New-table migration is cleaner but needs cutover/backfill planning.

### Stage 3 -- Prisma And Seed Implementation

Only start this stage after the DB design document is approved.

Purpose:

Implement the approved DB design in Prisma and make it usable by tests and
local runtime.

Inputs:

- Stage 2 DB design
- New `apps/v1_api/prisma/schema.prisma`
- Existing seed/mock conventions as reference-only evidence

Tasks:

- [x] Scaffold `apps/v1_api`.
- [x] Scaffold `apps/v1_web`.
- [x] Add isolated v1 Postgres service and Docker runtime wiring.
- [x] Add initial v1 Prisma runtime check model under
  `apps/v1_api/prisma/schema.prisma`.
- [x] Verify `make dev-v1` starts `v1_postgres`, `v1_api`, and `v1_web`.
- [x] Add full v1 Prisma models under `apps/v1_api/prisma/schema.prisma`.
- [x] Generate migration after the full v1 schema is implemented.
- [x] Add seed data for master tables:
  - sports
  - sport levels
  - regions
  - notices
  - test users
  - test teams
  - test matches
  - test team matches
- [ ] Add fixture factories for integration tests.
- [x] Keep old seed paths intact. V1 seed data lives under `apps/v1_api`.

Implementation order:

1. Add enums.
2. Add master/reference tables.
3. Add identity/profile/onboarding tables.
4. Add match/team/team-match core tables.
5. Add application/participant/member tables.
6. Add chat/notification tables.
7. Add admin/audit tables.
8. Add indexes and unique constraints.
9. Add seed/mock data.
10. Add fixture factories.

Validation:

- `pnpm --filter v1_api db:generate`
- `pnpm --filter v1_api exec prisma migrate dev`
- `pnpm --filter v1_api db:seed`
- Targeted DB smoke through Prisma service or integration test.

Done when:

- Prisma client generates.
- Migration applies to a clean v1 dev DB.
- Existing dev DB is not touched by v1 migrations.
- Seed/mock data creates enough records for all v1 screens.
- Fixture factories can create isolated test data.

Risks:

- Docker/env wiring for the second DB can block local startup.
- Accidentally importing existing `apps/api` Prisma code can reintroduce old DB coupling.
- Seed scripts must avoid destructive full reset unless explicitly requested.

### Stage 4 -- Backend API Implementation

Build backend by vertical slices, but shared SM New common code comes first.

Purpose:

Implement the frozen v1 `/api/v1/*` API with state, permission, validation,
and error behavior matching the contract.

Inputs:

- Stage 1 API contract
- Stage 2 DB design
- Stage 3 Prisma client and fixtures

Backend order:

1. `common`
   - DTO utilities
   - pagination helpers
   - error codes
   - permission helpers
   - idempotency helpers if needed
2. auth/onboarding/master reads
3. home/search/notices
4. personal matches
5. teams
6. team matches
7. chat/notifications
8. my/profile/admin minimum

Per-domain implementation loop:

```text
DTO -> controller route -> service read/write -> permission gate
-> tests -> docs sync -> frontend hook handoff
```

Backend acceptance per domain:

- Controller route exists under `apps/v1_api` `/api/v1`.
- DTO validation rejects non-contract fields.
- Service does not depend on old domain state assumptions.
- Integration tests cover:
  - happy path
  - unauthenticated
  - permission denied
  - not found/archived
  - duplicate request
  - stale state conflict
- Docs and tests use the same endpoint names.

Backend test matrix per stateful domain:

| Case | Required |
|---|---|
| happy path | yes |
| unauthenticated | yes |
| wrong actor | yes |
| owner/manager/member boundary | where applicable |
| duplicate request | yes |
| stale status | yes |
| validation error | yes |
| soft-deleted/archived target | yes |
| idempotent retry | required for configured mutations |

Done when:

- API tests pass for completed domains.
- Swagger or generated docs do not contradict the frozen v1 reference contract.
- Live `localhost:8121/api/v1/*` smoke works when v1 dev stack is running.
- Frontend developers can implement hooks from stable response shapes.

Risks:

- Reusing old service methods can bypass new permission/state rules.
- Controller route shape drift will break hook contracts quickly.
- Optional auth endpoints must keep response shape stable for guest and user.

### Stage 5 -- Frontend Contract Layer

Do not wire screens directly to raw axios calls. Create the v1 frontend
contract layer before UI binding.

Purpose:

Create a stable frontend API boundary so design screens do not know transport
or envelope details.

Inputs:

- Stage 1 API contract
- Stage 4 backend routes or MSW mocks

Tasks:

- Add `apps/v1_web/src/types/api.ts`.
- Add `apps/v1_web/src/hooks/query-keys.ts`.
- Add per-domain hooks under `apps/v1_web/src/hooks/`.
- Add MSW handlers for v1 routes.
- Add frontend tests for hook behavior where state is non-trivial.

Suggested hook files:

```text
apps/v1_web/src/hooks/
  index.ts
  query-keys.ts
  shared.ts
  use-auth.ts
  use-onboarding.ts
  use-home.ts
  use-matches.ts
  use-teams.ts
  use-team-matches.ts
  use-chat.ts
  use-notifications.ts
  use-my.ts
  use-admin.ts
```

Contract layer checklist:

- [ ] All hooks unwrap `{ status, data, timestamp }` consistently.
- [ ] Error states expose `code`, `message`, and optional `details`.
- [ ] Query keys include filter/search state without stale overwrite risk.
- [ ] Mutations invalidate the minimum necessary query keys.
- [ ] Idempotency keys are generated for required mutations.
- [ ] Hooks do not expose raw axios response objects.
- [ ] Hooks provide stable empty states where screens need them.
- [ ] MSW data matches API docs, not old frontend mocks.
- [ ] Optimistic updates do not break navigation.

Done when:

- UI work can proceed without reading backend controller code.
- Hook tests or MSW smoke cover success, empty, validation error, permission
  error, and stale-state conflict.
- Shared types are imported by screens instead of copied locally.

Risks:

- Letting screens build query strings directly will recreate stale filter bugs.
- Importing old API types will hide mismatches until late UI integration.

### Stage 6 -- Design Screen Binding

Once hooks are stable, wire the SM design routes.

Purpose:

Attach the v1 design screens to the frontend contract layer and preserve
the design intent while replacing static data with real API state.

Inputs:

- SM design reference
- Stage 5 hooks and types
- Existing design tokens and `globals.css`

Binding order:

1. `apps/v1_web/src/app/layout.tsx` shell and 5-tab navigation.
2. onboarding/auth-aware entry.
3. home and notice surfaces.
4. matches list/detail/create/manage.
5. teams list/detail/create/manage.
6. team matches list/detail/create/manage.
7. chat and notifications.
8. my/profile/admin minimum.

Binding rules:

- Screen layout may use temporary mock states, but primary data paths must use hooks.
- Keep design placeholder copy only where API state is explicitly deferred.
- Do not silently fall back to old app data if the v1 API fails.
- Do not show payment, refund, or dispute success flows as real in v1.
- Do not import old domain cards if they assume old API shapes.

Per-screen binding checklist:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Error state with retry.
- [ ] Permission/blocked state.
- [ ] Success state with real API data.
- [ ] Mutation pending/disabled state.
- [ ] Post-mutation navigation or invalidation.
- [ ] Mobile layout verified before desktop polish.

Done when:

- Primary user journeys work against the v1 API or MSW with matching contract.
- No production candidate route depends on hardcoded primary data.
- Design comparison gaps are tracked as explicit follow-ups.

Risks:

- Old components may carry old labels, statuses, or payment assumptions.
- Screen-level fallback mocks can accidentally ship as product truth.
- Desktop polish before mobile flow completion will slow v1.

### Stage 7 -- QA And Cutover

QA runs after each vertical slice and again before cutover.

Purpose:

Decide whether v1 remains parallel, replaces selected routes, or becomes
the production app shell.

Inputs:

- Completed vertical slices
- Scenario docs
- E2E/visual audit outputs
- Known blocker list

Required checks:

- API integration tests for each completed domain.
- Web unit tests for hooks and critical UI state helpers.
- Route smoke for every v1 web route.
- Scenario checklist update under `docs/scenarios/`.
- Focused E2E for:
  - signup/onboarding
  - match create/apply/approve
  - team create/join/approve
  - team match create/apply/approve
  - notification read and navigation
  - linked chat open/send/read
- Visual audit against SM design reference for mobile-first screens.

Cutover gate:

- [ ] No critical API contract gaps.
- [ ] No critical DB migration/data blockers.
- [ ] No hardcoded primary data on production candidate screens.
- [ ] No misleading payment/support/admin copy.
- [ ] Old route redirect plan is explicit.
- [ ] Rollback plan is explicit.

Cutover options:

| Option | Meaning | Use when |
|---|---|---|
| Parallel only | Keep `apps/v1_web` internal on a separate host/port | v1 is not complete enough |
| Partial route cutover | Route selected production paths like `/matches` to v1 web | core flow is stable but admin/deferred domains remain old |
| Full app shell cutover | Replace logged-in main shell with v1 web | home/matches/teams/team-matches/my all pass QA |
| New repo extraction | Move SM New elsewhere | only if monorepo constraints become blocking |

Done when:

- A cutover decision is recorded in a follow-up task.
- Known blockers are classified as launch-blocking or post-launch.
- Rollback route and DB rollback posture are documented.
- Old code retirement is scheduled only after cutover success.

Risks:

- Cutover without rollback will make route regressions costly.
- Keeping old and new routes public for too long can confuse QA and users.
- Visual QA can pass while API state transitions still fail, so E2E remains
  mandatory for lifecycle flows.

### Stage Status Board

Use this board as the live stage tracker.

| Stage | Status | Owner | Blocking artifact |
|---|---|---|---|
| 0. Scope lock | Done | product/dev | v1-only scope, deferred stance, runtime route strategy |
| 1. API freeze | Done | product/dev | `docs/reference/sm-new-api-v1-contract-checklist.md` |
| 2. DB freeze | Done | backend/data | v1 state/permission/DB implementation docs closed |
| 3. App scaffold + Prisma | Mostly Done | backend/data + frontend | full v1 Prisma model/seed/migration applied; fixture factories pending |
| 4. Backend | Partial | backend | v1 domain routes and docs implemented; integration/state/idempotency hardening still pending |
| 5. Frontend contract | Partial | frontend/data | first-pass `apps/v1_web` hooks/types/MSW scaffold; route binding pending |
| 6. Design binding | Partial | frontend/ui | active routes now import first-complete design components through `FirstDesignPage`; productization/API binding pending |
| 7. QA/cutover | Pending | QA/dev | scenario/E2E/visual report |

### Current V1 Completion Map

Last reviewed: 2026-05-18 after commit
`ada655c feat: add v1 app baseline and API domains`.

What is done:

- V1 direction is fixed: new in-repo apps `apps/v1_api` and `apps/v1_web`,
  isolated v1 DB, no direct replacement of existing `apps/api` or `apps/web`.
- V1 data design is closed enough for implementation:
  - Prisma schema, migrations, seed, and v1 Docker/runtime wiring exist.
  - v1 tables use `v1_*` names and Prisma models use `V1*` names.
- V1 API 1st-pass domain implementation exists for:
  - health, master, notices
  - auth and onboarding
  - home and recommendations
  - personal matches, create/edit/cancel, applications
  - teams, memberships, join applications
  - team matches, create/edit/cancel, applications
  - linked chat
  - notifications and notification preferences
  - profile/settings/logout no-op/withdrawal request
  - admin minimum/audit
- V1 web has route/design scaffold for the first-complete design surfaces:
  home, search, notices, matches, team matches, teams, my, notifications, and
  chat.
- V1 scenario matrix draft exists at
  `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`.
- Latest verification:
  - `pnpm --filter v1_api build` passed.
  - `pnpm --filter v1_api test` passed with 13 suites and 74 tests.
  - `pnpm --filter v1_web test` passed with 1 test.
  - `pnpm --filter v1_web build` passed when run outside the sandbox.

What is currently in progress:

- Backend is in a "domain routes implemented, hardening pending" state.
  Treat the API as ready for contract documentation and frontend hook handoff,
  not as final release-complete.
- Frontend is back in a design-first import state. Active app routes now render
  exported first-complete design components through `FirstDesignPage` and
  `DesignFrame` so visual parity can be reviewed before productization.
- Documentation now has an implementation-facing v1 API publication under
  `docs/api/v1/**`. It is published from the frozen reference contract and
  current controller/DTO/service evidence, with pending endpoints called out.

What remains for v1 completion:

- Continue binding the first-pass v1 frontend contract layer to screens:
  `apps/v1_web/src/types/api.ts`, API client, domain hooks, query keys, and
  MSW handlers now exist. Core route pages read hooks with mock fallback;
  detail/create/edit/manage scaffolds have first-pass entity/mutation hook names
  with mock fallback. Route params, submit payload shaping, and real mutation
  handlers are still pending.
- Continue the first-design port map from
  `.github/tasks/84-v1-first-design-port-map.md`; core/detail/create/manage
  routes and the missing auth/onboarding/settings/admin/public surfaces now
  point at first-complete design components. Some settings/profile/admin routes
  use the closest exported placeholder and need visual review.
- Bind v1 web screens to hooks and remove primary hardcoded/mock data from
  production-candidate journeys.
- Add v1 API fixture factories and integration/state-machine tests for the
  stateful domains.
- Centralize common API helpers where service logic is now repeated:
  pagination, error codes, permission checks, and idempotency/conflict handling.
- Run live smoke against `make dev-v1` for API and web:
  `localhost:8121/api/v1/*` and `localhost:3013` core routes.
- Convert the scenario matrix into Playwright specs after route/hook binding is
  stable.
- Verify deferred honesty for payment/support and minimum admin copy: no fake
  payment, refund, support, or admin success states.
- Produce the cutover review only after API docs, frontend binding, integration
  tests, live smoke, and scenario/E2E evidence are in place.

Recommended near-term sequence:

1. Run visual review against all first-design routes and close missing/placeholder mappings.
2. Only after visual import is accepted, productize route components and bind API hooks.
3. Add fixture factories and integration tests for matches/teams/team matches.
4. Add live `make dev-v1` smoke checklist and execute it.
5. Start Playwright specs from the v1 scenario matrix.

### Wave 0 -- Contract Freeze

- [x] Confirm v1 product scope.
- [x] Create SM New state machines.
- [x] Create SM New permission matrix.
- [x] Convert DB table checklist into final ERD/design.
- [x] Convert API surface map into endpoint contract.

Deliverables:

- `docs/reference/sm-new-screen-action-inventory.md`
- `docs/reference/sm-new-api-surface-map.md`
- `docs/reference/sm-new-api-v1-contract-checklist.md`
- `docs/reference/sm-new-state-machines.md`
- `docs/reference/sm-new-permission-matrix.md`
- `docs/reference/sm-new-db-v1-implementation-design.md`
- `docs/api/v1/global-contract.md`
- `docs/api/v1/domains/*.md`

### Wave 1 -- Backend Foundation

- [x] Scaffold `apps/v1_api`.
- [x] Add v1 DB connection and Docker runtime.
- [x] Add initial Prisma runtime check schema.
- [x] Add full v1 Prisma schema.
- [x] Add seed draft.
- [x] Add committed migration.
- [ ] Add common DTOs, pagination, error codes, guards.
- [x] Add master data reads: sports, sport levels, regions, notices.
- [x] Add auth/me and onboarding summary reads/writes.
- [x] Add seed data for v1 masters.

Validation:

- API unit tests
- integration tests for auth/onboarding/master reads
- `pnpm --filter v1_api test`

### Wave 2 -- Frontend Shell

- [x] Scaffold `apps/v1_web`.
- [x] Add root layout.
- [ ] Add 5-tab mobile shell.
- [x] Add route placeholders for v1 flows.
- [x] Add initial v1 API health check integration.
- [ ] Add v1 API client hooks and shared query keys.
- [ ] Add auth/session hydration for v1 routes.

Validation:

- `pnpm --filter v1_web test`
- route smoke for `/home`, `/matches`, `/teams` on the v1 web server

### Wave 3 -- Personal Match Vertical Slice

- Backend: match list/detail/create/edit/cancel.
- Backend: application submit/withdraw/approve/reject.
- Backend: participant status handling.
- Frontend: list/detail/create/edit/manage screens.
- Tests: state conflict, duplicate application, permission denial.

Exit criteria:

- A user can create a match.
- Another user can apply.
- Host can approve/reject.
- Approved participant is visible.

### Wave 4 -- Team Vertical Slice

- Backend: team list/detail/create/edit.
- Backend: memberships and join applications.
- Frontend: team browse/detail/create/manage/member screens.
- Tests: owner/manager/member permission matrix.

Exit criteria:

- User can create a team.
- User can request to join.
- Owner/manager can approve/reject.
- Team detail reflects membership state.

### Wave 5 -- Team Match Vertical Slice

- Backend: team match list/detail/create/edit/cancel.
- Backend: team match applications.
- Frontend: team match browse/detail/create/manage screens.
- Tests: applicant team owner/manager only, host team owner/manager only.

Exit criteria:

- Owner/manager can create team match.
- Another team owner/manager can apply.
- Host owner/manager can approve.
- Matched state is visible.

### Wave 6 -- Chat And Notifications

- Backend: linked chat room create/read.
- Backend: chat messages and participants.
- Backend: notification rows and read state.
- Frontend: chat route, notification center, unread state.
- Realtime can reuse existing socket only if the contract is isolated.

Exit criteria:

- Match/team-match participants can open linked chat.
- New message appears in the linked room.
- Notification can be marked read without losing navigation.

### Wave 7 -- My/Profile/Admin Minimum

- My page aggregates user matches, teams, team matches, applications.
- Profile/trust surface displays verified/estimated/sample states.
- Admin minimal user/team/match state read and action audit.

Exit criteria:

- User can understand their active items.
- Admin action creates auditable logs.

### Wave 8 -- Cutover Review

- Compare v1 routes to design reference.
- Run smoke/E2E/visual audit.
- Decide route redirect or production replacement plan.
- Create old-code retirement task if cutover passes.

## 9. File Ownership Plan

Shared contract files must be edited before page/component parallel work.

Sequential first:

- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/src/**/dto`
- `apps/v1_api/src/common`
- `apps/v1_web/src/types/api.ts`
- `apps/v1_web/src/hooks/**`
- `docs/api/v1/**`

Parallel after shared contracts are stable:

- `apps/v1_web/src/app/matches/**`
- `apps/v1_web/src/app/teams/**`
- `apps/v1_web/src/app/team-matches/**`
- `apps/v1_web/src/components/{matches,teams,team-matches}/**`
- `apps/v1_api/src/{matches,teams,team-matches}/**`

Forbidden during initial waves:

- delete existing `(main)` routes
- delete existing domain controllers
- rewrite existing Prisma models
- run v1 migrations against the existing DB
- reuse old `Team` naming without clarification
- wire v1 routes to old payment flows

## 10. Acceptance Criteria

- V1 implementation can run alongside the existing app.
- `apps/v1_api` `/api/v1/*` is isolated from existing `apps/api` `/api/v1/*`.
- `apps/v1_web` routes do not import old domain components that assume old API shapes.
- V1 DB design is approved before any v1 Prisma migration.
- V1 migrations run against only the new v1 DB.
- V1 tables use `v1_` names and Prisma models use `V1*` names.
- Personal match, team, and team match flows have explicit state transition tests.
- Mutation APIs handle permission, duplicate request, stale state, and idempotency.
- Trust/payment/admin surfaces do not present mock or deferred data as real operational truth.
- Cutover is a separate explicit decision after QA, not an accidental route replacement.

## 11. Immediate Next Steps

- [x] Create `docs/reference/sm-new-state-machines.md`.
- [x] Create `docs/reference/sm-new-permission-matrix.md`.
- [x] Create `docs/reference/sm-new-db-v1-implementation-design.md`.
- [x] Publish frozen reference contract into `docs/api/v1/**`.
- [x] Use new v1 DB instead of extending the existing DB.
- [x] Use new app folders: `apps/v1_api`, `apps/v1_web`.
- [x] Use v1 runtime routes on the new web app, not `/sm-new/*` under existing `apps/web`.
- [x] Add workspace/package/docker planning for `apps/v1_api`, `apps/v1_web`, and v1 DB.
- [x] State machines, permission matrix, and DB implementation design are closed for v1.
- [x] Start v1 runtime scaffold and verify it boots with Docker.
- [x] Implement full v1 Prisma schema from `sm-new-db-v1-implementation-design.md`.
- [x] Add v1 seed data draft.
- [x] Add v1 initial Prisma migration SQL.
- [x] Run v1 migration and seed against the Docker v1 DB.
- [ ] Add fixture factories.
- [x] Implement v1 master data and notice read endpoints.
- [ ] Implement v1 API common layer beyond the existing envelope/filter scaffold.
- [x] Implement v1 auth/me and onboarding endpoints.
- [ ] Build v1 frontend API contract layer before binding design screens.

## 11.1 Verified Runtime Baseline

The v1 runtime baseline has been verified by running `make dev-v1`.

Observed local services:

```text
v1 web: http://localhost:3013
v1 api: http://localhost:8121/api/v1
v1 DB: teameet_v1_dev inside v1_postgres
```

Observed successful startup:

- Docker images built for `deps`, `v1_api`, and `v1_web`.
- Volumes created for v1 Postgres, v1 API node_modules, v1 Web node_modules,
  and v1 Web `.next`.
- `teameet_v1_postgres_dev` initialized and accepted connections.
- `apps/v1_api` ran Prisma generate and `prisma db push` against
  `teameet_v1_dev`.
- Nest v1 API started and exposed `/api/v1/health`.
- Next v1 web started on `http://localhost:3013`.

This confirms that the parallel v1 app/DB/Docker structure is usable before
full v1 feature development begins.

## 12. Progress Snapshot

- [x] Latest main was pulled successfully after stashing pre-existing local changes.
- [x] Repository analysis completed at a high level.
- [x] Rebuild strategy selected: new DB + new in-repo apps `apps/v1_api`, `apps/v1_web`.
- [x] V1-only direction confirmed; v2 is not part of the current plan.
- [x] Existing SM New planning docs identified.
- [x] Implementation waves drafted.
- [x] Design baseline confirmed: `Team Design > 1차 디자인 완료` in
  `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`.
- [x] Screen action inventory drafted: `docs/reference/sm-new-screen-action-inventory.md`.
- [x] API surface map drafted: `docs/reference/sm-new-api-surface-map.md`.
- [x] API v1 contract frozen: `docs/reference/sm-new-api-v1-contract-checklist.md` (`84/84 Done`).
- [x] State machines drafted and closed for v1.
- [x] Permission matrix drafted and closed for v1.
- [x] DB implementation design drafted and closed for v1.
- [x] API contract docs drafted as reference checklist.
- [x] API contract published to `docs/api/v1/**`.
- [x] Runtime implementation started with `apps/v1_api`, `apps/v1_web`, and `v1_postgres` scaffold.
- [x] `apps/v1_api` currently has health/common/Prisma runtime scaffold.
- [x] `apps/v1_api/prisma/schema.prisma` currently uses `V1RuntimeCheck`
  mapped to `v1_runtime_checks`.
- [x] `apps/v1_api/prisma/schema.prisma` now includes the closed v1 relational
  model with `V1*` Prisma models and `v1_*` table maps.
- [x] `apps/v1_api/prisma/seed.ts` now contains idempotent v1 seed data for
  runtime check, sports, levels, regions, terms, notices, users, teams,
  matches, team matches, linked chat, notifications, and admin.
- [x] `apps/v1_api/prisma/migrations/20260518000000_v1_initial_schema/migration.sql`
  now contains the initial v1 schema SQL plus the chat-room one-target check
  constraint.
- [x] `apps/v1_api/src/master/**` now exposes `GET /api/v1/master/sports`
  and `GET /api/v1/master/regions`.
- [x] `apps/v1_api/src/notices/**` now exposes `GET /api/v1/notices` and
  `GET /api/v1/notices/:noticeId` for published public notices.
- [x] `apps/v1_api/src/auth/**` now exposes `GET /api/v1/auth/me` using the
  temporary v1 development auth headers `x-v1-user-id` or `x-v1-user-email`.
- [x] `apps/v1_api/src/onboarding/**` now exposes `GET /api/v1/onboarding`,
  `PATCH /api/v1/onboarding/preferences`, `POST /api/v1/onboarding/complete`,
  and `POST /api/v1/onboarding/defer`.
- [x] `apps/v1_api/src/home/**` now exposes `GET /api/v1/home` and
  `GET /api/v1/home/recommendations` with optional v1 development auth.
- [x] `apps/v1_api/src/matches/**` now exposes `GET /api/v1/matches`,
  `GET /api/v1/matches/:matchId`, and
  `GET /api/v1/matches/:matchId/application-eligibility`.
- [x] `apps/v1_api/src/matches/**` now also exposes `POST /api/v1/matches`,
  `GET /api/v1/matches/:matchId/edit`, `PATCH /api/v1/matches/:matchId`,
  and `POST /api/v1/matches/:matchId/cancel`.
- [x] `apps/v1_api/src/matches/**` now also exposes personal match
  application APIs for apply/list/withdraw/approve/reject.
- [x] `apps/v1_api/src/teams/**` now exposes team browse/detail/profile,
  create/manage, and join application APIs.
- [x] `apps/v1_api/src/team-matches/**` now exposes team match browse/manage
  and team match application APIs.
- [x] `apps/v1_api/src/chat/**` now exposes linked chat room, message, member
  state, and leave APIs.
- [x] `apps/v1_api/src/notifications/**` now exposes notification list,
  read/read-all, and preference APIs.
- [x] `apps/v1_api/src/profile/**` now exposes my profile, public profile,
  settings, logout no-op, and withdrawal request APIs.
- [x] `apps/v1_api/src/admin/**` now exposes minimum admin/audit APIs for
  admin me, overview, entity status changes, action logs, and status logs.
- [x] `v1_matches.region_id` was corrected to nullable to match the create/edit
  API contract; migration `20260518001000_v1_nullable_match_region` was added.
- [x] `apps/v1_web` currently has root/home placeholder routes and v1 health
  integration.
- [x] `apps/v1_web` now binds the Team Design first-complete mobile surfaces
  to v1 routes for home, search, notices, matches, team matches, teams, my,
  notifications, and chat.
- [x] Search now has an interactive input route with back, clear, submit,
  recent search, quick condition, results, empty, error, and stale states.
- [x] First-pass screen-state/step routes are exposed for match filters,
  match create steps, team-match filters, team-match create steps, team search
  states, my match/team subpages, notifications read state, chat list/room, and
  notice detail.
- [x] Shared dev infra now includes v1 Docker services, v1 Makefile targets,
  package scripts, and Turborepo env wiring.
- [x] Local v1 runtime was verified with `make dev-v1`.
- [x] Full v1 Prisma model implementation drafted and Prisma Client generation verified.
- [x] Prisma schema validation passed with a dummy PostgreSQL `DATABASE_URL`.
- [x] `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] `pnpm --filter v1_api test` passed.
- [x] After master/notice API additions, `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] After master/notice API additions, `pnpm --filter v1_api test` passed.
- [x] After auth/onboarding API additions, `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] After auth/onboarding API additions, `pnpm --filter v1_api test` passed.
- [x] After home API additions, `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] After home API additions, `pnpm --filter v1_api test` passed.
- [x] After matches read API additions, `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] After matches read API additions, `pnpm --filter v1_api test` passed.
- [x] After matches create/edit/cancel additions, `pnpm --filter v1_api db:generate` passed.
- [x] After matches create/edit/cancel additions, `pnpm --filter v1_api exec tsc --noEmit --pretty false` passed.
- [x] After matches create/edit/cancel additions, `pnpm --filter v1_api test` passed.
- [x] After personal match application, teams, team matches, chat,
  notifications, profile/settings, and admin minimum API additions,
  `pnpm --filter v1_api build` passed.
- [x] After personal match application, teams, team matches, chat,
  notifications, profile/settings, and admin minimum API additions,
  `pnpm --filter v1_api test` passed with 13 suites and 74 tests.
- [x] Docker v1 DB migration/seed was verified from the user's terminal.
- [x] User confirmed v1 health/master/notice endpoints render correctly after seed.
- [ ] V1 domain API implementation is partially complete: main v1 API domains
  are implemented and `docs/api/v1/**` is published, while
  integration/state/idempotency coverage is still pending. Payment/support
  remain deferred by scope.
- [ ] V1 frontend contract/hooks/MSW are pending.
- [ ] V1 design screen binding is pending.
- [ ] Scenario/E2E/visual/cutover report is pending.

## 12.1 Post-Commit Inspection -- 2026-05-18

Baseline commit:

```text
ada655c feat: add v1 app baseline and API domains
```

Inspection result:

- [x] Worktree was clean immediately after the baseline commit.
- [x] `apps/v1_api` contains the v1 Nest app, Prisma schema, migrations, seed,
  common envelope/filter scaffold, auth guards, and implemented controllers for
  health, master, notices, auth, onboarding, home, matches, teams, team matches,
  chat, notifications, profile, and admin minimum/audit.
- [x] `apps/v1_web` contains the v1 Next app scaffold and route/design
  surfaces for home, search, notices, matches, team matches, teams, my,
  notifications, and chat.
- [x] `docs/scenarios/12-v1-sm-new-e2e-scenarios.md` exists as the v1 E2E
  scenario matrix draft and is linked from `docs/scenarios/index.md`.
- [x] `pnpm --filter v1_api build` passed.
- [x] `pnpm --filter v1_api test` passed with 13 suites and 74 tests.
- [x] `pnpm --filter v1_web test` passed with 1 test.
- [x] `pnpm --filter v1_web build` passed when run outside the sandbox after
  sandboxed Turbopack failed on process/port binding during CSS processing.

Important gaps found during inspection:

- [x] `docs/api/v1/**` is now published. It includes global contract, domain
  endpoint tables, DTO highlights, state/permission notes, and deferred
  boundaries. Pending frozen-but-not-implemented endpoints are explicitly
  marked.
- [ ] `apps/v1_web/src/hooks` and `apps/v1_web/src/types` are still empty, so
  frontend contract hooks, shared API types, query keys, and MSW handlers remain
  the next blocking layer.
- [ ] `apps/v1_api/test` does not exist yet. Current v1 API tests are
  controller/unit tests under `src/**/*.spec.ts`, not integration/state-machine
  tests.
- [ ] Fixture factories for integration tests are not implemented.
- [ ] Common API layer is still incomplete beyond the current envelope/filter
  scaffold: pagination helpers, standard error codes, permission helpers, and
  idempotency helpers still need to be centralized.
- [ ] Full live smoke for `localhost:8121/api/v1/*` and v1 web route smoke on
  `localhost:3013` has not been rerun after the baseline commit.
- [ ] Payment/support remain intentionally deferred; frontend copy must still
  prevent fake payment/refund/support success states.

Recommended next execution order:

1. Add v1 frontend contract layer: `types/api.ts`, API client, domain hooks,
   query keys, and MSW fixtures.
2. Add v1 API fixture factories and integration/state-machine tests for
   matches, teams, team matches, chat/notifications, profile, and admin audit.
3. Centralize pagination/error/permission/idempotency helpers where repeated
   service logic now exists.
4. Run live v1 smoke against `make dev-v1`: health, master/notices,
   auth/onboarding, each domain list/detail/mutation, and v1 web core routes.
5. Convert the scenario matrix into Playwright specs after route/hook binding is
   stable.

## 12.2 API V1 Docs Publication -- 2026-05-18

- [x] Added `docs/api/v1/README.md`.
- [x] Added `docs/api/v1/global-contract.md`.
- [x] Added implementation-facing domain docs under `docs/api/v1/domains/`.
- [x] Documented actual runtime prefix as `/api/v1` based on
  `apps/v1_api/src/main.ts`.
- [x] Marked frozen-but-not-yet-implemented auth/terms/search endpoints as
  pending instead of presenting them as live runtime APIs.
- [x] Preserved v1 deferred boundaries for payment/support and other
  out-of-scope domains.

## 13. Ambiguity Log

- Final v1 production route cutover path is not decided.
- Old auth storage is not shared for initial v1 development; v1 completion post-decision data handling remains undecided.
- V1 uses a new DB for initial development; existing-data migration/backfill is outside current v1 completion and remains a separate post-completion decision.
- First runtime route strategy is decided: separate `apps/v1_web` routes on the v1 web server.
- Admin v1 minimum API surface is now frozen, but implementation priority within Wave 7 can still be adjusted.
- Payment/support is deferred and API-disabled in v1; final UI disabled/read-only copy still needs design binding review.
