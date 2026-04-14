# Task 67 — Mock Data & API Integrity Overhaul (Tech Design)

> Companion to `67-mock-data-api-integrity-overhaul.md` (owned by project-director).
> This document owns: data-model restructuring, persona/scenario matrices, parallel-work decomposition, shared-file guardrails, security audit checklist, test strategy, migration plan.
>
> Style: ADR per decision — Context / Decision / Consequences.

---

## 0. Audit Baseline (as of 2026-04-14)

| Artifact | Size / Count | Pain Point |
|---|---|---|
| `apps/api/prisma/seed.ts` | 1,527 LOC monolith | 5 users, 20 matches across 7 of 11 sports, 3 teams, 6 team-matches, 1 chat message, 11 listings, 4 lessons, 2 mercenary. No settlements, reviews, disputes, reports, notifications, push subs, payment lifecycle, team-match lifecycle, chat volume, lesson tickets, attendance. |
| `apps/web/src/test/msw/handlers.ts` | 427 LOC | 40+ routes, but missing: marketplace, lessons, payments, reviews, venues (detail/schedule), chat messages (POST/PATCH), settlements, reports, user-blocks, tournaments, notification preferences, push subscribe, VAPID key, admin audit, team-members, ownership transfer, mercenary applications, mercenary detail. `sportType` case drift vs Prisma enum. |
| `apps/web/src/types/api.ts` | 1,148 LOC | 17 occurrences of `sportType: string`. No `SportType` enum reuse. Status fields typed as `string` across Match/TeamMatch/Payment/Listing/Lesson. `teamConfig` / `matchResult` / metadata fields typed as `unknown` or missing. |
| Prisma schema | 1,349 LOC, 40+ models, 25+ enums | Source of truth — frontend diverges. |
| API controllers | 22 | Guard application is uneven (102 total guard usages, but no audit matrix). |
| Backend DTOs | ~40 across 14 modules | Good coverage for mutations but 15 files still use `Record<string, unknown>` for JSON fields (team config, match result, venue coords, review payload, etc.) |
| `apps/api/test/fixtures/` | 8 factories | Persona emails hard-coded; no composition helpers; no scenario presets (e.g. `seedAppliedTeamMatch`). |
| E2E `global-setup.ts` | Playwright login + storageState | Tightly coupled to seed persona emails — any rename breaks E2E. |

The seed data passes compile but fails the **UI/UX real-feel bar**: pagination (chat cursor), empty states, role permission matrices, payment lifecycle UI, and multi-sport filter UX cannot be validated end-to-end.

---

## 1. Guiding ADRs

### ADR-1: Single Source of Truth for Fixture Data — `apps/api/test/fixtures/` ∪ seed share one factory layer

**Context.** Today `prisma/seed.ts` (dev/E2E data) and `apps/api/test/fixtures/*.ts` (integration tests) are two independent creation paths. Schema changes force dual edits → drift.

**Decision.** Introduce `apps/api/prisma/factories/` as the **canonical factory layer**. Both `seed.ts` and `test/fixtures/` import from it. Factories are pure: they accept `PrismaClient` + overrides and return the created row. Seed = factory orchestration + idempotent upsert; test fixtures = same factories with per-suite overrides.

```
apps/api/prisma/
  factories/
    index.ts              # barrel
    user.factory.ts       # createUser, buildUser (no I/O), persona presets
    team.factory.ts
    venue.factory.ts
    match.factory.ts
    team-match.factory.ts
    lesson.factory.ts
    marketplace.factory.ts
    mercenary.factory.ts
    chat.factory.ts
    payment.factory.ts
    review.factory.ts
    notification.factory.ts
    settlement.factory.ts
    report.factory.ts
  scenarios/              # composed scenarios (multi-entity)
    applied-team-match.ts
    running-chat-room.ts
    paid-then-refunded.ts
    lesson-with-tickets.ts
  seed.ts                 # orchestrator (target ≤ 300 LOC)
  seed/
    01-users.ts
    02-venues.ts
    03-teams.ts
    04-matches.ts
    05-team-matches.ts
    06-mercenary.ts
    07-marketplace.ts
    08-lessons.ts
    09-chat.ts
    10-payments-settlements.ts
    11-reviews-notifications.ts
    12-tournaments-disputes-reports.ts
```

Test fixtures (`apps/api/test/fixtures/*.ts`) become **thin re-exports** of `apps/api/prisma/factories/*` plus suite-specific presets. Existing persona emails preserved for E2E continuity.

**Consequences.**
- Schema change → one factory edit → seed + tests + MSW-sync all pick up.
- `test/fixtures/` stops owning model literals; persona list becomes declarative.
- New convention: every factory exports `createX(prisma, overrides)` and `buildX(overrides)` (no I/O — used by MSW).
- Migration: step-by-step extraction without breaking suites (see §8).

### ADR-2: Seed Shape — Persona + Scenario Hybrid, NOT pure persona-driven

**Context.** Three options were considered:
- **Persona-driven** (create personas, each has pre-wired data). Tight coverage of role permissions but weak on cross-persona scenarios (e.g. "applied team-match awaiting owner approval").
- **Domain-driven** (N matches, N teams, …). High volume but no narrative — UI hard to review.
- **Scenario-driven** (pre-defined stories: "Alice joins Bob's match"). Rich UX coverage but brittle and hard to reason about counts.

**Decision.** **Persona baseline + scenario overlays**. Personas establish role/identity coverage and survive schema churn. Scenarios are named overlays that snap together personas into specific UI states (e.g. `scenarios/appliedTeamMatch` creates a `TeamMatch` with `owner=teamOwnerA`, applicant=`teamOwnerB`, status=`applying`). Volume fillers (pagination, cursor) are composed last via batch factories.

**Consequences.**
- Clear mental model: "which persona owns this? which scenario creates it?"
- Adding a new state (e.g. `rejected` team match) = one scenario function.
- Pagination cursor tests get dedicated `volumeFillers.ts` that adds N bulk messages / listings without polluting scenario semantics.

### ADR-3: `SportType` and all Prisma enums become frontend truth

**Context.** `sportType: string` on 17 frontend types lets callers pass any string. No IDE/TS protection against `"Futsal"` vs `"futsal"` drift. MSW handlers freely invent values.

**Decision.** Generate a shared enum module **from Prisma** once per build.
- Backend: continue to import `SportType` etc. from `@prisma/client`.
- Frontend: extract the same enum values into `apps/web/src/types/enums.ts` (generated by a small `pnpm gen:enums` script that reads `schema.prisma` and emits a TS `as const` union). Script committed under `tools/gen-enums.ts`, wired into `pnpm build` and `postinstall`.
- `lib/constants.ts#SportType` becomes the re-export of generated enum (backward compatible).

**Why not a shared workspace package?** It is a one-way (DB → web) sync and adding a new workspace package right now has churn cost (tsconfig refs, Next.js transpile list, test runner paths). One generated file hits the same target with 1/10 of the risk. If a second consumer (mobile/admin SPA) appears later, promote to `packages/shared-types`.

**Consequences.**
- Every `sportType: string` on the frontend becomes `sportType: SportType`.
- MSW handlers use the union — misuse caught at compile time.
- CI gate: `pnpm gen:enums --check` fails build if schema changed without regeneration.

### ADR-4: `Record<string, unknown>` on JSON fields is Critical tech debt

**Context.** 15 files use `Record<string, unknown>` for JSON-shaped DB fields. Runtime validation absent → malformed inputs reach Prisma. Frontend has no idea what shape to render.

**Decision.** Every JSON field gets a named DTO with `class-validator` rules + `@ValidateNested`/`@Type`. Each gets a frontend companion type exported from `apps/web/src/types/api.ts`. The two are kept in sync by convention + a new `apps/api/src/common/contracts/` directory that both sides can reference via structural import.

Target fields (found by audit):
- `TeamMatch.teamConfig` → `TeamMatchConfigDto` (sport-specific config)
- `TeamMatch.result` → `TeamMatchResultDto`
- `Match.result` → `MatchResultDto`
- `Venue.coordinates` → `GeoCoordinatesDto`
- `Venue.operatingHours` → `OperatingHoursDto`
- `Review.scores` → `ReviewScoresDto`
- `Notification.payload` → discriminated union `NotificationPayloadDto` per `NotificationType`
- `Payment.metadata` → `PaymentMetadataDto`
- `HttpExceptionFilter` error payload → typed `ApiErrorResponse`

**Consequences.** Runtime validation replaces silent acceptance. Frontend gains literal types. Scope is bounded: 9 named DTOs, not a rewrite.

### ADR-5: MSW Handlers mirror real backend responses — auto-generate stubs from Swagger

**Context.** MSW is maintained by hand; 40+ missing routes; case drift with enums. Writing each new handler manually guarantees future drift.

**Decision.**
1. Swagger JSON is already available at `/docs-json` (NestJS `@nestjs/swagger`). Add `pnpm msw:scaffold` script (`tools/msw-scaffold.ts`) that fetches the local API’s Swagger and emits **skeleton** handlers keyed by method+path, with `faker`-generated bodies typed against generated enums.
2. Human-owned handlers live in `apps/web/src/test/msw/handlers/*.ts` (split by domain). The scaffolder writes a new `handlers/auto/*.ts` layer — never overwriting human customizations. A `handlers/index.ts` merges both, with human handlers winning on duplicate.
3. Add a lint: every route present in Swagger MUST have a handler entry (auto or human). CI fails otherwise.

**Consequences.** Handlers stop being a silent blind spot. The scaffold is a **coverage net**; human handlers provide test-specific behavior. Cost: one script + one CI check. No runtime dep on faker in prod (dev only).

### ADR-6: Security audit produces a guard matrix checked in as code

**Context.** 102 guard occurrences across 22 controllers with no audit record. Past task (Phase 1-5) fixed some, but verification is ad-hoc.

**Decision.** Write `apps/api/src/common/security/guard-matrix.spec.ts` — an integration-style test that:
1. Introspects every controller via NestJS metadata (`@Controller`, `@Get/@Post`…).
2. Cross-checks each route against an authoritative table (`guard-matrix.ts` — ownership lives in this PR).
3. Assertions: `[public]` routes explicitly whitelisted; authenticated routes have `JwtAuthGuard`; admin routes have `AdminGuard` stacked after Jwt; team-scoped mutations use `TeamMembershipService.assertRole` in the service (runtime assertion helper).
4. Test fails if the controller drifts from the matrix — forces matrix update on intentional changes.

**Consequences.** Security becomes a compile-time/test-time contract. Adding a new route requires a matrix entry. Bypasses (e.g. removing `JwtAuthGuard`) trigger CI failure.

---

## 2. Persona Matrix

Fifteen personas, grouped into role clusters. Stable emails preserve E2E compatibility; existing eight personas retain their emails.

| # | Persona | Email | Role | Teams | Notable |
|---|---|---|---|---|---|
| 1 | `sinaro` (keep) | e2e+sinaro@test.local | user | – | Multi-sport (futsal+basketball), active joiner |
| 2 | `team_owner_A` (keep) | e2e+team_owner@test.local | user | owner of Team α | Futsal |
| 3 | `team_owner_B` | e2e+team_owner_b@test.local | user | owner of Team β | Basketball (cross-sport team matches) |
| 4 | `team_owner_C` | e2e+team_owner_c@test.local | user | owner of Team γ | Ice hockey (sparse domain coverage) |
| 5 | `team_manager` (keep) | e2e+team_manager@test.local | user | manager in Team α | |
| 6 | `team_member` (keep) | e2e+team_member@test.local | user | member in Team α | |
| 7 | `team_member_2` | e2e+team_member_2@test.local | user | member in Team α | List density for team-members view |
| 8 | `merc_host` (keep) | e2e+merc_host@test.local | user | owner of Team δ | Runs mercenary posts |
| 9 | `admin_user` (keep) | e2e+admin@test.local | admin | – | Admin dashboards |
| 10 | `instructor` (keep) | e2e+instructor@test.local | user | – | Lesson host |
| 11 | `instructor_2` | e2e+instructor_2@test.local | user | – | Lesson host (badminton/tennis) |
| 12 | `market_seller` (keep) | e2e+seller@test.local | user | – | Marketplace seller |
| 13 | `market_seller_2` | e2e+seller_2@test.local | user | – | Rental + group-buy listings |
| 14 | `newbie_zero` | e2e+newbie_zero@test.local | user | – | 0 matches, 0 bookings — empty-state checks |
| 15 | `newbie_zero_2` | e2e+newbie_zero_2@test.local | user | – | Zero history alt — pair comparison |
| 16 | `suspended_user` | e2e+suspended@test.local | user (suspended) | – | Admin moderation UX |
| 17 | `blocker` / `blocked` | e2e+blocker@test.local / e2e+blocked@test.local | user | – | `UserBlock` surfaces |
| 18 | `disputant_buyer` / `disputant_seller` | e2e+dispute_buyer@test.local / e2e+dispute_seller@test.local | user | – | `Report` + dispute UX |

All new personas use `oauthProvider=email` + `oauthId=email_<email>` pattern for dev-login compatibility.

---

## 3. Scenario Coverage Matrix

Each row produces concrete DB rows; last column identifies the scenario function.

| Scenario | Entities | Coverage | Factory |
|---|---|---|---|
| **All 11 sports exist** | 11 matches + 11 mini-teams + 11 venues | Sport filter UX per sport | `scenarios/fullSportSpread` |
| **Empty team** | 1 team with 1 member only (owner) | Empty team detail page | `scenarios/emptyTeam` |
| **Empty venue** | 1 venue with 0 reviews, 0 schedules | Empty venue review state | `scenarios/emptyVenue` |
| **Newbie zero history** | 2 users with 0 matches, 0 teams | Onboarding, recommendations empty state | persona 14/15 |
| **Chat pagination** | 3 rooms × 30 messages (cursor of 20) | Cursor-based pagination UX | `scenarios/pagedChatRoom` |
| **Chat with teamMatchId link** | 1 room linked to a team match | Team match → chat room jump | `scenarios/teamMatchChat` |
| **Marketplace × 3 types × 3 statuses** | 9 listings (used/rental/group-buy × recruiting/ongoing/closed) | Marketplace filter grid | `scenarios/marketplaceGrid` |
| **Lessons × 4 types × 3 tickets** | 4 lessons + 12 ticket plans | Ticket UX | `scenarios/lessonTicketGrid` |
| **Lesson attendance history** | 1 lesson with 4 sessions, 3 attendees | Attendance admin UX | `scenarios/lessonAttendanceHistory` |
| **Payment lifecycle** | 4 payments (paid/refunded/failed/pending) | Payment status tabs | `scenarios/paymentLifecycle` |
| **Team-match lifecycle** | 6 team matches (applying/approved/rejected/checked_in/completed/disputed) | Status tabs + detail page | `scenarios/teamMatchLifecycle` |
| **Applied-to-my-team** | 1 applied team match with `team_owner_A` as recipient | Owner approve/reject UX | `scenarios/appliedTeamMatch` |
| **Rejected application (mine)** | 1 application rejected from another team | `/my/team-match-applications` | `scenarios/rejectedApplication` |
| **Mercenary lifecycle** | 3 mercenary posts (open/closed) + 4 applications (pending/accepted/rejected/cancelled) | Mercenary UX | `scenarios/mercenaryLifecycle` |
| **Review aggregate** | 10 completed matches each with 2–3 reviews | Review list + trust score | `scenarios/reviewAggregate` |
| **Trust score divergence** | 3 teams with clear low/mid/high trust scores | Team card badges | `scenarios/trustScoreSpread` |
| **Notifications** | 8 notifications across all `NotificationType` values, 3 unread | Notification center | `scenarios/notificationRainbow` |
| **Push subscriptions** | 2 users with `PushSubscription` rows | Settings push UX (without requiring real push) | `scenarios/pushSubscribed` |
| **Settlements** | 3 settlements (pending/processing/completed) tied to payments | Admin settlements | `scenarios/settlementLifecycle` |
| **Reports / disputes** | 2 reports (user, listing) + 1 dispute | Admin moderation | `scenarios/moderationQueue` |
| **User blocks** | A blocks B; B tries to interact | Blocklist filter behavior | `scenarios/userBlockPair` |
| **Tournaments** | 2 tournaments (registering/live) | Tournament page | `scenarios/tournaments` |
| **i18n/emoji/XSS probes** | 3 entities with emoji names, 1 with `<script>` payload | XSS regression | `scenarios/xssProbes` |
| **Pagination volume filler** | 60 additional matches, 40 marketplace listings, 30 reviews | Infinite scroll + cursor | `scenarios/volumeFillers` |

Target counts after overlay: ≥ 18 users, ≥ 95 matches, ≥ 7 teams, ≥ 18 team matches, ≥ 100 chat messages across 5 rooms, ≥ 49 marketplace rows, ≥ 7 lessons w/ tickets & attendance, ≥ 7 mercenary posts, ≥ 4 payments, ≥ 3 settlements, ≥ 8 notifications, ≥ 2 tournaments, ≥ 2 reports.

---

## 4. Parallel Work Breakdown

Five phases. Phase 1 is sequential (shared-file foundations); phases 2–4 are maximally parallel; phase 5 is audit/cleanup sequential.

### Phase 1 — Foundations (SEQUENTIAL, single owner = tech-planner or backend-data-dev)

Shared-file changes; other builders must wait.

- Create `apps/api/prisma/factories/` skeleton (all factory files + barrel).
- Create `tools/gen-enums.ts` + `apps/web/src/types/enums.generated.ts`.
- Add `apps/web/src/types/enums.ts` (re-export + manual constants).
- Add `apps/api/src/common/contracts/` (DTO shells for the 9 JSON fields).
- Add `apps/api/src/common/security/guard-matrix.ts` + empty `.spec.ts`.
- Update `package.json` scripts: `gen:enums`, `msw:scaffold`, `db:seed`.

Gate: `pnpm build && pnpm -r test -- --passWithNoTests` green.

### Phase 2 — Parallel triple (after Phase 1 merge)

| Lane | Owner | Touches (owned) | DO NOT touch |
|---|---|---|---|
| **2A Backend Data** | backend-data-dev | `apps/api/prisma/factories/*`, `apps/api/prisma/scenarios/*`, `apps/api/prisma/seed/*`, `apps/api/prisma/seed.ts`, `apps/api/test/fixtures/*`, `apps/api/prisma/schema.prisma` (JSON-field index tweaks only), `prisma/migrations/*` | controllers, DTOs (other than shells), frontend, MSW |
| **2B Backend API** | backend-api-dev | DTO classes in `apps/api/src/common/contracts/*` + `apps/api/src/*/dto/*.ts` refactors replacing `Record<string, unknown>`, controllers, services signature updates, guard-matrix filling | prisma schema, factories, frontend |
| **2C Frontend Data** | frontend-data-dev | `apps/web/src/types/api.ts` (consume generated enums + named DTOs), `apps/web/src/hooks/api/*`, `apps/web/src/lib/api.ts`, `apps/web/src/test/msw/handlers/**`, MSW scaffolder output | frontend pages/components, backend |

Conflict prevention:
- `apps/web/src/types/api.ts` is **2C only**. 2B emits named contracts in `apps/api/src/common/contracts/` — 2C mirrors them.
- `apps/api/prisma/schema.prisma` is **2A only**. If 2B needs a schema tweak, file request to 2A via task log.
- 2C runs `pnpm gen:enums` as the first commit to lock the enum file.

### Phase 3 — Frontend UI consumption (after 2A+2C merge)

| Lane | Owner | Touches |
|---|---|---|
| **3A Frontend UI** | frontend-ui-dev | `apps/web/src/app/**/page.tsx` (only types tightening — no UX changes), `apps/web/src/components/**` consuming narrowed types |
| **3B Infra (optional)** | infra-devops-dev | CI workflow updates (gen:enums check, msw-coverage check, seed smoke step) |

3A can run in parallel with 3B because they touch disjoint trees.

### Phase 4 — Security audit + guard matrix (SEQUENTIAL, infra-security-dev then backend-api-dev)

- infra-security-dev fills `guard-matrix.ts`, extends `guard-matrix.spec.ts` to assert the 22-controller matrix.
- backend-api-dev fixes any exposed routes (expected: 3–5 missed guards based on past audits).

### Phase 5 — Test harness, E2E refresh, docs (PARALLEL)

| Lane | Owner | Touches |
|---|---|---|
| **5A Backend tests** | backend-data-dev | update `apps/api/src/**/*.spec.ts` and `apps/api/test/integration/*.e2e-spec.ts` to use factory layer |
| **5B Frontend tests** | frontend-data-dev | update `apps/web/src/**/*.test.tsx` to use new enum types; add MSW coverage lint |
| **5C E2E** | qa-power | confirm `e2e/global-setup.ts` still matches personas; add specs for newly covered scenarios (settlements, disputes, reports) |
| **5D Docs** | docs-writer | update `CLAUDE.md`, `docs/DESIGN_DOCUMENT_MAP.md` with new seed/fixture layout |

---

## 5. Shared Files Warning (NO CONCURRENT EDITS)

| File | Owner phase | Rationale |
|---|---|---|
| `apps/api/prisma/schema.prisma` | 2A only | Any concurrent edit = migration conflict |
| `apps/api/prisma/seed.ts` | 2A only | Orchestrator |
| `apps/web/src/types/api.ts` | 2C only | 17 enum narrowings must land atomically |
| `apps/web/src/types/enums.generated.ts` | Phase 1 + regenerated by 2C | Always produced by `pnpm gen:enums`; never hand-edited |
| `apps/web/src/test/msw/handlers.ts` | 2C only → then sunset | Phase 2 splits into `handlers/*.ts` directory |
| `apps/api/src/common/security/guard-matrix.ts` | Phase 4 only | Serialize to avoid matrix races |
| `apps/api/test/fixtures/personas.ts` | Phase 1 then 2A | Re-export shell first, persona additions after |
| `e2e/global-setup.ts` | Phase 5C only | Must match final persona list |

Each builder prompt MUST include a `Do NOT touch` block listing the files owned by other lanes.

---

## 6. Security Audit Checklist — 22 controllers

For each controller, verify (Y/N/N-A):

| Controller | JwtAuthGuard default? | AdminGuard where needed? | `@CurrentUser` on mutations? | Team role check? | Rate limit on public? | DTO validation? | Swagger `@ApiBearerAuth`? |
|---|---|---|---|---|---|---|---|
| auth | N (public routes) | N | on `/me` | – | YES on `/login`, `/register`, `/kakao`, `/naver`, `/apple` | YES | – |
| users | Y | N | Y on PATCH `/me` | – | – | YES | Y |
| matches | Y (read + write) | N | Y | N-A | – | YES | Y |
| team-matches | Y | N | Y | Y on create/result/evaluate | – | YES | Y |
| teams | Y (write), public read | N | Y | Y on member/role/delete/transfer | – | YES | Y |
| mercenary | Y (write), public read | N | Y | Y on post-owner actions | – | YES | Y |
| marketplace | Y (write), public read | N | Y | N-A | – | YES | Y |
| lessons | Y (write), public read | N | Y | Check instructor ownership | – | YES | Y |
| payments | Y | N | Y | N-A | – | YES | Y |
| settlements | Y + AdminGuard | Y | Y | – | – | YES | Y |
| disputes | Y + AdminGuard on admin routes | Y | Y | – | – | YES | Y |
| reports | Y | N (user-facing) + Y on admin routes | Y | – | YES (anti-abuse) | YES | Y |
| reviews | Y | N | Y | verify reviewer = participant | – | YES | Y |
| venues | Y (write), public read | Y on admin writes | Y | – | – | YES | Y |
| chat | Y | N | Y | `assertParticipant` | WS throttle | YES | Y |
| notifications | Y | N | Y | – | – | YES | Y |
| admin | Y + AdminGuard | Y (all) | Y | – | – | YES | Y |
| badges | Y | Y on admin grants | Y | – | – | YES | Y |
| uploads | Y | N | Y | file size/type check | YES | YES | Y |
| user-blocks | Y | N | Y | prevent self-block | – | YES | Y |
| tournaments | Y (write), public read | Y on create | Y | – | – | YES | Y |
| health | N (public) | N | N | – | YES | N-A | N |

Audit script must emit a markdown table as part of `guard-matrix.spec.ts` output (use `console.table` piped to fixture file). Any Y/N mismatch → Critical fix inside this task.

---

## 7. Test Strategy

### 7.1 Backend unit / integration

- **Factory parity tests.** `factories/*.spec.ts` — each factory produces a row that satisfies Prisma type + passes relevant DTO validation (round-trip via `class-transformer + class-validator`).
- **Scenario smoke tests.** `scenarios/*.spec.ts` — each scenario leaves DB in expected state (counts asserted).
- **Guard matrix test.** §1.ADR-6 + §6.
- **Seed idempotency test.** `prisma/seed.spec.ts` — run seed twice, assert no duplicates, no orphans. Run in CI under `DATABASE_URL=postgresql://…/matchup_seed_test` ephemeral DB.
- **DTO coverage.** snapshot test: every exported DTO is importable and `validate()` rejects obvious bad input for three key fields.

### 7.2 Frontend

- **MSW coverage.** `apps/web/src/test/msw/coverage.test.ts` — compares keys in `handlers/index.ts` against Swagger JSON fixture `apps/web/src/test/msw/swagger.snapshot.json`. Fails on diff.
- **Type drift.** `apps/web/src/types/types.generated.spec.ts` — ensures generated enum file matches committed snapshot.
- **Hook tests.** each hook in `hooks/api/` exercised against MSW handler returning realistic payload (re-use scenario shape via shared `buildX` builders).

### 7.3 E2E

- **No E2E behavior changes** in phase 2. New E2E specs in phase 5C cover:
  - Admin settlements tab lists 3 rows (seeded scenario).
  - Report/dispute UX path.
  - Marketplace filters across 9 listings.
  - Chat pagination across 30 messages.
- `global-setup.ts` preserves all 8 original personas; new personas added behind feature guard.

### 7.4 Mock updates needed (Discipline)

Every schema/DTO change MUST ship with:
- factory/scenario update (Phase 2A),
- frontend type update (Phase 2C),
- MSW handler update (Phase 2C via scaffold + manual),
- inline spec-file mocks in affected `*.spec.ts` / `*.test.tsx`.

Reviewer rejects any PR that touches schema/DTO without matching fixture + MSW updates (Critical).

---

## 8. Migration Plan

### 8.1 Prisma schema

No breaking schema changes expected. JSON field named-DTO migration is **application-level** only (columns stay `Json`). Two potential additions for UI/UX testability (both backwards-compatible, nullable):
- `Venue.reviewCount Int? @default(0)` — avoid count() on list endpoints.
- `Lesson.ticketPlanCount Int? @default(0)` — same reason.

Both behind `20260414_add_count_caches` migration.

### 8.2 Seed rollout (wave-based, zero downtime for dev)

1. Land factory skeletons + scenario stubs (Phase 1). Existing `seed.ts` unchanged.
2. Per domain (users → venues → teams → matches → team-matches → mercenary → marketplace → lessons → chat → payments → reviews → notifications → tournaments/reports), cutover old seed block to factory call. After each cutover: `pnpm db:seed && pnpm test:all` green.
3. When all domains cut over, `seed.ts` is ≤ 300 LOC and pure orchestration.

### 8.3 MSW rollout

1. Land `handlers/` directory + `handlers/index.ts` importing existing `handlers.ts`.
2. Per domain, split old monolith into `handlers/<domain>.ts`.
3. Run `pnpm msw:scaffold` to generate `handlers/auto/*.ts` for missing routes.
4. Delete original `handlers.ts`.

### 8.4 Rollback

- Factories are additive → safe to revert per-commit.
- If scenario produces bad data on dev, `pnpm db:push --force-reset && pnpm db:seed` restores. Seed is idempotent.
- Frontend enum narrowing: behind `tsc --noEmit` gate — if any consumer breaks, widen the field locally and open a follow-up rather than revert whole phase.

### 8.5 CI gates added in this task

1. `pnpm gen:enums --check` — fails on schema-vs-frontend drift.
2. `pnpm msw:coverage` — fails on Swagger routes missing handlers.
3. `pnpm --filter @matchup/api test -- guard-matrix.spec` — fails on guard drift.
4. Seed smoke job: spin up Postgres + Redis, run migrations + seed twice, assert counts.

---

## 9. Tech Debt Resolved In Scope

Resolved:
- `Record<string, unknown>` usage across 15 files → named DTOs (ADR-4).
- `sportType: string` across 17 frontend types → `SportType` enum (ADR-3).
- Monolithic `seed.ts` (1,527 LOC) → modular factories + scenarios (ADR-1/2).
- Silent MSW gaps (30+ missing routes) → Swagger-synced coverage (ADR-5).
- Unaudited guard surface (102 usages / 22 controllers) → matrix + test (ADR-6).
- Schema↔mock drift → single factory layer.
- Inline fixture copies in specs → factory re-use.
- Missing seed coverage for settlements/disputes/reports/tournaments/push/preferences → scenario matrix §3.

Deferred (with explicit trigger):
- **Shared `packages/types` workspace package.** Trigger: a second web consumer (native admin panel or mobile web) appears. Rationale: one-way DB→web sync is sufficient today; workspace package has tsconfig/Next.js churn cost (ADR-3).
- **Faker-deterministic seeds with fixed RNG seed file.** Trigger: E2E flakiness due to random-order scenario data. Current scenarios are deterministic by construction.
- **GraphQL / tRPC migration to eliminate OpenAPI drift altogether.** Trigger: team decides to commit to end-to-end typed transport; out of scope for this task.

---

## 10. Security Notes

Threat model additions specific to seed/mock overhaul:

| Threat | Mitigation |
|---|---|
| Seed credentials leak to prod | Seed script hard-guards: `if (process.env.NODE_ENV === 'production') throw`. Dev-login endpoint already blocked in prod. |
| Generated enum file drift enables `sportType='DROP TABLE'` through client | Backend still validates via `@IsEnum(SportType)`; frontend narrowing is defense-in-depth only. |
| MSW handlers reading real secrets | Scaffolder prohibits importing process.env except a whitelist (`API_BASE`). Unit test asserts. |
| XSS via emoji/script probes in seed | XSS-probe scenario inserts `<script>` string into test-only DB columns; frontend renders via text, not HTML. MSW handlers do NOT surface probe rows by default. E2E `xss.spec.ts` asserts render as text. |
| Dispute/report fixture exposure | Seeded disputes use fictional persona pair (`disputant_buyer`/`disputant_seller`). No PII. |
| Push subscription seed with real VAPID | Seeded rows use a documented fake endpoint (`https://example.test/push`). `WebPushService.sendToUser` skips unreachable endpoints (graceful disable). |
| Admin route exposure regression | Guard matrix spec (§6) acts as a binding contract; adding an admin route without `AdminGuard` fails CI. |

Cross-cutting:
- All new DTOs validated at controller ingress (`ValidationPipe` already global).
- JSON fields now typed → reduces Prisma-level injection surface.
- Factories never mint JWTs; `auth-token.ts` remains test-only.

---

## 11. Open Questions

1. **Volume target for pagination fillers.** 60 matches / 40 listings / 30 reviews is a proposal. project-director to confirm whether we need higher counts for 3-page infinite scroll UX. *Default: proceed with proposal; widen in Phase 2A if product wants deeper scroll.*
2. **Tournament module readiness.** Prisma has `Tournament`, but controller/service scope is unclear. If tournaments are not shipping in this milestone, scenario `tournaments` produces data but frontend consumers may be stub — confirm by §10 with project-director.
3. **Suspended user UX.** `AdminUserStatus` enum exists. Does the frontend currently render a suspended banner? If not, either add UI (widens scope) or defer persona `suspended_user` to phase 5. *Recommendation: keep persona but skip UI change this task.*
4. **`UserBlock` surfaces.** Are block filters applied in all list queries (chat partners, mercenary applicants, match browsing)? If partial, fixing falls into phase 2B. Matrix audit will surface gaps.
5. **Swagger JSON availability in CI.** `pnpm msw:coverage` needs Swagger. Options: (a) spin API during CI (expensive), (b) commit snapshot. *Recommendation: commit snapshot; regen script documented.*
6. **Generated enum source of truth file location.** Proposal: `apps/web/src/types/enums.generated.ts` (with `// @generated` header, eslint-disable). Alternative: `packages/shared-enums/`. Locked to former unless Q1 result forces the latter.

---

## 12. Ambiguity Log

*(Track escalations here during execution. Format: `YYYY-MM-DD: <builder> — <question> — <resolution>`.)*

- 2026-04-14: tech-planner — whether to introduce `packages/shared-types` workspace — RESOLVED ADR-3: generate into `apps/web/src/types/enums.generated.ts`, promote only on second consumer.
- 2026-04-14: tech-planner — persona-driven vs scenario-driven seed — RESOLVED ADR-2: hybrid.
- 2026-04-14: tech-planner — whether to hand-write all 30+ missing MSW handlers — RESOLVED ADR-5: Swagger scaffolder + human overrides.

---

## 13. Appendix — File-ownership cheat sheet

Phase 2 lane ownership crib (paste into each builder prompt):

**2A Backend Data owns:**
- `apps/api/prisma/**`
- `apps/api/test/fixtures/**`

**2A DO NOT touch:**
- `apps/api/src/**/*.controller.ts` / `*.service.ts` (except calling factory in seeds)
- `apps/web/**`

**2B Backend API owns:**
- `apps/api/src/**/*.controller.ts`
- `apps/api/src/**/*.service.ts`
- `apps/api/src/**/dto/**`
- `apps/api/src/common/contracts/**`

**2B DO NOT touch:**
- `apps/api/prisma/**`
- `apps/api/test/fixtures/**`
- `apps/web/**`

**2C Frontend Data owns:**
- `apps/web/src/types/**`
- `apps/web/src/hooks/api/**`
- `apps/web/src/lib/api.ts`
- `apps/web/src/test/msw/**`

**2C DO NOT touch:**
- `apps/api/**`
- `apps/web/src/app/**` (UI pages — phase 3A)
- `apps/web/src/components/**` (phase 3A)

Enforce via builder prompt text AND post-merge `git diff --stat` sanity check (any lane touching a forbidden path = automatic reject + redo).
