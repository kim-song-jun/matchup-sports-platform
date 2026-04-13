# Task 28: Platform Usability Improvement -- Technical Plan

**Status: PLANNING**

## Context

Task 27 (Feature Discoverability) resolved P0 dead-ends (missing pages, zero-inbound links, hardcoded sport types). However, a second layer of usability issues remains:

1. **Navigation is still shallow**: Bottom nav has 5 tabs (Home / Matches / Teams / Marketplace / Profile). Lessons, Team Matches, Mercenary, Venues, Chat, Tournaments, Badges, Feed are only accessible through sidebar (desktop) or deep profile links.
2. **Home page lacks sections for Tournaments**: Tournaments have a full backend (`/tournaments` CRUD), frontend pages (`/tournaments`, `/tournaments/new`, `/tournaments/[id]`), hooks (`useTournaments`, `useCreateTournament`), and a Prisma model -- but zero home page presence.
3. **Team Hub registration actions require scrolling on mobile**: The sidebar with "Goods / Pass / Event registration" links renders below the main content on mobile (stacked layout). Managers must scroll past all hub content to find them. On desktop, they're sticky in a side column.
4. **Cross-linking is incomplete**: Marketplace listings linked to a team don't back-link to the parent team. Same for lessons and tournaments.
5. **Badges page uses hardcoded mock data**: `allBadges` array is hardcoded alongside the `useAllBadgeTypes()` hook. API data is fetched but not necessarily used as source of truth.
6. **Feed page is essentially a notifications re-render**: `/feed` uses `useNotifications()` and groups by time period -- it's unclear how it differs from `/notifications`.

---

## Goal

Close the remaining usability gap so that every feature with a working backend + frontend is surfaced in mobile navigation within 2 taps, home page sections represent the full feature set, and the Team Hub works equally well on mobile and desktop.

---

## 1. Navigation Architecture

### ADR: Bottom Nav Strategy

**Context**: 5-tab bottom nav cannot expose 12+ feature domains. Task 27 left bottom nav unchanged (Home / Matches / Teams / Marketplace / Profile). Users on mobile must know to scroll the home page or visit profile to find team-matches, mercenary, lessons, venues, tournaments, chat, etc.

**Decision**: Replace "Profile" tab with "More" tab that opens a slide-up sheet menu. Profile remains accessible as the first item in the More menu.

**Rationale**:
- Keeps bottom nav at 5 items (UX best practice)
- The "More" menu exposes all secondary features in a single tap
- Profile is still 2 taps away (same as current sidebar on desktop)
- Pattern used by KakaoTalk, Toss, Naver -- familiar to Korean users

**More Menu Contents** (slide-up sheet, grouped):

```
[Profile avatar + name]      <- tappable -> /profile

Matching
  Team Matching              -> /team-matches
  Mercenary                  -> /mercenary

Explore
  Lessons                    -> /lessons
  Tournaments                -> /tournaments
  Venues                     -> /venues

Communication
  Chat [unread badge]        -> /chat
  Notifications [badge]      -> /notifications

Activity
  Badges                     -> /badges
```

NOTE: `/feed` is intentionally excluded from the More menu. It is essentially a re-render of `/notifications` grouped by time period. Both use `useNotifications()`. Surfacing both in top-level navigation would create user confusion. Feed remains accessible from Profile page only, pending a product decision on whether to merge or differentiate it from Notifications.

**Accessibility requirements** (WCAG 2.1 AA, per CLAUDE.md):
- `role="dialog"` + `aria-modal="true"` on the sheet container
- ESC key handler to close
- Focus trap: first focusable element receives focus on open, focus cycles within sheet
- Backdrop click closes sheet
- `aria-label="navigation menu"` on the sheet
- All items have sufficient touch targets (min 44x44px)

**Consequences**:
- Profile tab testId (`bottom-nav-profile`) becomes `bottom-nav-more`; E2E selectors must update
- Unread badge logic moves from Profile icon to More icon
- More menu needs its own component (`components/layout/more-menu.tsx`)
- Sidebar (`sidebar.tsx`) remains unchanged (desktop already has full navigation)

### Sidebar Updates

Add missing entries to sidebar:
- Under "Explore": add `Tournaments` (Trophy icon) between Mercenary and Venues
- Under "Explore" or bottom: add `Badges` (Award icon) -- accessible from sidebar for desktop users

### File Changes

| File | Change |
|------|--------|
| `components/layout/bottom-nav.tsx` | Replace Profile tab with More tab; add `MoreMenu` toggle state |
| `components/layout/more-menu.tsx` | **NEW**: Slide-up sheet with grouped navigation links |
| `components/layout/sidebar.tsx` | Add Tournaments to Explore; add Activity section with Badges/Feed |
| `messages/ko.json` | Add i18n keys: `nav.more`, `nav.tournaments`, `nav.badges` |
| `messages/en.json` | Same keys in English |

---

## 2. Home Page Enhancement Plan

### Sections to Add

**A. Tournaments section** (in Zone 3, between Teams and Lessons):
- Use `useTournaments({ limit: '3' })` (hook already exists)
- `SectionHeader` with title "upcoming tournaments" + "view more" -> `/tournaments`
- Horizontal scroll card list (same pattern as teams)
- Card: title, sportType badge, date range, status pill, entryFee

**B. Quick-access row enhancement**:
- Current "quick explore" row has: Lessons, Team Matching, Mercenary, Venues
- Add: Tournaments (Trophy icon)
- Consider: Badges (Award icon) -- but only if authenticated

**C. "See all" link audit**:
Every home section must have a `SectionHeader` with `href` set. Current state:

| Section | Has "see all"? | Target |
|---------|----------------|--------|
| Upcoming Schedule | Yes -> `/my/matches` | OK |
| Match Discovery | Yes -> `/matches` or `/matches?sport=X` | OK |
| Active Teams | Yes -> `/teams` | OK |
| Recommended Lessons | Yes -> `/lessons` | OK |
| Latest Marketplace | Yes -> `/marketplace` | OK |
| Tournaments | **MISSING** (section doesn't exist yet) | Add -> `/tournaments` |

### File Changes

| File | Change |
|------|--------|
| `app/(main)/home/home-client.tsx` | Add tournaments section in Zone 3; add Tournaments to quick-access chips; add `useTournaments` import |

---

## 3. Team Hub Improvements

### ADR: Mobile Hub Registration Prominence

**Context**: Team detail page has a sidebar (`detail-sidebar`) that renders below the main content on mobile (CSS stacks when `@3xl` not met). The registration links (Goods / Pass / Event) ARE accessible on mobile, but only after scrolling past all hub content + gallery + member grid. Managers must scroll to the very bottom to find them.

**Decision**: Add inline hub action buttons directly below the hub tabs (between tab strip and content area) on mobile, visible only when `canManageCatalog` is true. These are quick-access duplicates of the sidebar links.

**Rejected alternatives**:
- FAB (floating action button): Adds z-index complexity and redundancy with sidebar which IS rendered on mobile.
- No change: Leaving registration buried at bottom is the current usability problem.

**Consequences**:
- Inline buttons in `teams/[id]/page.tsx` below the `HubSectionTab` strip, wrapped in `@3xl:hidden`
- Same links as sidebar: marketplace/new, lessons/new, tournaments/new (with teamId params)
- No new component needed -- 3 simple Link elements
- No backend changes needed

### Cross-linking

**A. Marketplace listing -> parent team**:
- If `listing.teamId` exists, show a "Team: {teamName}" link badge on the listing detail page
- File: `app/(main)/marketplace/[id]/page.tsx`
- Backend: `GET /marketplace/listings/:id` already returns `teamId` and `team` relation (verify)

**B. Lesson -> parent team**:
- If `lesson.teamId` exists, show team link on lesson detail
- File: `app/(main)/lessons/[id]/page.tsx`
- Backend: `GET /lessons/:id` already returns `teamId` (verify)

**C. Tournament -> parent team**:
- If `tournament.teamId` exists, show team link on tournament detail
- File: `app/(main)/tournaments/[id]/page.tsx`
- Backend: `GET /tournaments/:id` already returns `teamId` and `team` relation

### File Changes

| File | Change |
|------|--------|
| `app/(main)/teams/[id]/page.tsx` | Add inline hub action buttons below tab strip for managers on mobile (`@3xl:hidden`) |
| `app/(main)/marketplace/[id]/page.tsx` | Add team back-link if `listing.teamId` exists |
| `app/(main)/lessons/[id]/page.tsx` | Add team back-link if `lesson.teamId` exists |
| `app/(main)/tournaments/[id]/page.tsx` | Add team back-link if `tournament.teamId` exists |

---

## 4. Integration Audit Checklist

For each feature domain, verify the full cycle: **Form -> API endpoint -> DB write -> API read -> Frontend display**.

### A. Individual Matches

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /matches` | Submit form at `/matches/new`, check DB `Match` row |
| List | `GET /matches` | Home page + `/matches` show new match |
| Detail | `GET /matches/:id` | Tap card -> detail renders |
| Join | `POST /matches/:id/join` | Join button -> `MatchParticipant` row created |
| Cancel | `POST /matches/:id/cancel` | Cancel button -> status changes |

### B. Team Matches

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /team-matches` | Form at `/team-matches/new` |
| List | `GET /team-matches` | `/team-matches` page + home upcoming |
| Detail | `GET /team-matches/:id` | Card tap -> detail |
| Apply | `POST /team-matches/:id/apply` | Apply button -> application created |
| Approve | `PATCH /team-matches/:id/applications/:appId/approve` | Host approves |

### C. Teams

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /teams` | Form at `/teams/new` |
| List | `GET /teams` | `/teams` page + home section |
| Detail | `GET /teams/:id` | Card tap -> detail |
| Hub | `GET /teams/:id/hub` | Hub tabs render counts |
| Apply | `POST /teams/:id/apply` | Apply button -> 201/409 |
| Members | `GET /teams/:id/members` | Members tab |

### D. Mercenary

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /mercenary` | Form at `/mercenary/new` |
| List | `GET /mercenary` | `/mercenary` page |
| Detail | `GET /mercenary/:id` | Card tap -> detail |
| Apply | `POST /mercenary/:id/apply` | Apply button |

### E. Marketplace

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /marketplace/listings` | Form at `/marketplace/new` |
| List | `GET /marketplace/listings` | `/marketplace` page + home |
| Detail | `GET /marketplace/listings/:id` | Card tap -> detail |
| Order | `POST /marketplace/listings/:id/order` | Order button |

### F. Lessons

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /lessons` | Form at `/lessons/new` |
| List | `GET /lessons` | `/lessons` page + home |
| Detail | `GET /lessons/:id` | Card tap -> detail |

### G. Tournaments

| Step | What | How to verify |
|------|------|---------------|
| Create | `POST /tournaments` | Form at `/tournaments/new` |
| List | `GET /tournaments` | `/tournaments` page (verify home section after this task) |
| Detail | `GET /tournaments/:id` | Card tap -> detail |

### H. Chat

| Step | What | How to verify |
|------|------|---------------|
| List rooms | `GET /chat/rooms` | `/chat` page |
| Room detail | `GET /chat/rooms/:id` | Room tap -> messages load |
| Send message | `POST /chat/rooms/:id/messages` | Message appears in room |
| WS sync | `chat:message` event | Second user sees message in real-time |

### I. Payments

| Step | What | How to verify |
|------|------|---------------|
| Prepare | `POST /payments/prepare` | Payment flow start |
| Confirm | `POST /payments/confirm` | Payment confirmed |
| History | `GET /payments/me` | `/payments` page lists transactions |

### J. Badges

| Step | What | How to verify |
|------|------|---------------|
| List all types | `GET /badges` | `/badges` page renders badge grid |
| Team badges | `GET /badges/team/:id` | Team detail shows badges |
| **NOTE** | Badges page has hardcoded `allBadges` mock | Must verify if `useAllBadgeTypes()` data replaces hardcoded array or supplements it |

### K. Notifications

| Step | What | How to verify |
|------|------|---------------|
| List | `GET /notifications` | `/notifications` page |
| Mark read | `PATCH /notifications/:id/read` | Read state updates |
| Push subscribe | `POST /notifications/push-subscribe` | VAPID subscription stored |

### L. Reviews

| Step | What | How to verify |
|------|------|---------------|
| Write | Pending reviews flow | Review submitted and stored |
| Read received | `GET` received reviews | `/my/reviews-received` page |

---

## 5. Parallel Work Decomposition

### Wave 1: Navigation Infrastructure (Sequential -- shared files)

**Agent: frontend-ui-dev** (single agent, sequential)

These files are shared navigation infrastructure. One agent must handle them to avoid write conflicts.

| Task | Files | Dependencies |
|------|-------|-------------|
| W1-A: More menu component | `components/layout/more-menu.tsx` (**NEW**) | None |
| W1-B: Bottom nav update | `components/layout/bottom-nav.tsx` | W1-A (imports MoreMenu) |
| W1-C: Sidebar update | `components/layout/sidebar.tsx` | None (parallel with W1-B but same agent) |
| W1-D: i18n keys | `messages/ko.json`, `messages/en.json` | W1-A (needs key names) |
| W1-E: E2E selector update | `e2e/tests/home.spec.ts` (line ~110: `bottom-nav-profile` -> `bottom-nav-more`) | W1-B |

**Do NOT touch**: `home-client.tsx`, `teams/[id]/page.tsx`, any detail pages

### Wave 2: Content Enhancements (Parallel -- leaf files)

After Wave 1 completes, these are independent leaf changes.

**Agent A: frontend-ui-dev** (home page)

| Task | Files |
|------|-------|
| W2-A: Home tournaments section | `app/(main)/home/home-client.tsx` |

**Agent B: frontend-data-dev** (team hub mobile)

| Task | Files |
|------|-------|
| W2-B: Team detail inline hub actions for mobile | `app/(main)/teams/[id]/page.tsx` |

**Agent C: frontend-ui-dev** or separate (cross-links)

| Task | Files |
|------|-------|
| W2-C1: Marketplace team back-link | `app/(main)/marketplace/[id]/page.tsx` |
| W2-C2: Lesson team back-link | `app/(main)/lessons/[id]/page.tsx` |
| W2-C3: Tournament team back-link | `app/(main)/tournaments/[id]/page.tsx` |

### Wave 2-parallel: Tech Debt Cleanup (runs alongside Wave 2 -- independent leaf files)

**Agent D: frontend-data-dev** (badges)

| Task | Files |
|------|-------|
| W2-D: Badges page -- replace hardcoded array with API data | `app/(main)/badges/page.tsx` |

NOTE: Feed page (`/feed`) evaluation deferred. It uses `useNotifications()` identically to `/notifications`. Product decision needed before code changes.

### Backend (Parallel with all frontend waves)

| Task | Files | Agent |
|------|-------|-------|
| B-1: Verify `GET /tournaments` returns `team` relation in list response | `apps/api/src/tournaments/tournaments.service.ts` | backend-api-dev |
| B-2: Verify `GET /marketplace/listings/:id` returns `team` relation | `apps/api/src/marketplace/marketplace.service.ts` | backend-api-dev |
| B-3: Verify `GET /lessons/:id` returns `teamId` | `apps/api/src/lessons/lessons.service.ts` | backend-api-dev |

### Shared Files (must NOT be touched by parallel agents)

| File | Owner |
|------|-------|
| `components/layout/bottom-nav.tsx` | Wave 1 agent only |
| `components/layout/sidebar.tsx` | Wave 1 agent only |
| `messages/ko.json` | Wave 1 agent only |
| `messages/en.json` | Wave 1 agent only |
| `hooks/api/index.ts` | No change expected |
| `hooks/api/query-keys.ts` | No change expected |
| `types/api.ts` | No change expected (Tournament type already exists) |

### Dependency Graph

```
Wave 1 (sequential, single agent)
  W1-A -> W1-B -> W1-C -> W1-D -> W1-E
     |
     v
Wave 2 (parallel, after W1 completes)         Wave 2-parallel (no dependency on W1)
  W2-A (home)                                    W2-D (badges page cleanup)
  W2-B (team hub inline actions)
  W2-C1..C3 (cross-links)

Backend B-1..B-3 run in parallel with ALL waves (independent codebase)
```

---

## 6. File-level Change List

### New Files

| Path | Purpose |
|------|---------|
| `apps/web/src/components/layout/more-menu.tsx` | Slide-up sheet menu for mobile bottom nav "More" tab |

### Modified Files

| Path | What Changes |
|------|-------------|
| `apps/web/src/components/layout/bottom-nav.tsx` | Replace Profile tab (5th) with More tab; import MoreMenu; toggle state; move unread badge to More icon |
| `apps/web/src/components/layout/sidebar.tsx` | Add `{ href: '/tournaments', icon: Trophy, label: t('tournaments') }` to Explore section; add Activity section with Badges + Feed |
| `apps/web/src/app/(main)/home/home-client.tsx` | Import `useTournaments`; add tournaments section in Zone 3 between Teams and Lessons; add Tournaments chip to quick-access row |
| `apps/web/src/app/(main)/teams/[id]/page.tsx` | Add inline hub action buttons below tab strip, wrapped in `@3xl:hidden`, visible only when `canManageCatalog` is true |
| `apps/web/src/app/(main)/marketplace/[id]/page.tsx` | Add team back-link badge if `listing.teamId` exists (Link to `/teams/:teamId`) |
| `apps/web/src/app/(main)/lessons/[id]/page.tsx` | Add team back-link badge if `lesson.teamId` exists |
| `apps/web/src/app/(main)/tournaments/[id]/page.tsx` | Add team back-link badge if `tournament.teamId` exists |
| `apps/web/src/app/(main)/badges/page.tsx` | Replace hardcoded `allBadges` array with `useAllBadgeTypes()` API data as source of truth; keep static badge metadata (icons, colors) as a lookup map keyed by badge `type` |
| `apps/web/messages/ko.json` | Add keys under `nav`: `more`, `tournaments`, `badges` |
| `apps/web/messages/en.json` | Same keys in English |
| `e2e/tests/home.spec.ts` | Update `bottom-nav-profile` testId to `bottom-nav-more` (line ~110) |
| `apps/api/src/tournaments/tournaments.service.ts` | Ensure `findAll()` includes `{ team: { select: { id: true, name: true } } }` in Prisma query |
| `apps/api/src/marketplace/marketplace.service.ts` | Ensure `findById()` includes `team` relation if `teamId` exists |
| `apps/api/src/lessons/lessons.service.ts` | Ensure `findById()` includes `teamId` in response |

### Files NOT Modified (confirming no accidental scope)

- `app/(main)/feed/page.tsx` -- No changes; merge decision with `/notifications` deferred to separate task
- `prisma/schema.prisma` -- No schema changes
- `apps/api/src/*/dto/*.ts` -- No DTO changes
- E2E tests -- Update selectors only if bottom nav testIds change (covered in Wave 1)

---

## Test Scenarios

### Happy Path

- [ ] User taps "More" tab on mobile -> slide-up menu appears with all secondary features
- [ ] User taps "Tournaments" in More menu -> navigates to `/tournaments`
- [ ] User taps "Badges" in More menu -> navigates to `/badges`
- [ ] Home page shows Tournaments section when tournament data exists
- [ ] Home page "see all" on Tournaments section links to `/tournaments`
- [ ] Team detail on mobile shows inline hub action buttons below tabs for managers
- [ ] Marketplace listing detail shows team back-link when `teamId` exists
- [ ] Lesson detail shows team back-link when `teamId` exists
- [ ] Tournament detail shows team back-link when `teamId` exists
- [ ] Badges page renders data from `GET /badges` API instead of hardcoded array

### Edge Cases

- [ ] More menu closes on backdrop tap and ESC key
- [ ] More menu shows correct unread badge count (chat + notifications combined)
- [ ] Home page hides Tournaments section when no tournaments exist (same pattern as Teams)
- [ ] Team detail inline hub actions do NOT render for non-managers or non-members
- [ ] More menu has `role="dialog"`, `aria-modal="true"`, focus trap, and ESC handler
- [ ] Marketplace listing without `teamId` does NOT show team back-link
- [ ] Badges page shows empty state when API returns no badges
- [ ] More menu correctly shows/hides auth-required items (Chat, Notifications) for unauthenticated users

### Error Cases

- [ ] `useTournaments` fetch failure -> home page Tournaments section shows graceful fallback (hidden, not error)
- [ ] `useAllBadgeTypes` fetch failure -> badges page shows ErrorState with retry
- [ ] More menu does not break layout when rapidly toggled

### Mock Updates

- [ ] `apps/web/src/app/(main)/badges/page.tsx`: Remove hardcoded `allBadges` array; badge metadata (icon, color, bg) becomes a static lookup map keyed by `badge.type`, data comes from API
- [ ] Inline mocks in `apps/api/src/tournaments/tournaments.service.spec.ts`: Verify tournament mock includes `team` relation

---

## Tech Debt Resolved

| Item | Resolution |
|------|-----------|
| Badges page hardcoded mock data (`allBadges` array) | Replace with API data from `useAllBadgeTypes()`, static metadata as lookup map |
| Tournaments have zero home page presence despite full backend+frontend implementation | Add home section + quick-access chip |
| Team Hub mobile registration buried at page bottom | Add inline hub action buttons below tabs on mobile |
| Missing cross-links (marketplace/lesson/tournament -> parent team) | Add team back-link badges on detail pages |
| Profile as navigation bottleneck (chat, notifications, badges, feed all buried) | More menu surfaces all features within 2 taps |

**Deferred (with trigger)**:
| Item | Why Deferred | Follow-up Trigger |
|------|-------------|-------------------|
| Feed/Notifications merge | Requires product decision on whether Feed is a distinct concept | When user reports confusion between `/feed` and `/notifications` |

---

## Security Notes

### Threat Model

| Threat | Surface | Mitigation |
|--------|---------|------------|
| More menu exposing admin links to non-admin users | `more-menu.tsx` | Conditionally render admin link only when `user.role === 'admin'` (same pattern as sidebar) |
| Team Hub FAB exposing registration links to non-managers | `teams/[id]/page.tsx` | FAB renders only when `canManageCatalog` is true (existing authorization check) |
| Cross-link team back-link leaking team info | Detail pages | `teamId` and `team.name` are already public in API responses; no new data exposure |
| i18n injection | `messages/*.json` | Static translation keys only; no user-generated content in nav labels |

No new API endpoints. No new auth surfaces. No schema changes. Security impact is minimal.

---

## Acceptance Criteria

1. Every page under `app/(main)/` is reachable within 2 taps from bottom nav (via More menu) or home page
2. Home page has a Tournaments section when tournament data exists
3. Team Hub registration actions work on mobile (FAB for managers)
4. Cross-links from marketplace/lesson/tournament detail pages to parent team
5. Badges page uses API data, not hardcoded array
6. `tsc --noEmit` passes for `apps/web`
7. `pnpm lint` passes
8. All existing E2E tests pass (with updated selectors if bottom nav changed)
9. Backend tests pass

---

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bottom nav E2E selectors break | E2E test failures | Update `data-testid` from `bottom-nav-profile` to `bottom-nav-more` in E2E specs |
| More menu z-index conflicts with existing modals | Visual bugs | Use `z-50` (same as bottom nav) + backdrop; test with toast/modal overlay |
| Home page becomes too long with Tournaments section | Mobile scroll fatigue | Tournament section is conditional (hidden when empty) and compact (horizontal scroll) |
| Backend `GET /tournaments` may not include `team` relation | Frontend shows no team name | B-1 task explicitly adds `include: { team }` to Prisma query |

---

## Ambiguity Log

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Should Feed page merge with Notifications? | **DEFERRED** | Both pages use `useNotifications()`. Feed groups by period, Notifications is a flat list. Decision deferred -- not blocking this task. |
| 2 | Should More menu use a modal/dialog or a slide-up sheet? | **RESOLVED** | Slide-up sheet (bottom sheet pattern) -- native feel on mobile, consistent with Toss/Kakao patterns. Use existing `Modal` component with `position="bottom"` or a dedicated sheet. |
| 3 | Should Tournaments appear in bottom nav directly instead of More menu? | **RESOLVED** | No. Tournaments are a secondary feature (lower traffic than Matches/Teams/Marketplace). More menu is the right placement. |
