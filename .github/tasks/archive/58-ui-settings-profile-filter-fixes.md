# Task 58 — UI Fix: Settings Dark Mode, Profile Loading States, Filter URL Sync

## Context

Deferred items from Task 57 (A5, A6, A7) — all frontend-only fixes.

Task 57 resolved the primary Profile dark mode, Marketplace filter design, and Team card layout issues.
Three pre-existing gaps were identified during that work but scoped out:

- A5: Profile `UpcomingSchedule` had no loading skeleton or error boundary
- A6: Marketplace and Teams filter chips did not sync to URL query params
- A7: `settings-client.tsx` / `settings/page.tsx` had dark mode gaps (dead code, missing `dark:` variants)

All three items are now complete.

## Goal

1. Fix dark mode coverage in the Settings page (remove dead code, add missing `dark:` variants).
2. Add proper loading skeleton and error boundary to Profile `UpcomingSchedule` section.
3. Sync Marketplace and Teams filter chips with URL query params for back/forward navigation correctness.

## Original Conditions

- [x] A7: Settings `SettingsBackButton` dead function and `ArrowLeft` import removed ✅ FIXED
- [x] A7: Settings `SettingsSection` h3, icon wrappers, `SettingsLink` desc, `ChevronRight` get correct `dark:` variants ✅ FIXED
- [x] A7: Duplicate footer version text removed from `settings/page.tsx` (already present in "앱 정보" card) ✅ FIXED
- [x] A7: `transition-colors transition-transform` syntax fix applied ✅ FIXED
- [x] A5: `useMyMatches` `isLoading`/`error`/`refetch` destructured and used in `profile/page.tsx` ✅ FIXED
- [x] A5: Loading skeleton (3× `h-[72px]` shimmer) added inside UpcomingSchedule card wrapper ✅ FIXED
- [x] A5: `ErrorState` with retry added inside UpcomingSchedule card wrapper ✅ FIXED
- [x] A5: Profile tab buttons resized from `h-9 w-9` (36px) to `min-h-[44px] min-w-[44px]` (44px) ✅ FIXED
- [x] A5: Card header alignment corrected to `items-center` to match 44px buttons ✅ FIXED
- [x] A6: Marketplace filter state derived from `searchParams` (not `useState`), URL synced with `router.replace` + `{ scroll: false }` ✅ FIXED
- [x] A6: Marketplace URL param validation added before type cast ✅ FIXED
- [x] A6: Teams filter state derived from `searchParams`, URL synced with `router.replace` + `{ scroll: false }` ✅ FIXED
- [x] A6: Teams skeleton height corrected from `h-24` to `h-[120px]` to match expanded card height ✅ FIXED

## User Scenarios

### Scenario A — User views Settings page in dark mode
1. User has dark mode active and navigates to `/settings`
2. Section headings, link descriptions, icons, and chevrons all render with correct dark colors
3. No duplicate version text appears at the bottom of the page
4. No contrast violations (WCAG 2.1 AA 4.5:1 met)

### Scenario B — User views Profile with slow connection
1. User opens `/profile`
2. While `useMyMatches` is loading, the UpcomingSchedule section shows 3 shimmer skeleton rows
3. Once data loads, real match cards replace the skeletons without layout shift

### Scenario C — User views Profile when API returns error
1. `useMyMatches` request fails
2. UpcomingSchedule section shows `ErrorState` with a retry button
3. Tapping retry re-fetches and shows results on success

### Scenario D — User navigates back after applying marketplace filter
1. User opens `/marketplace` and selects the "축구" sport-type chip
2. URL updates to `?sport=soccer` (or equivalent param), `router.replace` is used
3. User navigates to a listing detail page
4. User taps browser/device back button
5. Marketplace page restores with "축구" chip still selected (derived from URL, not stale `useState`)

### Scenario E — User navigates back after applying teams filter
1. Same back/forward navigation pattern as Scenario D, applied to `/teams`
2. Skeleton height matches the expanded team card height (120px), preventing layout jump

## Test Scenarios

### Happy Path
- Settings page renders all sections correctly in dark mode with no contrast violations
- Profile UpcomingSchedule shows skeleton during load and content after success
- Marketplace filter chips restore from URL on back navigation
- Teams filter chips restore from URL on back navigation

### Edge Cases
- Settings page with reduced-motion preference — `transition-colors transition-transform` syntax is valid
- Profile UpcomingSchedule with zero matches — EmptyState shown (existing behavior, unchanged)
- Marketplace `searchParams` containing an invalid sport value — validation rejects and falls back to "전체"
- Teams `searchParams` containing an invalid sport value — same validation fallback

### Error Cases
- Profile `useMyMatches` error → ErrorState + retry renders correctly inside card wrapper
- ErrorState retry triggers refetch, not full page reload

### Mock Data Updates
- No type or schema changes — no inline mock updates required

## Parallel Work Breakdown

All items were implemented sequentially by a single frontend agent (no file overlap risk).

### Wave 1 — Settings dark mode (settings-client.tsx, settings/page.tsx)
- Remove dead `SettingsBackButton` and `ArrowLeft` import
- Add `dark:` variants to section h3, icon wrappers, desc paragraph, ChevronRight
- Remove duplicate footer version text from `settings/page.tsx`
- Fix `transition-colors transition-transform` syntax

### Wave 2 — Profile loading states (profile/page.tsx)
- Destructure `isLoading`, `error`, `refetch` from `useMyMatches`
- Add 3× shimmer skeleton inside UpcomingSchedule card wrapper
- Add `ErrorState` with `onRetry={refetch}` inside same wrapper
- Resize tab buttons to `min-h-[44px] min-w-[44px]`, align card header to `items-center`

### Wave 3 — Filter URL sync (marketplace/page.tsx, teams/team-list.tsx)
- Derive filter state from `searchParams` (remove `useState` for filter values)
- Add URL param validation before casting to domain type
- Use `router.replace(..., { scroll: false })` on filter change
- Fix skeleton height in `team-list.tsx` from `h-24` to `h-[120px]`

### Validation
- `npx tsc --noEmit` in `apps/web/` — zero errors
- `pnpm lint` in `apps/web/` — zero new warnings

## Acceptance Criteria

1. **Settings dark mode**: All `SettingsSection` headings, link descriptions, icons, and chevrons have correct `dark:` variants. Dead code (`SettingsBackButton`, `ArrowLeft`) removed. No duplicate version text. `transition-colors transition-transform` syntax valid.
2. **Profile loading state**: UpcomingSchedule shows shimmer skeleton during load and `ErrorState` with retry on error. Neither state causes layout shift.
3. **Touch targets**: Profile tab buttons are `min-h-[44px] min-w-[44px]`. Card header aligned to `items-center`.
4. **Marketplace URL sync**: Filter chips derive state from URL. Back/forward navigation restores filter selection. URL param validated before cast.
5. **Teams URL sync**: Same URL sync pattern as marketplace. Skeleton height is `h-[120px]`.
6. **Build passes**: `npx tsc --noEmit` and `pnpm lint` pass with zero new errors/warnings.
7. **WCAG 2.1 AA**: All changed elements meet 4.5:1 contrast in both light and dark mode.

## Files Changed

| File | Change Summary |
|------|---------------|
| `apps/web/src/app/(main)/settings/settings-client.tsx` | Remove dead `SettingsBackButton` + `ArrowLeft` import; add `dark:` variants to section h3, icon wrappers, desc paragraph, ChevronRight; fix `transition-colors transition-transform` syntax |
| `apps/web/src/app/(main)/settings/page.tsx` | Remove duplicate footer version text |
| `apps/web/src/app/(main)/profile/page.tsx` | Destructure `isLoading`/`error`/`refetch` from `useMyMatches`; add shimmer skeleton + `ErrorState` inside UpcomingSchedule card; resize tab buttons to `min-h-[44px]`; align card header to `items-center` |
| `apps/web/src/app/(main)/marketplace/page.tsx` | Derive filter state from `searchParams`; add URL param validation; use `router.replace` with `{ scroll: false }` |
| `apps/web/src/app/(main)/teams/team-list.tsx` | Same URL sync pattern; skeleton height corrected to `h-[120px]` |

## Tech Debt Resolved

- Dead `SettingsBackButton` function and unused `ArrowLeft` import in `settings-client.tsx`
- Missing `dark:` variants in Settings page (pre-existing gap from initial Settings implementation)
- Duplicate version text rendered twice in `settings/page.tsx`
- `transition-[colors,transform]` invalid CSS syntax in `settings-client.tsx`
- Profile `UpcomingSchedule` had no loading skeleton — shimmer now prevents blank flash
- Profile `UpcomingSchedule` had no error boundary — `ErrorState` + retry now handles API failure
- Profile tab buttons were 36px (below 44px touch target minimum)
- Marketplace and Teams filter chips used local `useState` — URL sync now enables correct back/forward navigation
- Teams skeleton height was `h-24` (96px) vs expanded card natural height ~120px — prevented layout jump

## Security Notes

- No new endpoints, no auth changes, no user data handling
- `searchParams`-derived filter values are validated (allowlist check) before use as type discriminants — prevents unexpected filter states from crafted URLs

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| URL param validation allowlist needs updating if new sport types are added | `SPORT_TYPES` from `lib/constants.ts` is the single source of truth; validation uses this array |
| Skeleton count (3 rows) may not match actual result count | Cosmetic minor — skeleton count is a loading placeholder, not a prediction |
| Profile UpcomingSchedule tab navigation (past/upcoming) URL sync not addressed | Out of scope — separate concern from filter URL sync |

## Ambiguity Log

| ID | Question | Resolution | Date |
|----|----------|------------|------|
| B1 | Profile UpcomingSchedule skeleton count — should it match the real count? | No — 3 rows is a reasonable placeholder. Matching the real count would require knowing the count before fetching, which is not possible. Cosmetic minor, deferred. | 2026-04-15 |
| B2 | Profile UpcomingSchedule tab (past/upcoming) state — should it also sync to URL? | Out of scope for this task. Tab navigation URL sync is a separate concern from filter URL sync. | 2026-04-15 |
