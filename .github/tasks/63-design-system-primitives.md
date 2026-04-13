# Task 63: Design System Primitives — Micro-Component Foundation

> Created: 2026-04-13
> Priority: Critical
> Status: Planning
> Supersedes: Task 62 (patch-based approach) -> this task addresses root cause

## Context

Task 62 attempted page-by-page patching with 20+ parallel agents but failed to resolve
the fundamental problem: **missing shared micro-primitives** force every page and card
to hand-build its own badge, filter chip, meta row, and status map inline.

Evidence from codebase audit (2026-04-13):
- **48 inline badge instances** across 25 files using raw `rounded-full px-2 py-0.5 text-xs font-medium`
- **19 files** with duplicated filter chip bars (`overflow-x-auto scrollbar-hide` + varying active styles)
- **6 card components** each define their own icon+text meta rows with different icon sizes (10-12px), spacing, opacity
- **3 card components** define inline `statusMap`/`statusStyle` objects (team-match-card, mercenary-card, lesson-card)
- **559 occurrences** of `px-4`/`px-5`/`px-6` across 98 page files — DESIGN.md mandates `px-5`
- **home-client.tsx** (699 lines) renders inline mini-card layouts instead of importing actual card components

The existing `Card`, `Button`, `SectionHeader` primitives are well-built. The gap is one
layer below: badge, filter chip, meta row, status badge — the composable atoms that go
*inside* cards and page layouts.

## Goal

Create the missing micro-primitives, then systematically replace all inline patterns with
them. Every page and card must express its visual style through shared components, not
raw Tailwind strings.

## ADR: Badge Size Token

**Context**: DESIGN.md Section 12 specifies `text-2xs` for sport/status badges. Current
inline code overwhelmingly uses `text-xs`. These differ by 1px (10px vs 11px).

**Decision**: Follow DESIGN.md (`text-2xs`) as canonical. All 48 badge instances will be
migrated to `text-2xs`. DESIGN.md is the source of truth per CLAUDE.md rule order.

**Consequences**: Badge text will be 1px smaller. Visual density improves. Must verify
readability on small screens during QA.

## ADR: Card Title Font Size

**Context**: DESIGN.md Section 10 says banner card title = `text-sm font-semibold` (13px).
Current code uses `text-md font-semibold` (15px) in match-card/lesson-card and
`text-base font-bold` (14px) in team-card.

**Decision**: Use `text-sm font-semibold` per DESIGN.md for banner/horizontal/thumbnail
card titles. Page-level titles remain `text-2xl font-bold` per Section 2.1.

**Consequences**: Card titles shrink by 1-2px. Info hierarchy between page title and card
title becomes more distinct. Builder must not deviate.

---

## Phase 1: Create Micro-Primitives (Sequential, Single Agent)

All primitives go in `apps/web/src/components/ui/`. These are shared files — one agent only.

### 1A. `StatusBadge` (`status-badge.tsx`)

Replaces all inline `rounded-full px-2 py-0.5 text-2xs font-medium` + color patterns.

```
interface StatusBadgeProps {
  label: string;
  variant: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md';           // sm = text-2xs, md = text-xs
  icon?: React.ElementType;     // optional leading icon
  className?: string;
}
```

Variant color map (from DESIGN.md Section 12):
- `info`: `bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300`
- `success`: `bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300`
- `warning`: `bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300`
- `error`: `bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300`
- `neutral`: `bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`

### 1B. `SportBadge` (`sport-badge.tsx`)

Wraps `sportCardAccent[type].badge` into a component. Eliminates 25+ inline patterns.

```
interface SportBadgeProps {
  sportType: string;
  size?: 'sm' | 'md';           // sm = text-2xs, md = text-xs
  showDot?: boolean;            // prepend colored dot (h-2 w-2)
  className?: string;
}
```

Uses `sportLabel` for text, `sportCardAccent[type].badge` for colors,
`sportCardAccent[type].dot` for dot color. Single source of truth.

### 1C. `FilterChipBar` (`filter-chip-bar.tsx`)

Replaces 19 duplicated filter chip scrollers.

```
interface FilterChipBarProps<T extends string> {
  items: { key: T; label: string }[];
  activeKey: T;
  onSelect: (key: T) => void;
  className?: string;
}
```

Layout: `flex gap-2 overflow-x-auto scrollbar-hide pb-1`
Active chip: `bg-blue-500 text-white` (DESIGN.md Section 9)
Inactive chip: `bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`
All chips: `rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px] whitespace-nowrap transition-colors`

### 1D. `MetaRow` (`meta-row.tsx`)

Replaces icon+text meta patterns in all cards.

```
interface MetaRowProps {
  items: MetaItem[];
  className?: string;
}

interface MetaItem {
  icon?: React.ElementType;
  text: string | undefined | null;  // falsy values are silently skipped
  truncate?: boolean;               // default false
}
```

Renders: `flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400`
Icon: `size={11} className="shrink-0 opacity-40"` (standardized)
Separator between items: `<span className="shrink-0 opacity-30" aria-hidden="true">·</span>`

**Important**: Items where `text` is undefined, null, or empty string are silently skipped.
Separators are only rendered between visible items (no orphaned dots).

### 1E. `OverlayBadge` (`overlay-badge.tsx`)

Replaces image overlay badges (price, participant count, time) on banner cards.

```
interface OverlayBadgeProps {
  children: React.ReactNode;
  variant?: 'dark' | 'accent';  // dark = bg-gray-900/70, accent = bg-blue-600/80
  className?: string;
}
```

Base: `rounded-md px-1.5 py-0.5 text-2xs font-medium leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]`

### Phase 1 Files Changed
- NEW: `apps/web/src/components/ui/status-badge.tsx`
- NEW: `apps/web/src/components/ui/sport-badge.tsx`
- NEW: `apps/web/src/components/ui/filter-chip-bar.tsx`
- NEW: `apps/web/src/components/ui/meta-row.tsx`
- NEW: `apps/web/src/components/ui/overlay-badge.tsx`

### Phase 1 Acceptance
- [ ] All 5 primitives compile (`tsc --noEmit`)
- [ ] Each primitive has a unit test (`*.test.tsx`) verifying render + variants
- [ ] StatusBadge covers all 5 variants + 2 sizes
- [ ] SportBadge renders correctly for all 11 sport types
- [ ] FilterChipBar handles active/inactive toggle + keyboard navigation

---

## Phase 2: Replace Card Internals (Parallel, 6 Agents)

Each card component is an independent file. No shared file conflicts.

### 2A. `match-card.tsx` (Banner Card)
- Replace 4 overlay badge spans -> `OverlayBadge`
- Replace sport dot + label -> `SportBadge showDot`
- Replace 2 meta rows (time+venue, location+level) -> `MetaRow`
- Replace recommendation badges -> `StatusBadge variant="info" size="sm"`
- Title: `text-sm font-semibold` (per DESIGN.md, currently `text-md`)

### 2B. `lesson-card.tsx` (Banner Card)
- Replace 4 overlay badge spans -> `OverlayBadge`
- Replace sport dot + label -> `SportBadge showDot`
- Replace lesson type badge -> `StatusBadge variant="neutral"`
- Replace meta row (time+venue+level) -> `MetaRow`
- Replace team/venue tags -> `StatusBadge variant="neutral" size="sm"`
- Title: `text-sm font-semibold` (per DESIGN.md)

### 2C. `team-card.tsx` (Horizontal Card)
- Replace inline sport badge -> `SportBadge`
- Replace recruiting badge -> `StatusBadge variant="info"`
- Replace member count text -> `MetaRow`
- Title: `text-sm font-semibold` (per DESIGN.md, currently `text-base font-bold`)

### 2D. `team-match-card.tsx` (Metric/List Card)
- Extract inline `statusMap` -> use `StatusBadge` with variant mapping
- Replace inline sport badge -> `SportBadge`
- Replace meta text rows -> `MetaRow`
- Title: `text-sm font-semibold` (currently `text-md`)

### 2E. `marketplace-listing-card.tsx` (Thumbnail Card)
- Replace inline sport badge -> `SportBadge`
- Replace listing type badge -> `StatusBadge variant="neutral"`
- Replace team/venue tags -> `StatusBadge variant="neutral" size="sm"`
- Title: `text-sm font-semibold` (currently `text-md`, DESIGN.md says `text-md` for thumbnail only)

### 2F. `mercenary-card.tsx` (List Card)
- Extract inline `statusStyle`/`statusLabel` -> `StatusBadge` with variant mapping
- Replace inline sport badge -> `SportBadge`
- Replace position/level/fee text -> `MetaRow`
- Title: `text-sm font-semibold` (currently `text-md`)

### 2G. `venue-card.tsx` (Horizontal Card)
- Replace meta text rows (sport list, address, price) -> `MetaRow`
- Title: `text-sm font-semibold` (currently `text-md`)

### Phase 2 Files Changed
- MODIFY: `apps/web/src/components/match/match-card.tsx`
- MODIFY: `apps/web/src/components/lesson/lesson-card.tsx`
- MODIFY: `apps/web/src/components/teams/team-card.tsx`
- MODIFY: `apps/web/src/components/match/team-match-card.tsx`
- MODIFY: `apps/web/src/components/marketplace/marketplace-listing-card.tsx`
- MODIFY: `apps/web/src/components/mercenary/mercenary-card.tsx`
- MODIFY: `apps/web/src/components/venue/venue-card.tsx`

### Status Mapping Clarification

The `StatusBadge` component owns the *visual rendering* (colors, padding, sizes).
Domain-to-variant mapping (e.g., `{ recruiting: 'neutral', matched: 'info', cancelled: 'error' }`)
stays in the card component as a simple `Record<string, StatusBadgeVariant>`. This is domain
logic, not visual logic. Similarly, `FilterChipBar` owns the *chip rendering*, but the
page still owns the filtering logic (e.g., marketplace's `categoryFilterKeys` with `match()` functions).

### Phase 2 Acceptance
- [ ] All 7 card components use Phase 1 primitives (no raw badge/meta strings remain)
- [ ] `tsc --noEmit` passes
- [ ] Existing card tests still pass (update inline mocks if needed)
- [ ] Inline status objects reduced to simple `Record<string, StatusBadgeVariant>` (no color strings)
- [ ] Card titles follow DESIGN.md font size spec

---

## Phase 3: Page Layout Standardization (Parallel by Route Group)

Audit each page against DESIGN.md Section 9 recipe. Fix deviations.

### Standard Pattern (DESIGN.md Section 9 + 2.1)

**All pages:**
- Page padding: `px-5 @3xl:px-0` (mobile 20px, desktop 0 with container)
- Section spacing: `mt-10` between major sections
- Card list gap: `gap-3`
- Bottom spacer: `h-24` (bottom nav clearance)
- Filter chip bars: replace inline -> `FilterChipBar`

### 3A. List Pages Wave (5 pages, parallel)
Files:
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/team-matches/page.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/mercenary/page.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`

Changes per page:
- Replace inline filter chip bar -> `FilterChipBar`
- Verify `px-5 @3xl:px-0` padding
- Verify `gap-3` card list spacing
- Verify `h-24` bottom spacer
- Replace any inline badge patterns -> `StatusBadge`/`SportBadge`

### 3B. Detail Pages Wave (7 pages, parallel)
Files:
- `apps/web/src/app/(main)/matches/[id]/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`

Changes per page:
- Replace inline badges -> `StatusBadge`/`SportBadge`
- Replace inline meta rows -> `MetaRow`
- Verify info hierarchy: page title `text-2xl` > section `text-base` > card `text-sm`
- Verify `px-5` padding consistency

### 3C. My Pages Wave (8 pages, parallel)
Files:
- `apps/web/src/app/(main)/my/matches/page.tsx`
- `apps/web/src/app/(main)/my/team-matches/page.tsx`
- `apps/web/src/app/(main)/my/team-match-applications/page.tsx`
- `apps/web/src/app/(main)/my/mercenary/page.tsx`
- `apps/web/src/app/(main)/my/teams/page.tsx`
- `apps/web/src/app/(main)/my/listings/page.tsx`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`

Changes: same pattern as 3A/3B — inline badges/meta rows -> primitives

### 3D. Home Page (Sequential, Single Agent, LAST)
File: `apps/web/src/app/(main)/home/home-client.tsx` (699 lines)

This is the highest-risk, highest-value file. It contains **4 inline card renderers** that
bypass shared card components entirely:

1. **Upcoming schedule cards** (lines 217-280) -- compact date+title list items (unique to home, keep inline but use `SportBadge`/`MetaRow`)
2. **`MatchCard` (lines 616-672)** -- 100px thumbnail horizontal card, different from the banner `match-card.tsx`. **Cannot simply import `components/match/match-card.tsx`** because the home variant is a horizontal compact card while the shared one is a vertical banner card. Resolution: add a `variant="compact"` prop to the shared `match-card.tsx`, or create `match-card-compact.tsx`.
3. **`RecommendedMatchCard` (lines 674-699+)** -- 260px wide carousel card with top image. Similar to shared MatchCard but narrower + carousel-ready. Resolution: add `variant="carousel"` prop or keep as home-local.
4. **Inline team cards** (lines 446-497) -- 200px wide cards with logo+name+badge. Very different layout from `team-card.tsx` (which is horizontal full-width). Resolution: add `variant="compact"` to `team-card.tsx`.
5. **Inline lesson cards** (lines 506-549) -- 200px wide text-only cards. Different from `lesson-card.tsx` (which has 16:9 image banner). Resolution: new `variant="compact"` on `lesson-card.tsx`.
6. **Inline listing cards** (lines 559-603) -- grid cards with square image. Different from `marketplace-listing-card.tsx` (which is horizontal thumbnail). Resolution: new `variant="grid"` on `marketplace-listing-card.tsx`.

**Strategy**: Do NOT force all inline cards to import existing card components as-is.
Instead, the approach is:
- Replace inline badges/meta -> Phase 1 primitives (StatusBadge, SportBadge, MetaRow, OverlayBadge)
- Replace inline filter chips -> `FilterChipBar`
- Keep home-specific layouts but built FROM shared primitives
- Consider adding `variant` props to shared cards in a follow-up task if home layouts stabilize

**Must run AFTER Phase 2 cards are stable.**

### 3D Acceptance
- [ ] Zero raw `rounded-full px-2 py-0.5` patterns remain
- [ ] All sport badges use `SportBadge`
- [ ] Filter chip bar uses `FilterChipBar`
- [ ] home-client.tsx compiles without errors

### 3E. Utility Pages Wave (parallel)
Files:
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/notifications/page.tsx`
- `apps/web/src/app/(main)/badges/page.tsx`
- `apps/web/src/app/(main)/settings/notifications/page.tsx`
- `apps/web/src/app/(main)/chat/page.tsx`
- `apps/web/src/app/(main)/reviews/page.tsx`
- `apps/web/src/app/(main)/payments/page.tsx`

Changes: verify compact tool layout (no hero blocks), inline badge/status -> primitives

### 3F. Form Pages Wave (parallel)
Files:
- `apps/web/src/app/(main)/matches/new/page.tsx`
- `apps/web/src/app/(main)/team-matches/new/page.tsx`
- `apps/web/src/app/(main)/mercenary/new/page.tsx`
- `apps/web/src/app/(main)/marketplace/new/page.tsx`
- `apps/web/src/app/(main)/lessons/new/page.tsx`
- `apps/web/src/app/(main)/teams/new/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/edit/page.tsx`
- Edit page variants

Changes: filter chips -> `FilterChipBar`, inline badges -> primitives, verify `px-5` padding

### Phase 3 Acceptance
- [ ] All list pages follow DESIGN.md Section 9 recipe (7 steps)
- [ ] All detail pages follow recipe (5 steps)
- [ ] Zero inline `rounded-full px-2 py-0.5 text-xs font-medium` patterns remain in page files
- [ ] `home-client.tsx` imports actual card components (no inline card renderers)
- [ ] `tsc --noEmit` passes
- [ ] All existing page tests pass

---

## Phase 4: Admin Pages (Parallel, Lower Priority)

Admin pages have their own visual rhythm but should still use primitives.

Files (16 pages):
- `apps/web/src/app/admin/dashboard/page.tsx`
- `apps/web/src/app/admin/matches/[id]/page.tsx`
- `apps/web/src/app/admin/team-matches/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/admin/teams/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/admin/users/[id]/page.tsx`
- `apps/web/src/app/admin/lessons/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/admin/mercenary/page.tsx`
- `apps/web/src/app/admin/payments/page.tsx`
- `apps/web/src/app/admin/settlements/page.tsx`
- `apps/web/src/app/admin/disputes/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/admin/reviews/page.tsx`
- `apps/web/src/app/admin/statistics/page.tsx`

Changes: replace inline badges -> `StatusBadge`/`SportBadge`, standardize table styling

---

## Parallel Work Breakdown

```
Phase 1 (Sequential) ─── Single Agent ─── ~2h
  └─ 5 micro-primitives + tests

Phase 2 (Parallel) ─── 7 Agents ─── ~1.5h each
  └─ 7 card components (independent files, no conflict)
  └─ DEPENDS ON: Phase 1 complete

Phase 3A-3C,3E,3F (Parallel) ─── up to 8 Agents ─── ~1h each
  └─ List pages (5) | Detail pages (7) | My pages (8) | Utility (7) | Form (8+)
  └─ DEPENDS ON: Phase 2 complete

Phase 3D (Sequential) ─── Single Agent ─── ~2h
  └─ home-client.tsx refactor
  └─ DEPENDS ON: Phase 2 complete + Phase 3A stable

Phase 4 (Parallel) ─── 4 Agents ─── ~1h each
  └─ Admin pages (16)
  └─ DEPENDS ON: Phase 1 complete (can run parallel with Phase 3)
```

Total estimated: ~6-8 hours wall clock with parallelism

---

## Test Scenarios

### Happy Path
- All 5 primitives render correctly with default props
- StatusBadge renders all 5 variants x 2 sizes = 10 combinations
- SportBadge renders all 11 sport types with correct colors from `sportCardAccent`
- FilterChipBar toggles active state correctly
- MetaRow renders 1-4 items with separators
- Cards render identically to before (visual regression)

### Edge Cases
- SportBadge with unknown sport type -> gray fallback
- StatusBadge with very long label text -> truncation
- FilterChipBar with 1 item -> no scroll
- FilterChipBar with 20+ items -> horizontal scroll works
- MetaRow with all items truncated -> ellipsis doesn't break layout
- OverlayBadge on very small image -> stays within bounds

### Error Paths
- Missing sport type in `sportCardAccent` -> graceful fallback
- Undefined/null passed to MetaRow items -> skip gracefully

### Mock Updates
- Card component tests (`match-card.tsx` etc.) may need import updates for new primitives
- No fixture changes needed (primitives are UI-only, no API data changes)

---

## Tech Debt Resolved

| Item | Resolution | Commit |
|------|-----------|--------|
| 48 inline badge patterns | Replaced by `StatusBadge` + `SportBadge` | Phase 2 |
| 19 duplicated filter chip bars | Replaced by `FilterChipBar` | Phase 3 |
| Inline `statusMap`/`statusStyle` objects in 3 cards | Moved to `StatusBadge` variant system | Phase 2 |
| `text-xs` vs `text-2xs` badge size inconsistency | Standardized to `text-2xs` per DESIGN.md | Phase 2 |
| Card title size inconsistency (`text-md`/`text-base`) | Standardized per DESIGN.md Section 10 | Phase 2 |
| home-client.tsx inline card renderers (699 lines) | Import actual card components | Phase 3D |
| `px-4`/`px-6` page padding drift | Standardized to `px-5` per DESIGN.md | Phase 3 |

**Deferred:** None. All items above are in scope.

---

## Security Notes

This task is UI-only. No API changes, no auth changes, no data model changes.

- **XSS**: All badge labels come from constants or API data rendered as text nodes (not `dangerouslySetInnerHTML`). No new risk.
- **Accessibility**: All primitives must include `aria-hidden="true"` on decorative icons. StatusBadge uses semantic color + text (never color-only). FilterChipBar needs `role="radiogroup"` + `role="radio"` + `aria-checked`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|-----------|
| Visual regression from font size changes | QA screenshot comparison before/after |
| home-client.tsx refactor may break home page | Run last, after all cards are stable |
| Parallel agents touching shared imports | Phase 1 is sequential; Phase 2+ only touches leaf files |
| DESIGN.md spec may conflict with user expectations | ADRs above document decisions explicitly |

---

## Ambiguity Log

| Date | Question | Resolution |
|------|----------|-----------|
| 2026-04-13 | `text-xs` vs `text-2xs` for badges? | DESIGN.md says `text-2xs`. Follow DESIGN.md. See ADR above. |
| 2026-04-13 | Card title size — `text-sm` vs `text-md`? | DESIGN.md Section 10 says `text-sm font-semibold`. Follow DESIGN.md. See ADR above. |
| 2026-04-13 | Marketplace card title exception? | DESIGN.md Section 10 says `text-md` for thumbnail card. Keep `text-md` for marketplace only. |
