# Task 65: Service Readiness Audit -- Feature Discoverability, Integration Verification, Data Correctness

Owner: project-director + tech-planner -> backend-dev / frontend-dev / infra-dev
Date drafted: 2026-04-13
Status: Open
Priority: P0

---

## Context

MatchUp has 70+ frontend routes, 15+ backend controllers, and a comprehensive Prisma schema. The core features (matching, teams, marketplace, lessons, mercenary, tournaments, venues, chat, badges, payments, reviews) are all **implemented** but many remain effectively invisible to users because navigation paths are missing, incomplete, or buried.

The user's core complaint: "All the features exist but they're hidden -- tournaments, group buys, uniforms, team details, match details, marketplace details. I need menu tabs, hub pages, and home page links so the service actually works. Also verify that DB writes, API contracts, and frontend-backend integration all work end-to-end."

### Predecessor Tasks and Their Residual Gaps

| Task | Status | What shipped | What did NOT ship |
|------|--------|-------------|-------------------|
| **27** (Feature Discoverability) | COMPLETED | Mercenary detail page, mock data removal, sport filter expansion, home "quick explore" chips, profile page links to badges/feed | Bottom nav still 5 items (Home/Matches/Teams/Marketplace/Profile). Tournaments still zero nav entry. Ambiguity #1 (bottom nav restructure) never resolved. |
| **48** (Team/Venue Hub IA) | COMPLETED | Team hub tabs (matches/mercenary/goods/passes/events), venue hub | Tournaments explicitly deferred. |
| **51** (Frontend API Contract Audit) | IMPLEMENTED | Hook/type drift fixes (chat, team-matches, marketplace DTOs) | Runtime verification not done -- structural contract only. |
| **64** (Team Multi-Sport, Venue) | PARTIAL | `sportTypes SportType[]` schema migration, GIN index | `venueLabel()` NOT created (24 hardcoded "..." remain). Venue link in profile page NOT added (`grep venues profile/page.tsx` = 0). Team list search/filter/sort NOT added. Home Zone 3 venue section unclear. |

**This task addresses the delta -- what predecessor tasks left unfinished or unverified.**

---

## Goal

1. Every implemented feature is reachable within 2 taps from a primary navigation surface (bottom nav, sidebar, home page, or profile page).
2. Every frontend form submission persists data to the database correctly.
3. Every API endpoint called from the frontend returns the expected response format.
4. No dead-end pages, broken links, or silently failing API calls remain in the production build.

---

## Original Conditions (from user request)

- [ ] Tournaments discoverable from navigation (not just direct URL)
- [ ] Group buy / uniforms / team goods accessible from marketplace or team hub
- [ ] Team detail page surfaces all sub-features (matches, mercenary, goods, passes, events)
- [ ] Match detail page renders all data correctly
- [ ] Marketplace detail page renders all data correctly
- [ ] Menu tabs or equivalent navigation expose hidden features
- [ ] Home page provides entry points to all major feature areas
- [ ] DB writes verified -- form submissions persist correctly
- [ ] API endpoints verified -- correct request/response contracts
- [ ] Frontend-backend integration verified -- no silent failures
- [ ] Non-functional features identified and either fixed or explicitly flagged

---

## Scope: Three Work Streams

### Stream A: Navigation and Discoverability (Frontend)

**Priority: P0 -- directly addresses user's core complaint**

#### A-1: Bottom Nav "More" Tab (or restructure)
- Current: 5 tabs (Home / Matches / Teams / Marketplace / Profile)
- Missing from mobile: Lessons, Team Matches, Mercenary, Venues, Tournaments, Chat, Notifications
- Decision needed: Add a "More" tab (6th item) that opens a quick-access sheet, or restructure existing 5
- Recommendation: Add "More" tab with grid of: Lessons, Tournaments, Mercenary, Venues, Chat, Notifications, Badges, Feed
- File: `apps/web/src/components/layout/bottom-nav.tsx`

#### A-2: Sidebar -- Add Tournaments
- Tournaments controller and pages exist but sidebar has zero entry
- Add under "Explore" section between "Marketplace" and "Teams"
- File: `apps/web/src/components/layout/sidebar.tsx`

#### A-3: Home Page -- Tournaments Section
- Home page fetches matches, teams, lessons, listings, team-matches but NOT tournaments
- Add tournament section in Zone 3 (explore zone) with `SectionHeader` + tournament cards
- Add "Tournaments" to the quick explore chips row
- Files: `apps/web/src/app/(main)/home/page.tsx`, `home-client.tsx`

#### A-4: Profile Page -- Venue and Tournament Links
- Profile page has badges/feed links (Task 27) but NO venue link and NO tournament link
- Add "Venues" under service section
- Add "Tournaments" under matching or activity section
- File: `apps/web/src/app/(main)/profile/page.tsx`

#### A-5: Venue Label Sport-Awareness (Task 64 residual)
- 24 hardcoded "..." occurrences across 14 files
- Create `venueLabel(sportType)` in `lib/constants.ts` mapping sport -> venue name (e.g., soccer/futsal -> "구장", swimming -> "수영장", ice_hockey -> "링크장", basketball/badminton -> "체육관", tennis -> "테니스장")
- Replace hardcoded instances in 14 files
- **Exclude** `settings/terms/page.tsx` -- legal text uses generic wording, not sport-specific
- Files: `apps/web/src/lib/constants.ts` + 13 consuming files (excluding terms page)

#### A-6: Team List Search/Filter/Sort (Task 64 residual)
- Team list page has zero search, filter, or sort capability
- Add: sport filter chips, name search input, sort by member count / recent
- File: `apps/web/src/app/(main)/teams/page.tsx`

### Stream B: Frontend-Backend Integration Verification (Data Layer)

**Priority: P1 -- ensures features actually work, not just render**

This is a **runtime verification pass**, not a structural audit (Task 51 handled structure). For each domain, verify:

| Domain | Create Form | List Page Filters | Detail Page Data | API Round-Trip |
|--------|------------|-------------------|-----------------|----------------|
| Matches | `/matches/new` -> `POST /matches` | sport/city/date filters | all fields render | verify |
| Team Matches | `/team-matches/new` -> `POST /team-matches` | teamId/sport filters | applications, check-in, evaluate | verify |
| Teams | `/teams/new` -> `POST /teams` | (Task 64: add filters) | hub tabs data loading | verify |
| Marketplace | `/marketplace/new` -> `POST /marketplace/listings` | category/sport/price | images, seller info, order | verify |
| Lessons | `/lessons/new` -> `POST /lessons` | sport/type/level | ticket purchase, schedule | verify |
| Mercenary | `/mercenary/new` -> `POST /mercenary` | sport/position/city | apply flow, applicant list | verify |
| Tournaments | `/tournaments/new` -> `POST /tournaments` | sport/status/date | registration, bracket | verify |
| Venues | admin-created | sport/city filters | schedule, reviews | verify |
| Chat | auto-created | - | messages, read status | verify |
| Badges | auto-awarded | - | badge collection display | verify |
| Reviews | post-match | - | rating display | verify |
| Payments | in-flow | - | payment history | verify |

#### Verification Method
1. Start dev servers (`make dev` or `pnpm dev`)
2. Seed database (`pnpm db:seed`)
3. For each domain: create -> list -> detail -> verify DB entry via Prisma Studio
4. Document any failures as issues in the Ambiguity Log

### Stream C: Database and API Correctness (Backend)

**Priority: P1 -- ensures backend is production-ready**

#### C-1: Schema-Controller-Service Alignment Audit
- For each controller, verify every `@Get/@Post/@Patch/@Delete` handler has a corresponding service method that uses correct Prisma queries
- Check: are there controllers with stub/mock implementations?
- Check: are there service methods that reference non-existent Prisma models or fields?

#### C-2: Tournaments Domain Completeness
- Controller exists with `GET /`, `GET /:id`, `POST /`
- Missing: `PATCH /:id`, `DELETE /:id`, `POST /:id/register`, `GET /:id/bracket`
- Missing: tournament registration, bracket generation, result recording
- Scope decision: implement basic CRUD + registration, or flag as future work?

#### C-3: Validation Gaps
- Audit all DTOs for missing `class-validator` decorators
- Check: are there endpoints that accept unvalidated body/query params?
- Special attention: payment-related endpoints, auth endpoints

#### C-4: Seed Data Coverage
- Current seed covers: users, teams, matches, lessons, marketplace
- Verify: tournaments, mercenary posts, venues, badges, reviews have seed data
- Missing seed data = features appear empty on first load = "hidden features" perception

---

## Priority Ranking

| Rank | Item | Rationale |
|------|------|-----------|
| 1 | A-1 (Bottom nav "More" tab) | Directly unblocks mobile discoverability for 7+ features |
| 2 | A-2 + A-3 (Sidebar + Home tournaments) | Tournaments are completely invisible |
| 3 | C-4 (Seed data) | Empty pages = "feature doesn't work" perception |
| 4 | A-6 (Team list search/filter) | Task 64 residual, high user impact |
| 5 | B (Integration verification) | Finds silent failures before users do |
| 6 | A-5 (Venue labels) | Task 64 residual, polish |
| 7 | A-4 (Profile links) | Minor discoverability improvement |
| 8 | C-1 + C-2 + C-3 (Backend audit) | Structural correctness |

---

## User Scenarios

### US-1: "I want to find a tournament for my sport"
1. User opens app on mobile
2. Taps "More" in bottom nav -> sees "Tournaments"
3. Browses tournaments filtered by sport
4. Views tournament detail, registers

**Currently broken at:** Step 2 (no nav entry), Step 4 (registration endpoint may be missing)

### US-2: "I want to buy team uniforms"
1. User browses marketplace
2. Filters by category "uniforms" or "team goods"
3. OR navigates to team hub -> "Goods" tab
4. Views listing detail, places order

**Current state:** Marketplace category filter exists. Team hub goods tab exists (Task 48). Need to verify both paths work.

### US-3: "I want to explore all features on mobile"
1. User taps "More" in bottom nav
2. Sees grid: Lessons, Tournaments, Mercenary, Venues, Chat, Notifications, Badges
3. Taps any item, navigates directly

**Currently broken at:** Step 1 ("More" tab doesn't exist)

### US-4: "I want to find a swimming pool venue"
1. User navigates to venues
2. Filters by sport "swimming"
3. Sees venues labeled "swimming pool" not "ballpark"

**Currently broken at:** Step 3 (hardcoded venue label)

### US-5: "I want to search for a basketball team"
1. User goes to teams page
2. Types "Thunder" in search or selects "basketball" filter
3. Sees filtered results

**Currently broken at:** Step 2 (no search or filter UI)

---

## Test Scenarios

### Happy Path
- [ ] Bottom nav "More" tab opens sheet with 7+ feature links
- [ ] Each "More" sheet link navigates to correct page
- [ ] Tournaments page reachable from sidebar, home, and bottom nav "More"
- [ ] `POST /tournaments` creates a tournament, visible in `GET /tournaments`
- [ ] `venueLabel('swimming')` returns sport-appropriate label
- [ ] Team list page filters by sport, searches by name
- [ ] All home page "See all" links navigate to correct list pages
- [ ] Profile page links to venues and tournaments

### Edge Cases
- [ ] "More" sheet dismisses on backdrop tap and ESC key
- [ ] Empty tournament list shows EmptyState with CTA
- [ ] Team search with no results shows EmptyState
- [ ] Venue label falls back gracefully for unknown sport types

### Error Cases
- [ ] Tournament creation without auth redirects to login
- [ ] Invalid tournament ID shows 404 page
- [ ] API timeout on home page shows partial content (not blank page)

### Integration Verification
- [ ] Each domain's create form submits successfully and data appears in list
- [ ] Each domain's detail page loads all fields from API response
- [ ] Chat message persist -> appear in room -> mark as read cycle works
- [ ] Payment flow: prepare -> confirm -> history shows entry

---

## Parallel Work Breakdown

### Phase 1: Navigation Infrastructure (Sequential -- single agent, shared files)

**Agent: frontend-ui-dev**

| Step | Work Item | Files |
|------|-----------|-------|
| 1a | Bottom nav "More" tab + sheet component | `components/layout/bottom-nav.tsx`, NEW `components/layout/more-sheet.tsx` |
| 1b | Sidebar add tournaments | `components/layout/sidebar.tsx` |
| 1c | Add `useTournaments()` hook + Tournament type (needed before home page can render tournaments) | `hooks/use-api.ts`, `types/api.ts` |
| 1d | Home page tournaments section + chip (depends on 1c) | `app/(main)/home/home-client.tsx`, `app/(main)/home/page.tsx` (server prefetch) |
| 1e | Profile page venue + tournament links | `app/(main)/profile/page.tsx` |

### Phase 2: Feature Page Improvements (Parallel -- independent leaf files)

**Agent: frontend-ui-dev** (team list) + **frontend-data-dev** (hooks/types)

| Work Item | Agent | Files | Touches shared? |
|-----------|-------|-------|-----------------|
| A-5: `venueLabel()` + replacements | frontend-ui-dev | `lib/constants.ts` + 13 pages | YES (constants.ts first, then pages) |
| A-6: Team list search/filter/sort | frontend-ui-dev | `app/(main)/teams/page.tsx` | No |

Note: `useTournaments()` hook + Tournament type moved to Phase 1 (step 1c) to avoid compile errors in Phase 1 step 1d.

### Phase 3: Backend Audit + Tournaments Completeness (Parallel with Phase 2)

**Agent: backend-api-dev**

| Work Item | Files |
|-----------|-------|
| C-2: Tournament registration endpoint | `tournaments.controller.ts`, `tournaments.service.ts`, `dto/` |
| C-4: Seed data for tournaments, mercenary, venues | `prisma/seed.ts` |
| C-5: Add `search` query param to `GET /teams` | `teams.controller.ts`, `teams.service.ts` -- add `@Query('search') search?: string`, Prisma `name: { contains: search, mode: 'insensitive' }` |
| C-1: Controller-service alignment spot check | All controllers (read-only audit, fix only confirmed issues) |

### Phase 4: Integration Verification (Sequential, after Phases 1-3)

**Agent: frontend-data-dev** (or dedicated QA agent)

- Run through Stream B verification matrix
- Document results in task completion report
- Fix any discovered integration failures

### Dependency Graph

```
Phase 1 (nav infra, sequential) ─────────────────────> Phase 4 (integration verification)
                                                          ^
Phase 2 (leaf pages + hooks, parallel) ──────────────────┘
                                                          ^
Phase 3 (backend audit + seed, parallel with Phase 2) ───┘
```

**Do NOT touch rules** (conflict prevention):
- Phase 2 agents: Do NOT modify `bottom-nav.tsx`, `sidebar.tsx`, `home-client.tsx`, `profile/page.tsx` (Phase 1 owns these)
- Phase 3 agents: Do NOT modify any frontend files
- `lib/constants.ts` is a shared file -- Phase 2 `venueLabel` work must complete before Phase 2 parallel page updates begin

---

## Acceptance Criteria

1. Bottom nav has a mechanism (More tab or restructure) that exposes Lessons, Tournaments, Mercenary, Venues, Chat, Notifications within 2 taps
2. Tournaments page is reachable from sidebar, home page, and bottom nav
3. `venueLabel(sportType)` exists in `lib/constants.ts` and all 24 hardcoded instances are replaced
4. Team list page has sport filter chips and name search input
5. Profile page links to venues and tournaments
6. Tournament seed data exists so the page doesn't appear empty
7. `tsc --noEmit` passes for `apps/web`
8. `pnpm test` passes for `apps/api` (existing + any new tests)
9. All 12 domains in Stream B verification matrix confirmed working (or issues documented in Ambiguity Log)
10. No regression in existing E2E tests

---

## Tech Debt Resolved

- [ ] Task 64 residual: `venueLabel()` function and hardcoded venue name replacement
- [ ] Task 64 residual: Team list search/filter/sort
- [ ] Task 64 residual: Venue link in profile page
- [ ] Task 27 Ambiguity #1: Bottom nav restructure decision (was OPEN, now resolved)
- [ ] Tournaments: zero navigation entry anywhere in the app
- [ ] Seed data gaps causing "empty feature" perception

---

## Security Notes

- Bottom nav "More" sheet: No new auth surfaces. Links to protected pages still use `useRequireAuth()`.
- Tournament registration endpoint: Must use `JwtAuthGuard`. Must prevent duplicate registration (idempotency). Must not expose other registrants' personal info.
- Seed data: Must not contain real user data. Use fictional personas from `test/fixtures/personas.ts`.
- Team list search: Backend query must use parameterized queries (Prisma handles this). No raw SQL injection risk.

---

## Risks and Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| "More" tab adds UX complexity (extra tap) | Users may not discover the sheet | Use clear icon (grid/menu), add subtle badge for unread counts |
| Tournament backend may be a stub (minimal controller) | Registration/bracket features missing | Scope to basic CRUD + list/detail + registration. Bracket is future work. |
| `venueLabel` replacement across 14 files is mechanical but wide | Typo or missed instance | `grep -rn "구장" apps/web/src/` after replacement to verify zero remaining (exclude `settings/terms/page.tsx` -- legal text) |
| Integration verification is time-intensive | May not finish in one session | Prioritize create+list for each domain, defer edge-case flows |
| Team list search needs backend `search` param (confirmed missing) | Frontend filter won't work without it | Phase 3 C-5 adds `search` query param. Frontend A-6 must wait for or not depend on this (client-side filter as fallback) |

---

## Ambiguity Log

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Bottom nav: "More" tab vs. restructure to different 5 items? | **OPEN** | Recommend "More" tab (6th item) -- preserves existing 5-tab muscle memory while exposing everything else. Alternative: replace "Marketplace" with "More" and move marketplace inside. Needs user input. |
| 2 | Tournament scope: full lifecycle (bracket, results, standings) or basic CRUD + registration? | **OPEN** | Recommend basic CRUD + registration for this task. Full lifecycle is a separate task (estimated 2+ weeks). |
| 3 | Team list backend search: does `GET /teams` already support `?search=` query param? | **RESOLVED** | Verified: `GET /teams` accepts `sportType`, `city`, `recruiting`, `cursor`, `limit` only. NO `search` param. Backend-api-dev must add `@Query('search') search?: string` to controller + Prisma `contains` filter in service. Added to Phase 3 scope. |
| 4 | Integration verification: should this be manual (dev runs through flows) or automated (new E2E tests)? | **OPEN** | Recommend manual first pass to identify issues, then prioritize E2E for critical flows (match creation, payment) in a follow-up task. Tech-planner should define concrete pass/fail criteria per domain before Phase 4 begins. |
