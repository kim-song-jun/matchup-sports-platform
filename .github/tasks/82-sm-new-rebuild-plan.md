# Task 82 -- SM New Full Rebuild Plan

Owner: codex
Status: Planning
Priority: P0
Target: both
Mode: CODE-ready planning

## 1. Purpose

SM New는 기존 Teameet 프론트엔드/백엔드를 부분 수정하는 작업이 아니다.
목표는 현재 저장소의 실행 환경, 문서, QA, 배포 기반은 유지하되 제품 코드와
도메인 계약을 SM New 기준으로 다시 설계하고 새로 구현하는 것이다.

이 문서는 다음 결정을 고정한다.

- 기존 저장소를 버리지 않는다.
- 기존 `apps/web`, `apps/api`의 구현은 참조 자료로만 본다.
- SM New는 같은 모노레포 안에서 새 product slice로 병행 구축한다.
- 기존 서비스 코드를 바로 삭제하거나 대량 치환하지 않는다.
- SM New v1이 기능/검증 기준을 통과한 뒤 cutover 여부를 결정한다.

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

Use an in-repo parallel rebuild.

```text
Existing product:
apps/web/src/app/(main)/*
apps/api/src/{matches,teams,team-matches,...}
/api/v1/*

SM New product:
apps/web/src/app/(sm-new)/*
apps/web/src/components/sm-new/*
apps/web/src/hooks/sm-new/*
apps/web/src/types/sm-new.ts
apps/api/src/sm-new/*
/api/v1/sm-new/*
```

The existing app remains runnable while SM New is built. This protects the
current codebase from a long broken transition and allows side-by-side QA.

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

Deferred domains may remain in the old app until SM New v2 planning.

## 5. Backend Plan

### Module Boundary

Create a new Nest module:

```text
apps/api/src/sm-new/
  sm-new.module.ts
  common/
  auth/
  home/
  notices/
  matches/
  teams/
  team-matches/
  chat/
  notifications/
  admin/
```

All SM New controllers should be mounted under:

```text
/api/v1/sm-new
```

Existing controllers under `/api/v1` remain unchanged during the rebuild.

### API Contract

Use the same global success envelope:

```text
{ status: "success", data, timestamp }
```

Use a stricter error shape in SM New services and filters where possible:

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

Do not edit the existing Prisma schema as a first step. First produce a concrete
SM New Prisma design document from the table decision checklist.

Required DB design outputs before migration:

- Final table list
- Final enum list
- Relation diagram
- Soft-delete policy
- Audit/status-change policy
- Index and unique constraint list
- Seed/mock data plan
- Migration strategy against the current dev DB

Candidate v1 table families:

```text
identity:
users, auth_identities, user_profiles, user_onboarding_progress

terms/master:
terms_documents, user_terms_consents, sports, sport_levels, regions, notices

preference/home:
user_sport_preferences, user_regions, user_reputation_summaries

personal match:
matches, match_applications, match_participants

team:
teams, team_profiles, team_memberships, team_join_applications,
team_trust_scores

team match:
team_matches, team_match_applications

chat/notification:
chat_rooms, chat_room_participants, chat_messages, notifications,
notification_preferences

admin/audit:
admin_users, admin_action_logs, status_change_logs
```

Payment/support tables are deferred for v1.

### Backend Reuse Candidates

Reuse cautiously:

- `PrismaModule`
- `RedisModule`
- auth token issuing/verification primitives
- global validation/filter/interceptor patterns
- upload static serving
- notification socket infrastructure if it does not leak old contracts

Do not blindly reuse:

- old `matches` state model
- old `SportTeam`/`Team` naming
- old payment participant binding
- old admin mutation shortcuts
- old mock data assumptions

## 6. Frontend Plan

### Route Boundary

Create an SM New route group:

```text
apps/web/src/app/(sm-new)/
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

Candidate public entry:

```text
/sm-new/home
/sm-new/matches
/sm-new/team-matches
/sm-new/teams
/sm-new/my
```

After cutover, these can become the production routes.

### UI Boundary

Create SM-specific UI under:

```text
apps/web/src/components/sm-new/
```

Use existing shared primitives only when they fit the SM design language without
modification. Avoid importing large existing domain components that carry old
data assumptions.

Suggested component groups:

```text
components/sm-new/shell/
components/sm-new/home/
components/sm-new/matches/
components/sm-new/teams/
components/sm-new/team-matches/
components/sm-new/chat/
components/sm-new/notifications/
components/sm-new/forms/
components/sm-new/primitives/
```

### API Hooks

Create a clean SM API integration surface:

```text
apps/web/src/hooks/sm-new/
  use-sm-auth.ts
  use-sm-home.ts
  use-sm-matches.ts
  use-sm-teams.ts
  use-sm-team-matches.ts
  use-sm-chat.ts
  use-sm-notifications.ts
  query-keys.ts
  shared.ts
```

Types should start in:

```text
apps/web/src/types/sm-new.ts
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

- Build SM New behind `/sm-new/*`.
- Old routes remain unchanged.
- Seed/mock data can be SM-specific.
- QA compares SM design reference to `/sm-new/*`.

### Phase B -- API Contract Lock

- Freeze `/api/v1/sm-new` endpoints.
- Add API integration docs under `docs/api/sm-new/`.
- Add backend integration tests for state transitions and permissions.
- Add MSW handlers for SM frontend tests.

### Phase C -- Product Cutover Candidate

- Decide whether `/home`, `/matches`, `/team-matches`, `/teams`, `/my` should
  redirect to SM New routes.
- Keep admin and deferred domains on the old app unless v2 replaces them.
- Run route smoke, focused E2E, and visual audit.

### Phase D -- Old Code Retirement

Only after SM New production routes are stable:

- remove unused old pages
- remove old hooks/types
- retire old backend controllers
- migrate or archive old docs
- simplify Prisma models if data migration is complete

## 8. Implementation Waves

### Delivery Pipeline Overview

The practical delivery order is:

```text
API design freeze
-> DB design freeze
-> Prisma migration and seed
-> backend API implementation
-> frontend contract layer
-> SM design binding
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
| 3. Prisma | Can the schema run? | migration, generated client, seed/fixture data | migration and seed pass locally |
| 4. Backend | Does the API behave correctly? | `apps/api/src/sm-new/**` | integration tests cover state/permission/error cases |
| 5. Frontend contract | Can UI consume API safely? | types, hooks, MSW, query keys | hooks cover loading/error/empty/success/mutation states |
| 6. Design binding | Does the SM UI work with real data? | `(sm-new)` routes wired to hooks | primary user journeys use SM API, not hardcoded data |
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
- Decide whether v1 runtime starts at `/sm-new/home` or a feature-flagged
  hidden route.
- Decide which old auth/session behavior can be reused.
- Decide whether payment/support/admin are disabled, read-only, or excluded.
- Decide whether admin minimum is required before cutover.

Artifacts:

- Update this task doc's scope if the v1 boundary changes.
- Add a compact scope table to `docs/reference/sm-new-api-db-baseline.md` or a
  linked follow-up doc.

Done when:

- [ ] Every baseline section is marked v1/deferred/removed.
- [ ] Every deferred section has user-facing copy/disabled-state direction.
- [ ] Payment/support stance is explicit.
- [ ] Admin minimum stance is explicit.
- [ ] First runtime route strategy is explicit.

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

The later `docs/api/sm-new/**` files are still useful as implementation-facing
domain docs, but they should be generated from this frozen reference contract
instead of reopening endpoint decisions.

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
docs/api/sm-new/
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

Work:

- Build field-by-field mapping:
  - API request field -> validation/source table
  - API response field -> table/computed/deferred source
  - mutation -> write set
  - state transition -> enum and audit row
- Decide new-table vs in-place migration strategy.
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
  - coexist with current tables
  - migrate current tables in place
  - or introduce new tables and later cut over

Recommended DB document layout:

```text
docs/reference/sm-new-db-design-v2.md

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

- [ ] Every API response field has a source: table, computed, external, mock, or deferred.
- [ ] Every API mutation has a write set.
- [ ] Every lifecycle transition maps to enum/state columns and audit rows.
- [ ] Every permission check has enough table data to evaluate it.
- [ ] Every common list filter has supporting indexes.
- [ ] Every uniqueness rule is enforced in DB where possible.
- [ ] Payment/support tables remain deferred unless v1 scope changes.
- [ ] Existing table reuse decisions are explicit.
- [ ] Data migration requirement is explicit.
- [ ] Seed data ownership is explicit.
- [ ] Dev-only mock fields do not leak into production contract.

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
- Current Prisma schema and migration history
- Existing seed/mock conventions

Tasks:

- Add or modify Prisma models.
- Generate migration.
- Add seed data for master tables:
  - sports
  - sport levels
  - regions
  - notices
  - test users
  - test teams
  - test matches
  - test team matches
- Add fixture factories for integration tests.
- Keep old seed paths intact unless the migration requires shared changes.

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

- `pnpm --filter api db:generate`
- `pnpm --filter api exec prisma migrate dev`
- `pnpm --filter api db:seed:mocks`
- Targeted DB smoke through Prisma service or integration test.

Done when:

- Prisma client generates.
- Migration applies to a clean dev DB.
- Migration applies or has a documented path for the current dev DB.
- Seed/mock data creates enough records for all v1 screens.
- Fixture factories can create isolated test data.

Risks:

- Existing dev DB drift can produce false negatives.
- Broad `include: true` in backend code can touch old missing columns.
- Seed scripts must avoid destructive full reset unless explicitly requested.

### Stage 4 -- Backend API Implementation

Build backend by vertical slices, but shared SM New common code comes first.

Purpose:

Implement the frozen `/api/v1/sm-new/*` API with state, permission, validation,
and error behavior matching the contract.

Inputs:

- Stage 1 API contract
- Stage 2 DB design
- Stage 3 Prisma client and fixtures

Backend order:

1. `sm-new/common`
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

- Controller route exists under `/api/v1/sm-new`.
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
- Swagger or generated docs do not contradict `docs/api/sm-new/**`.
- Live `localhost:8111/api/v1/sm-new/*` smoke works when dev stack is running.
- Frontend developers can implement hooks from stable response shapes.

Risks:

- Reusing old service methods can bypass new permission/state rules.
- Controller route shape drift will break hook contracts quickly.
- Optional auth endpoints must keep response shape stable for guest and user.

### Stage 5 -- Frontend Contract Layer

Do not wire screens directly to raw axios calls. Create the SM New frontend
contract layer before UI binding.

Purpose:

Create a stable frontend API boundary so design screens do not know transport
or envelope details.

Inputs:

- Stage 1 API contract
- Stage 4 backend routes or MSW mocks

Tasks:

- Add `apps/web/src/types/sm-new.ts`.
- Add `apps/web/src/hooks/sm-new/query-keys.ts`.
- Add per-domain hooks under `apps/web/src/hooks/sm-new/`.
- Add MSW handlers under `apps/web/src/test/msw` for SM New routes.
- Add frontend tests for hook behavior where state is non-trivial.

Suggested hook files:

```text
apps/web/src/hooks/sm-new/
  index.ts
  query-keys.ts
  shared.ts
  use-sm-auth.ts
  use-sm-onboarding.ts
  use-sm-home.ts
  use-sm-matches.ts
  use-sm-teams.ts
  use-sm-team-matches.ts
  use-sm-chat.ts
  use-sm-notifications.ts
  use-sm-my.ts
  use-sm-admin.ts
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
- Sharing old API types will hide mismatches until late UI integration.

### Stage 6 -- Design Screen Binding

Once hooks are stable, wire the SM design routes.

Purpose:

Attach the SM New design screens to the frontend contract layer and preserve
the design intent while replacing static data with real API state.

Inputs:

- SM design reference
- Stage 5 hooks and types
- Existing design tokens and `globals.css`

Binding order:

1. `(sm-new)/layout.tsx` shell and 5-tab navigation.
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
- Do not silently fall back to old app data if SM New API fails.
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

- Primary user journeys work against SM New API or MSW with matching contract.
- No production candidate route depends on hardcoded primary data.
- Design comparison gaps are tracked as explicit follow-ups.

Risks:

- Old components may carry old labels, statuses, or payment assumptions.
- Screen-level fallback mocks can accidentally ship as product truth.
- Desktop polish before mobile flow completion will slow v1.

### Stage 7 -- QA And Cutover

QA runs after each vertical slice and again before cutover.

Purpose:

Decide whether SM New remains parallel, replaces selected routes, or becomes
the production app shell.

Inputs:

- Completed vertical slices
- Scenario docs
- E2E/visual audit outputs
- Known blocker list

Required checks:

- API integration tests for each completed domain.
- Web unit tests for hooks and critical UI state helpers.
- Route smoke for every `(sm-new)` route.
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
| Parallel only | Keep `/sm-new/*` hidden or internal | v1 is not complete enough |
| Partial route cutover | Redirect selected routes like `/matches` to SM New | core flow is stable but admin/deferred domains remain old |
| Full app shell cutover | Replace logged-in main shell with SM New | home/matches/teams/team-matches/my all pass QA |
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
| 0. Scope lock | Mostly Done | product/dev | runtime route strategy remains |
| 1. API freeze | Done | product/dev | `docs/reference/sm-new-api-v1-contract-checklist.md` |
| 2. DB freeze | Next | backend/data | `sm-new-state-machines.md`, `sm-new-permission-matrix.md`, `sm-new-db-design-v2.md` |
| 3. Prisma | Pending | backend/data | migration + seed |
| 4. Backend | Pending | backend | `/api/v1/sm-new/*` |
| 5. Frontend contract | Pending | frontend/data | hooks/types/MSW |
| 6. Design binding | Pending | frontend/ui | `(sm-new)` routes |
| 7. QA/cutover | Pending | QA/dev | scenario/E2E/visual report |

### Wave 0 -- Contract Freeze

- [x] Confirm v1 product scope.
- [ ] Create SM New state machines.
- [ ] Create SM New permission matrix.
- [ ] Convert DB table checklist into final ERD/design.
- [x] Convert API surface map into endpoint contract.

Deliverables:

- `docs/reference/sm-new-screen-action-inventory.md`
- `docs/reference/sm-new-api-surface-map.md`
- `docs/reference/sm-new-api-v1-contract-checklist.md`
- `docs/reference/sm-new-state-machines.md`
- `docs/reference/sm-new-permission-matrix.md`
- `docs/reference/sm-new-db-design-v2.md`
- `docs/api/sm-new/global-contract.md`
- `docs/api/sm-new/domains/*.md`

### Wave 1 -- Backend Foundation

- Add `SmNewModule`.
- Add common DTOs, pagination, error codes, guards.
- Add master data reads: sports, sport levels, regions, notices.
- Add auth/me and onboarding summary reads/writes.
- Add seed data for SM New masters.

Validation:

- API unit tests
- integration tests for auth/onboarding/master reads
- `pnpm --filter api test`

### Wave 2 -- Frontend Shell

- Add `(sm-new)` layout.
- Add 5-tab mobile shell.
- Add route placeholders for v1 flows.
- Add SM API client hooks and shared query keys.
- Add auth/session hydration for SM routes.

Validation:

- `pnpm --filter web test`
- route smoke for `/sm-new/home`, `/sm-new/matches`, `/sm-new/teams`

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

- Compare SM New routes to design reference.
- Run smoke/E2E/visual audit.
- Decide route redirect or production replacement plan.
- Create old-code retirement task if cutover passes.

## 9. File Ownership Plan

Shared contract files must be edited before page/component parallel work.

Sequential first:

- `apps/api/src/sm-new/**/dto`
- `apps/api/src/sm-new/common`
- `apps/web/src/types/sm-new.ts`
- `apps/web/src/hooks/sm-new/**`
- `docs/api/sm-new/**`

Parallel after shared contracts are stable:

- `apps/web/src/app/(sm-new)/matches/**`
- `apps/web/src/app/(sm-new)/teams/**`
- `apps/web/src/app/(sm-new)/team-matches/**`
- `apps/web/src/components/sm-new/{matches,teams,team-matches}/**`
- `apps/api/src/sm-new/{matches,teams,team-matches}/**`

Forbidden during initial waves:

- delete existing `(main)` routes
- delete existing domain controllers
- rewrite existing Prisma models without migration plan
- reuse old `Team` naming without clarification
- wire SM New routes to old payment flows

## 10. Acceptance Criteria

- SM New implementation can run alongside the existing app.
- `/api/v1/sm-new/*` is isolated from existing `/api/v1/*` route contracts.
- SM New frontend routes do not import old domain components that assume old API shapes.
- SM New DB design is approved before any Prisma migration.
- Personal match, team, and team match flows have explicit state transition tests.
- Mutation APIs handle permission, duplicate request, stale state, and idempotency.
- Trust/payment/admin surfaces do not present mock or deferred data as real operational truth.
- Cutover is a separate explicit decision after QA, not an accidental route replacement.

## 11. Immediate Next Steps

- [ ] Create `docs/reference/sm-new-state-machines.md`.
- [ ] Create `docs/reference/sm-new-permission-matrix.md`.
- [ ] Create `docs/reference/sm-new-db-design-v2.md`.
- [ ] Optionally publish frozen reference contract into `docs/api/sm-new/**`.
- [ ] Decide whether the first runtime route is `/sm-new/home` or hidden behind a feature flag.
- [ ] Start Wave 1 only after state machines and permission matrix are complete.

## 12. Progress Snapshot

- [x] Repository analysis completed at a high level.
- [x] Rebuild strategy selected: in-repo parallel product slice.
- [x] Existing SM New planning docs identified.
- [x] Implementation waves drafted.
- [x] Screen action inventory drafted: `docs/reference/sm-new-screen-action-inventory.md`.
- [x] API surface map drafted: `docs/reference/sm-new-api-surface-map.md`.
- [x] API v1 contract frozen: `docs/reference/sm-new-api-v1-contract-checklist.md` (`84/84 Done`).
- [ ] State machines drafted.
- [ ] Permission matrix drafted.
- [ ] DB design v2 drafted.
- [x] API contract docs drafted as reference checklist.
- [ ] API contract optionally published to `docs/api/sm-new/**`.
- [ ] Runtime implementation started.

## 13. Ambiguity Log

- Final SM New production route cutover path is not decided.
- Whether old auth storage should be shared with SM New routes is not decided.
- Whether SM New tables should coexist with old tables or migrate old tables in place is not decided.
- First runtime route strategy is not decided: `/sm-new/home` vs hidden feature flag.
- Admin v1 minimum API surface is now frozen, but implementation priority within Wave 7 can still be adjusted.
- Payment/support is deferred and API-disabled in v1; final UI disabled/read-only copy still needs design binding review.
