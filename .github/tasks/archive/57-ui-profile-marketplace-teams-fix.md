# Task 57 — UI Fix: Profile Dark Mode, Marketplace Filters & Images, Team Card Layout

## Context

Three UI issues identified from visual review across the Profile, Marketplace, and Teams pages.
All are frontend-only changes (no backend API or schema changes required).

## Goal

1. Fix dark mode issues on the Profile page and ensure theme settings are reachable without authentication.
2. Redesign Marketplace filter bar (remove confusing dual "all" buttons) and change listing images from square to rectangular (card-height).
3. Expand Team cards from compact `h-24` to richer layout showing more team information.

## Original Conditions

- [x] Issue 1a: Dark mode profile card is broken (missing dark: variants) ✅ FIXED (12 dark: variants added, transition-colors fix)
- [x] Issue 1b: Non-authenticated users cannot access theme settings (profile page requires auth, more-menu has no settings link) ✅ FIXED (서비스 > 설정 added to more-menu)
- [x] Issue 2a: Marketplace listing card images are square 100x100 — change to rectangular, card-height ✅ FIXED (120px wide, min-h-[120px], stretch height)
- [x] Issue 2b: Two filter rows both starting with "전체" is confusing — collapse to single sport-type filter row ✅ FIXED (split into 2 separate rows with aria-labels)
- [x] Issue 2c: Equipment category filters are sport-type proxies, not real categories — remove ✅ FIXED (replaced with sport-type filter chips)
- [x] Issue 3a: Team cards are too compact at fixed h-24 — expand ✅ FIXED (removed fixed height)
- [x] Issue 3b: Team cards need more visible content (description, location, member count) ✅ FIXED (120px image, line-clamp-2, min-h-[120px])

## User Scenarios

### Scenario A — Non-authenticated user wants dark mode
1. User opens app without logging in
2. Taps "더보기" (More) in bottom nav
3. Sees "설정" link in the more-menu sheet
4. Navigates to `/settings` and toggles theme to "다크"
5. Theme applies immediately across all pages

### Scenario B — Authenticated user views profile in dark mode
1. User is logged in with dark mode active
2. Opens `/profile`
3. Profile card, sport profiles, stats grid, and all menu items render with correct dark mode colors
4. No contrast violations (all text meets WCAG 2.1 AA 4.5:1)

### Scenario C — User browses marketplace listings
1. User opens `/marketplace`
2. Sees single row of filter chips: 전체 / 판매 / 대여 / 공동구매 (listing type) followed by sport-type chips
3. No duplicate "전체" confusion
4. Listing cards show rectangular images that fill the card height
5. Product info (title, description, price, sport badge) remains fully visible

### Scenario D — User browses team list
1. User opens `/teams`
2. Team cards are visually richer — larger cover image area, 2-line description, location info visible
3. Cards are not cramped; sport badges, member count, level, recruiting status all visible

## Test Scenarios

### Happy Path
- Profile page renders correctly in dark mode for authenticated user
- More-menu shows "설정" link for non-authenticated user
- Settings page loads and theme picker works without authentication
- Marketplace has one consolidated filter row, no duplicate "전체"
- Marketplace listing images are rectangular, stretching to card height
- Team cards display description (line-clamp-2), location, and are taller than 96px

### Edge Cases
- User with no sport profiles — profile card still renders correctly in dark mode
- User with no bio — bio line absent, card layout still correct
- Marketplace listing with very long title — truncation works with new image layout
- Team with no description or location — card still renders cleanly at expanded size
- Team with 3+ sport types — overflow badge (+N) still visible in expanded card

### Error Cases
- Non-authenticated user navigating directly to `/settings` — should work (settings page has no auth guard)
- Theme store localStorage unavailable — falls back to 'light' (existing behavior, no change)

### Mock Data Updates
- No mock data changes required (no type/schema changes)

## File Map

### Issue 1 — Profile dark mode + theme reachability

| File | Change |
|------|--------|
| `apps/web/src/app/(main)/profile/page.tsx` | Audit all classes for missing `dark:` variants; fix `text-gray-500` on bio line, `text-gray-200` separator, any other missing dark variants |
| `apps/web/src/components/layout/more-menu.tsx` | Add "설정" link (Settings icon + "설정" label) to the menu, accessible without authentication |

### Issue 2 — Marketplace filters + image layout

| File | Change |
|------|--------|
| `apps/web/src/app/(main)/marketplace/page.tsx` | Remove `categoryFilterKeys` array and its chip row entirely; replace listing-type filter row with a combined row: listing-type chips + sport-type chips (using `sportLabel` from constants, matching teams page pattern) |
| `apps/web/src/components/marketplace/marketplace-listing-card.tsx` | Remove explicit `h-[100px]` from image container (flex row default `align-items: stretch` handles height); change `w-[100px]` to `w-[120px]`; update `sizes` prop to `120px` |

### Issue 3 — Team card expansion

| File | Change |
|------|--------|
| `apps/web/src/components/teams/team-card.tsx` | Remove fixed `h-24` from Card className; increase image area from `w-24` to `w-[120px]`; change description from `line-clamp-1` to `line-clamp-2`; ensure location always renders when available; add subtle spacing improvements |

## Parallel Work Breakdown

### Wave 1 — Parallel (3 agents, zero file overlap)

**Agent A (frontend-ui-dev-1): Issue 1 — Profile + More-Menu**
- Files OWNED: `profile/page.tsx`, `more-menu.tsx`
- Do NOT touch: `settings/page.tsx`, `settings-client.tsx`, `bottom-nav.tsx`, `theme-store.ts`, `card.tsx`
- Tasks:
  1. Audit `profile/page.tsx` for all missing `dark:` variants
  2. Fix concrete issues: `text-gray-500` on bio (add `dark:text-gray-400`), `text-gray-200` separator (add `dark:text-gray-600`), any other missing pairs
  3. Test profile card, sport profile rows, stats grid, menu groups, logout button in dark mode
  4. In `more-menu.tsx`, add a "설정" link (`Settings` icon, label "설정", href `/settings`) — place it in a new "설정" MenuGroup at the bottom, visible regardless of auth state

**Agent B (frontend-ui-dev-2): Issue 2 — Marketplace**
- Files OWNED: `marketplace/page.tsx`, `marketplace-listing-card.tsx`
- Do NOT touch: `card.tsx`, `constants.ts`, `sport-image.ts`
- Tasks:
  1. In `marketplace/page.tsx`: Remove `categoryFilterKeys` array and its rendering block entirely
  2. Add sport-type filter chips (reuse `sportLabel` from `@/lib/constants`) as a second section within the existing filter row, or as a merged single scrollable row with a visual separator
  3. Manage sport-type filter state (`activeSport`) and apply to listings (filter by `item.sportType`)
  4. In `marketplace-listing-card.tsx`: Remove explicit `h-[100px]` from image container (flex row default `align-items: stretch` handles vertical fill); change `w-[100px]` to `w-[120px]`; update `sizes` prop to `120px`

**Agent C (frontend-ui-dev-3): Issue 3 — Team Card**
- Files OWNED: `team-card.tsx`
- Do NOT touch: `team-list.tsx`, `card.tsx`, `constants.ts`, `sport-image.ts`
- Tasks:
  1. Remove `h-24` fixed height from the Card className
  2. Increase image area width from `w-24` to `w-[120px]`; update `sizes` prop to `120px`
  3. Change description `line-clamp-1` to `line-clamp-2`
  4. Ensure location line (`city`/`district`) always renders when data exists
  5. Verify sport badges, member count, level, recruiting badge still visible

### Wave 2 — Sequential (after Wave 1 merge)

1. Run `npx tsc --noEmit` in `apps/web/` — zero errors
2. Run `pnpm lint` in `apps/web/` — zero new warnings
3. Visual review: dark mode profile, marketplace filters, team cards
4. WCAG contrast check on all changed elements (both light and dark mode)

## Acceptance Criteria

1. **Profile dark mode**: All text, borders, backgrounds, dividers in `/profile` have correct `dark:` variants. No visual corruption in dark mode. WCAG 4.5:1 contrast met.
2. **Theme reachability**: Non-authenticated users can reach `/settings` via More menu and toggle theme. Theme applies immediately.
3. **Marketplace single filter row**: Only one filter bar with listing-type chips and sport-type chips. No duplicate "전체". Equipment category row removed entirely.
4. **Marketplace rectangular images**: Listing card images are rectangular (`w-[120px]`, height stretches to card height). No square thumbnails.
5. **Team card expansion**: Cards are no longer fixed at `h-24`. Image area is `w-[120px]`. Description shows up to 2 lines. Location visible when data exists.
6. **Build passes**: `npx tsc --noEmit` and `pnpm lint` pass with zero new errors/warnings.
7. **Touch targets**: All interactive elements maintain `min-h-[44px]`.
8. **Dark mode consistency**: All changes respect `bg-white` -> `dark:bg-gray-800` pattern per CLAUDE.md.

## Tech Debt Resolved

- Profile page dark mode gaps (pre-existing missing `dark:` variants)
- Marketplace filter design debt (sport-type proxied as equipment categories)
- Team card visual undersizing (fixed height preventing content display)
- `group_buy` listing type was rendering as "판매" in card badge — fixed ternary in `marketplace-listing-card.tsx`
- Skeleton loader height was 100px vs 120px card min-height — fixed to 120px to prevent layout jump
- `transition-[colors,transform]` invalid CSS syntax replaced with `transition-colors transition-transform` (3 instances in `profile/page.tsx`)
- Added `role="group"` + `aria-label` (i18n) to both marketplace filter rows for screen reader accessibility

## Security Notes

- No new endpoints, no auth changes, no user data handling changes
- Settings page already has no auth guard — this is intentional (theme/language are non-sensitive)
- More-menu settings link does not expose sensitive data

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Profile dark mode issues beyond missing `dark:` variants | Builder should test entire page in dark mode, not just known issues. Flag any structural CSS problems in PR description |
| Marketplace filter removal may confuse users who relied on equipment categories | Equipment categories were sport-type proxies with no real value. Sport-type filter is more useful and matches teams page UX |
| Team card height increase may affect scroll performance with many teams | Cards are still lightweight (no animation). Performance impact negligible |
| Image aspect ratio change may look odd with certain sport photos | `object-cover` already handles this — images crop from center |

## Ambiguity Log

| ID | Question | Resolution | Date |
|----|----------|------------|------|
| A1 | "Dark mode profile card broken" — exact corruption pattern unclear from text description | Builder should test entire profile page in dark mode and fix ALL contrast/background violations found, not just the ones identified in code review | 2026-04-15 |
| A2 | User mentioned "location filter" as possible replacement for equipment filter | Deferred — requires backend `GET /marketplace/listings` to support `locationCity`/`locationDistrict` query params, which it currently does not. Out of scope for this task | 2026-04-15 |
| A3 | Marketplace filter row layout — single row or two rows? | Implemented as 2 separate rows (listing-type row + sport-type row), each with `role="group"` and `aria-label`. Cleaner than a single scrollable row in practice | 2026-04-15 |
| A4 | Team card target height | No fixed height — remove `h-24` and let content determine height. Expected natural height ~140-160px with 2-line description | 2026-04-15 |
| A5 | Profile `UpcomingSchedule` loading/error state — missing skeleton/error boundary | Resolved in Task 58. Added 3× shimmer skeleton during load and `ErrorState` with retry on error. Tab buttons resized to `min-h-[44px]`, card header aligned to `items-center`. | 2026-04-15 |
| A6 | Filter chip state — URL sync | Resolved in Task 58. Marketplace and Teams filter chips now derive state from `searchParams` with URL param validation. `router.replace({ scroll: false })` used on filter change. Teams skeleton height corrected to `h-[120px]`. | 2026-04-15 |
| A7 | `settings-client.tsx` / `settings/page.tsx` dark mode gaps | Resolved in Task 58. Dead `SettingsBackButton` function and `ArrowLeft` import removed. Missing `dark:` variants added to section h3, icon wrappers, desc paragraph, and ChevronRight. Duplicate footer version text removed. `transition-colors transition-transform` syntax fix applied. | 2026-04-15 |
