# Task 27: Feature Discoverability Gap Resolution

## Context

MatchUp has 12+ core feature domains implemented across backend API and frontend pages, but users cannot effectively discover or reach many of them. The gap between "feature exists in code" and "user can find it in the app" is the single largest UX issue in the current build.

**Root causes identified:**
1. Bottom navigation exposes only 5 of 12+ feature areas (Home, Matches, Lessons, Marketplace, Profile)
2. Several fully-implemented pages have zero inbound links from any navigation surface
3. Critical user flows terminate at dead-ends (missing detail pages, unimplemented API endpoints)
4. Sport type filters are hardcoded to 2 of 11 available sports in multiple locations
5. Mock data remains in production-facing pages, masking real API state

## Goal

Close the discoverability gap so that every implemented feature is reachable within 2 taps from a primary navigation surface (bottom nav, sidebar, home page, or profile page). Fix all P0 dead-ends that prevent users from completing core user scenarios.

---

## Feature x Scenario Matrix

### A. Individual Matching (`/matches`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse matches by sport | Bottom nav "Matches" / Home sport filter | OK |
| Create a match | Home CTA / Sidebar CTA | OK |
| View match detail | Match list card tap | OK |
| View my match history | Profile > "Match history" | OK |

### B. Team Matching (`/team-matches`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse team matches | Sidebar "Team Matching" (desktop only) | **P1: No mobile bottom-nav entry** |
| Create team match | `/team-matches/new` | **P1: Only reachable via sidebar or direct URL on mobile** |
| View team match detail | Team match list card | OK |
| Manage my team matches | Profile > "My Team Matches" | OK (but mock data shown, P2) |
| View my applications | Profile > "My Team Matches" > "Applied" tab | OK |

### C. Teams (`/teams`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse teams | Home "Active Teams" / Sidebar "Teams" | **P1: No mobile bottom-nav entry; Home section only shows if data exists** |
| View team detail | Team card tap | OK |
| Create a team | `/teams/new` (no prominent CTA) | **P1: Only sidebar link, no CTA on teams list page mobile** |
| Apply to join a team | Team detail "Join" button | **P0: `POST /teams/:id/apply` not implemented in backend** |
| View my teams | Profile > "My Teams" | OK |

### D. Mercenary / Sub (`/mercenary`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse mercenary posts | Home banner (rotating) / Profile section | **P1: No nav entry (bottom or sidebar); banner is intermittent** |
| View mercenary detail | Mercenary list card | **P0: `/mercenary/[id]` page.tsx missing; tap goes to dead-end** |
| Create mercenary post | Profile > "Mercenary" section CTA | OK (requires team) |
| Apply as mercenary | Mercenary list inline button | OK (API works) |
| View my mercenary posts | Profile > "My Mercenary" | OK (mock data fallback, P2) |

### E. Marketplace (`/marketplace`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse listings | Bottom nav "Marketplace" / Home section | OK |
| View listing detail | Listing card tap | OK |
| Create listing | `/marketplace/new` | **P1: No prominent CTA on listing page mobile** |
| View my listings | Profile > "My Listings" | OK |

### F. Lessons (`/lessons`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse lessons | Bottom nav "Lessons" / Home section | OK |
| View lesson detail | Lesson card tap | OK |
| Create lesson | `/lessons/new` | **P1: No prominent CTA on lessons page mobile** |
| View my lessons | Profile > "My Lessons" | OK |
| View my tickets | Profile > "My Tickets" | OK |

### G. Venues (`/venues`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Browse venues | None (no nav link anywhere) | **P0: Page exists but zero inbound links from any nav** |
| View venue detail | Venue list card tap | OK (if you can reach the list) |

### H. Chat (`/chat`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| View chat rooms | Profile > "Chat" shortcut / Sidebar | **P1: No bottom-nav entry** |
| Open chat room | Chat list tap | OK |

### I. Badges (`/badges`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| View all badges | None (no nav link anywhere) | **P0: Page exists but zero inbound links** |

### J. Feed (`/feed`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| View activity feed | None (no nav link anywhere) | **P0: Page exists but zero inbound links** |

### K. Reviews (`/reviews`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| Write pending reviews | Profile > "My Reviews" | OK |
| View received reviews | Profile > "Received Reviews" | OK |

### L. Notifications (`/notifications`)
| Scenario | Entry Point | Status |
|----------|-------------|--------|
| View notifications | Profile > "Notifications" shortcut / Sidebar | **P1: No bottom-nav entry** |

### M. Sport Type Hardcoding
| Location | Current | Should Be |
|----------|---------|-----------|
| `/team-matches/new` sportOptions | soccer, futsal only | All 11 from `sportLabel` |
| `/mercenary` sportFilters | soccer, futsal only | All 11 from `sportLabel` |

---

## Priority Classification

### P0 -- Dead-End or Zero Entry Points (must fix this task)

- [ ] **P0-1**: `/mercenary/[id]` detail page missing -- mercenary list links to a non-existent page
- [ ] **P0-2**: `/venues` -- fully implemented page with zero navigation links from anywhere
- [ ] **P0-3**: `/badges` -- fully implemented page with zero navigation links from anywhere
- [ ] **P0-4**: `/feed` -- fully implemented page with zero navigation links from anywhere
- [ ] **P0-5**: `POST /teams/:id/apply` -- backend endpoint not implemented; frontend button calls it and gets 404
- [ ] **P0-6**: Team match creation hardcoded to 2 sports -- users of basketball/badminton/hockey etc. cannot create team matches
- [ ] **P0-7**: Mercenary filter hardcoded to 2 sports -- users cannot filter by their sport

### P1 -- Feature Exists But Hard to Find (should fix this task)

- [ ] **P1-1**: Team matching has no mobile bottom-nav or home quick-link entry
- [ ] **P1-2**: Mercenary has no navigation entry (bottom nav, sidebar) -- only via rotating home banner or profile
- [ ] **P1-3**: Venues has no sidebar entry
- [ ] **P1-4**: Chat/Notifications not in bottom nav (accessible only through profile or desktop sidebar)

### P2 -- Mock Data / Incomplete Integration (nice-to-have this task)

- [ ] **P2-1**: `/my/team-matches` falls back to `mockTeamMatches` array when API returns no items
- [ ] **P2-2**: `/my/mercenary` falls back to `mockMercenaryPosts` array when API returns no items

---

## Original Conditions (from user request)

- [ ] All implemented features cataloged with user scenarios
- [ ] Every feature's entry points (navigation paths) identified
- [ ] P0 dead-end items fixed -- users can complete full flows
- [ ] P0 orphan pages connected to navigation
- [ ] Sport type hardcoding replaced with full `sportLabel` constant
- [ ] No documentation-only changes -- all fixes are UI/Navigation code
- [ ] Known Blockers from CLAUDE.md addressed (items 3, 4, 5)
- [ ] Mock data fallbacks in `/my/team-matches` and `/my/mercenary` removed or clearly gated

---

## User Scenarios

### US-1: "I want to find a substitute player for my team's match"
1. User opens app -> Bottom nav or home -> taps "Mercenary" link
2. Browses mercenary posts, filters by sport
3. Taps a post to see details
4. Applies as mercenary

**Currently broken at:** Step 1 (no nav entry on mobile), Step 2 (only 2 sports), Step 3 (no detail page)

### US-2: "I want to create a team match for basketball"
1. User navigates to team matching
2. Taps "Create team match"
3. Selects basketball as sport type
4. Fills in details and submits

**Currently broken at:** Step 1 (no mobile nav), Step 3 (basketball not in sport options)

### US-3: "I want to find a venue near me"
1. User looks for "Venues" in navigation
2. Browses venue list with sport/city filters
3. Views venue detail

**Currently broken at:** Step 1 (no nav link exists)

### US-4: "I want to join a team"
1. User browses teams
2. Views team detail
3. Taps "Join team"
4. Team owner approves

**Currently broken at:** Step 3 (backend returns 404 on apply)

### US-5: "I want to see my earned badges"
1. User looks for "Badges" in profile or navigation
2. Views badge collection page

**Currently broken at:** Step 1 (no link from anywhere)

---

## Test Scenarios

### Happy Path
- [ ] User can reach `/mercenary` from bottom nav or home within 2 taps
- [ ] User can tap a mercenary post and see its detail page (`/mercenary/[id]`)
- [ ] User can reach `/venues` from navigation within 2 taps
- [ ] User can reach `/badges` from profile page
- [ ] User can reach `/feed` from navigation
- [ ] User can reach `/team-matches` from bottom nav or home within 2 taps on mobile
- [ ] User can create team match for all 11 sport types
- [ ] User can filter mercenary posts by all 11 sport types
- [ ] `POST /teams/:id/apply` returns 201 for authenticated non-member

### Edge Cases
- [ ] Sport filter shows all sports even when no posts exist for some
- [ ] Mercenary detail page shows 404 state for non-existent ID
- [ ] Team apply button shows appropriate message for already-applied users
- [ ] `/my/team-matches` shows EmptyState (not mock data) when API returns empty

### Error Cases
- [ ] `/mercenary/[id]` with invalid ID shows error state, not crash
- [ ] Team apply fails gracefully when backend returns error
- [ ] Navigation works correctly for non-authenticated users (redirects to login where needed)

### Mock Updates
- [ ] Remove `mockTeamMatches` from `/my/team-matches/page.tsx` -- use API data or EmptyState
- [ ] Remove `mockMercenaryPosts` from `/my/mercenary/page.tsx` -- use API data or EmptyState

---

## Parallel Work Breakdown

### Backend (Sequential)

**B-1: Implement `POST /teams/:id/apply` endpoint**
- Add `apply()` method to `TeamsController` and `TeamsService`
- Create `TeamApplication` handling (or reuse invitation flow with `status: pending`)
- Guard: `JwtAuthGuard`, reject if already a member or already applied
- Return 201 on success, 409 on duplicate
- Files: `teams.controller.ts`, `teams.service.ts`, possibly `prisma/schema.prisma` if TeamApplication model needed

**B-2: Add `GET /mercenary/:id` detail response enrichment (if needed)**
- Verify the existing `@Get(':id')` endpoint returns sufficient data for a detail page
- Ensure it includes team info, match details, position, fee, notes, applicant count
- Files: `mercenary.controller.ts`, `mercenary.service.ts`

### Frontend -- Group 1: Navigation Infrastructure (Sequential, single agent)

**F-1: Update bottom navigation**
- Restructure bottom nav to expose more features. Options:
  - Option A: Add a "More" tab that opens a quick-access menu (teams, team-matches, mercenary, venues, chat)
  - Option B: Replace one tab or restructure to 5 most important (recommended: Home, Matches, Teams/TeamMatch, Marketplace, Profile)
- The choice impacts all other navigation work, so this must be decided and committed first
- Files: `components/layout/bottom-nav.tsx`

**F-2: Update sidebar navigation**
- Add missing entries: Venues, Mercenary (under "Explore" or new section)
- Add Badges link (under profile or new section)
- Files: `components/layout/sidebar.tsx`

**F-3: Add entry points on Home page**
- Add quick-access grid/row for: Team Matching, Mercenary, Venues (below sport filter or in explore zone)
- Currently only banner rotation mentions mercenary -- make it a persistent entry
- Files: `app/(main)/home/page.tsx`

**F-4: Add entry points on Profile page**
- Add link to `/badges` (e.g. badge count stat becomes tappable)
- Add link to `/feed` (activity feed)
- Ensure venues has an entry somewhere accessible
- Files: `app/(main)/profile/page.tsx`

### Frontend -- Group 2: Page Fixes (Parallel, independent files)

**F-5: Create `/mercenary/[id]/page.tsx`**
- New file (no conflict risk)
- Fetch mercenary post detail via `GET /mercenary/:id`
- Display: team info, sport, position, date/time, venue, fee, level, notes, applicant count
- CTA: "Apply" button (reuse logic from list page)
- Back link, breadcrumb
- Files: `app/(main)/mercenary/[id]/page.tsx` (NEW), `app/(main)/mercenary/[id]/loading.tsx` (NEW)

**F-6: Fix sport type hardcoding**
- `/team-matches/new/page.tsx`: Replace `sportOptions` array with full list from `sportLabel`
- `/mercenary/page.tsx`: Replace `sportFilters` array with full list from `sportLabel`
- Files: `app/(main)/team-matches/new/page.tsx`, `app/(main)/mercenary/page.tsx`

**F-7: Remove mock data fallbacks**
- `/my/team-matches/page.tsx`: Remove `mockTeamMatches`, use API-only data, show EmptyState when empty
- `/my/mercenary/page.tsx`: Remove `mockMercenaryPosts`, use API-only data, show EmptyState when empty
- Files: `app/(main)/my/team-matches/page.tsx`, `app/(main)/my/mercenary/page.tsx`

**F-8: Wire orphan pages to navigation**
- `/badges`: Add link from profile page badge stat area
- `/feed`: Add link from profile page or as notification/activity center entry
- `/venues`: Add to sidebar "Explore" section + home page explore zone
- Files: varies by F-1/F-2/F-3/F-4 decisions (may merge into those tasks)

### Dependency Graph

```
B-1 (teams apply) ──────────────────────────────> done
B-2 (mercenary detail API) ─────────────────────> done
                                                    |
F-1 (bottom nav) ── sequential ── F-2 (sidebar) ── F-3 (home) ── F-4 (profile)
                                                    |
F-5 (mercenary detail page) ──────> parallel ──────> done
F-6 (sport hardcoding fix) ───────> parallel ──────> done
F-7 (mock data removal) ─────────> parallel ──────> done
```

F-1 through F-4 are sequential (shared navigation files).
F-5, F-6, F-7 are parallel with each other and with F-1..F-4 (independent leaf files).
B-1 and B-2 are parallel with all frontend work.

---

## Acceptance Criteria

1. Every page listed under `app/(main)/` is reachable from at least one navigation surface within 2 taps
2. `/mercenary/[id]` detail page renders correctly with API data
3. `POST /teams/:id/apply` returns 201 for valid request, 409 for duplicate
4. Team match creation offers all 11 sport types from `sportLabel`
5. Mercenary list filter offers all 11 sport types from `sportLabel`
6. No `mock*` constants remain in `/my/team-matches` and `/my/mercenary` pages
7. `tsc --noEmit` passes for `apps/web`
8. Backend unit tests pass for new teams apply endpoint
9. All existing E2E tests continue to pass

---

## Tech Debt Resolved

- [x] `/mercenary/[id]` dead-end (Known Blocker #3 from CLAUDE.md)
- [x] Sport type hardcoding in team-matches/new (Known Blocker #4)
- [x] Sport type hardcoding in mercenary filter (Known Blocker #5)
- [x] `POST /teams/:id/apply` missing (Known Blocker #6)
- [x] Mock data in `/my/team-matches` (Known Blocker #7)
- [x] Mock data in `/my/mercenary` (similar to #7)
- [x] Orphan pages (`/badges`, `/feed`, `/venues`) with zero inbound navigation

---

## Security Notes

- `POST /teams/:id/apply`: Must be guarded by `JwtAuthGuard`. Must prevent duplicate applications (idempotency check). Must not leak team member information in error responses.
- Mercenary detail page: No new auth requirements (detail view is public like list). Apply action requires auth (existing pattern).
- Navigation changes: No new auth surfaces. Existing `useRequireAuth()` patterns on protected pages remain unchanged.
- Sport type expansion: No security impact (sport types are enum values, validated by backend DTO).

---

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bottom nav restructuring breaks existing E2E selectors | E2E tests fail | Update `data-testid` selectors in E2E tests if nav structure changes |
| `POST /teams/:id/apply` requires new Prisma model | Schema migration needed | Check if existing `TeamMembership` with `status: pending` suffices, or if `TeamInvitation` model can be repurposed |
| Home page quick-access grid adds visual clutter | UX regression | Keep it minimal (icon + label only), test on mobile viewport |
| Removing mock data exposes empty states to users | Perceived as broken | Ensure EmptyState components have clear CTAs ("Create first match", "Find team matches") |

---

## Ambiguity Log

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Should bottom nav add a 6th item or replace one of the existing 5? | **OPEN** | Recommend Option B: restructure to Home / Matches / Teams / Marketplace / Profile. "Lessons" moves to home explore zone + sidebar. Team-matches and mercenary reachable from Teams hub. Final decision needed from user. |
| 2 | Should `POST /teams/:id/apply` create a `TeamMembership(status: pending)` or a separate `TeamApplication` model? | **OPEN** | Recommend reuse `TeamInvitation` model (already has accept/decline flow) with direction flag, or create `TeamMembership` with `pending` status. Backend dev to investigate schema. |
| 3 | Should `/feed` be merged with `/notifications` or remain a separate page? | **OPEN** | Currently `/feed` shows notifications in a different layout. Consider merging into `/notifications` and removing `/feed` as a separate route. |
| 4 | Where should "Venues" appear in the mobile nav hierarchy? | **OPEN** | Recommend: Home explore zone (persistent card) + sidebar. Not important enough for bottom nav. |
