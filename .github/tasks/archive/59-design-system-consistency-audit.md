# Task 59 -- Design System Consistency Audit & Remediation

> Execution task. Applies the 7 design system checkpoints from the request to every page in `apps/web/src/app/(main)/`.

Owner: frontend-ui-dev + frontend-review
Date drafted: 2026-04-12
Status: Planned
Priority: P1

## Context

The user requested a full design system audit across ~60 pages. After empirical analysis of the codebase (2026-04-12), most anti-patterns are already resolved -- likely by Task 55 (Design System Remediation Waves, completed 2026-04-12). The remaining scope is significantly smaller than estimated.

### Audit Results Summary

| Checkpoint | Expected violations | Actual violations | Status |
|---|---|---|---|
| 1. glass-mobile-nav opacity | 1 file | 1 file (`globals.css` L339-359) | NEEDS FIX |
| 2. `border-l-4` anti-pattern | many | 0 | ALREADY CLEAN |
| 3. Inline empty state vs EmptyState | many | 0 (48 files already use EmptyState) | ALREADY CLEAN |
| 4. Hardcoded hex colors `bg-[#]`/`text-[#]` | many | 4 instances, 2 files -- all Kakao/Naver brand colors | ACCEPTED EXCEPTION |
| 5. `text-[Npx]` type scale violations | many | 4 instances, 3 files | NEEDS FIX (3 of 4) |
| 6. Dark mode gaps (`bg-white` without `dark:`) | many | 0 true violations in pages (all are `bg-white/opacity` or `focus:bg-white`) | ALREADY CLEAN |
| 6b. Form input dark mode gaps | unknown | 2 files confirmed | NEEDS FIX |
| 7. `transition-all` | many | 0 | ALREADY CLEAN |

## Goal

Fix the 3 remaining violation categories:
1. Increase glass-mobile-nav opacity (shared CSS)
2. Replace 3 `text-[Npx]` with design tokens
3. Add dark mode classes to 2 form pages + 1 component

## Original Conditions

- [ ] glass-mobile-nav opacity: delete the override block at L339-359 so `.glass-mobile-nav` inherits from the general glass system (L315-327 provides `rgba(255,255,255,0.88->0.72)` gradient + `--glass-mobile-bg` = `rgba(255,255,255,0.82)` which is in the target range 0.75-0.85)
- [ ] `floating-bottom-nav` dead CSS class removed from L339-340 and L351-352 (zero usage in any component)
- [ ] `text-[10px]` in `bottom-nav.tsx:68` replaced with `text-2xs`
- [ ] `text-[9px]` in `bottom-nav.tsx:60` -- ACCEPTED: sub-token precision for unread badge counter, no standard token at 9px
- [ ] `text-[11px]` in `mobile-page-top-zone.tsx:43` replaced with `text-xs`
- [ ] `text-[17px]` in `mobile-glass-header.tsx:57` -- ACCEPTED: deliberate between-token value for header title (16px and 18px are both wrong for this use case)
- [ ] `lessons/new/page.tsx` -- all 12 form inputs get `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100` (matches canonical pattern from `matches/[id]/edit/page.tsx`)
- [ ] `teams/new/page.tsx:114` -- chip inactive state gets `dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700`
- [ ] `components/payment/checkout-modal.tsx:107` -- gets `dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700`
- [ ] `tsc --noEmit` passes after all changes
- [ ] ESLint passes after all changes

## Accepted Exceptions (Not Violations)

| Pattern | Location | Reason |
|---|---|---|
| `bg-[#FEE500]` | `login/page.tsx:98`, `settings/account/page.tsx:275` | Kakao brand color (mandated by brand guidelines) |
| `bg-[#03C75A]` | `login/page.tsx:108`, `settings/account/page.tsx:282` | Naver brand color (mandated by brand guidelines) |
| `text-[#191919]` | `login/page.tsx:98` | Kakao brand text color |
| `text-[9px]` | `bottom-nav.tsx:60` | Sub-token badge counter -- no design token at 9px |
| `text-[17px]` | `mobile-glass-header.tsx:57` | Deliberate inter-token precision for header title |
| `bg-white/10`, `bg-white/5` | Various decorative circles | Opacity variants on gradient backgrounds, dark mode N/A |
| `focus:bg-white` | Form inputs | Focus state only, on light background fields |

## Parallel Work Breakdown

### Phase 0 -- Shared CSS (Sequential, 1 agent)

**Files modified**: `apps/web/src/app/globals.css`

**Rationale**: This is the only shared file. Must complete before any parallel work to avoid merge conflicts.

**ADR: Delete nav override vs update values**

- Context: `globals.css` L315-327 defines a general glass system rule for all `.glass-mobile-*` classes including `.glass-mobile-nav`. It uses `--glass-mobile-bg` = `rgba(255,255,255,0.82)` via a gradient `0.88 -> 0.72`. Then L339-359 overrides `.glass-mobile-nav` specifically with a flat `rgba(255,255,255,0.35)`, harder blur (28px vs 14px), and custom shadow. The user wants 0.75-0.85 opacity.
- Decision: **Delete the override block (L339-359)** rather than updating its values. The general glass system already provides 0.82 opacity, which is exactly in the target range. The nav does not need different blur/shadow from other glass surfaces. This is cleaner than maintaining two competing declarations.
- Consequences: `.glass-mobile-nav` inherits identical visual treatment as `.glass-mobile-header` and `.glass-mobile-panel`. If a future need arises for the nav to look distinct, a new override can be added with clear documentation.

**Changes**:
- Delete L339-349 (`.glass-mobile-nav, .floating-bottom-nav` light override)
- Delete L351-359 (`.dark .glass-mobile-nav, .dark .floating-bottom-nav` dark override)
- Also remove `.floating-bottom-nav` from L319 and L333 (dead CSS class, zero usage in any component -- confirmed by grep)

### Phase 1 -- Leaf files (Parallelizable, but small enough for 1 agent)

All files below are leaf files with zero cross-dependencies:

**Group A: Layout token fixes** (2 files)
- `apps/web/src/components/layout/bottom-nav.tsx:68` -- `text-[10px]` to `text-2xs`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx:43` -- `text-[11px]` to `text-xs`

**Group B: Form dark mode** (2 page files)
- `apps/web/src/app/(main)/lessons/new/page.tsx` -- 12 input elements need dark mode classes
- `apps/web/src/app/(main)/teams/new/page.tsx:114` -- 1 chip selector needs dark mode

**Group C: Component dark mode** (1 component file)
- `apps/web/src/components/payment/checkout-modal.tsx:107` -- 1 inactive state needs dark mode

**Do NOT touch**: `home/home-client.tsx` (reference page), `login/page.tsx` (Kakao/Naver brand colors), `settings/account/page.tsx` (Kakao/Naver brand colors), `mobile-glass-header.tsx` (accepted exception), `bottom-nav.tsx:60` (accepted exception)

## Test Scenarios

### Happy Path
- Light mode: glass-mobile-nav is visually more opaque (readable over any page content)
- Dark mode: glass-mobile-nav maintains frosted look with increased opacity
- `lessons/new` form inputs render properly in dark mode
- `teams/new` chip selector renders properly in dark mode
- `checkout-modal` inactive payment option renders properly in dark mode

### Edge Cases
- Bottom nav badge (9px) remains visually identical (no change)
- Mobile glass header title (17px) remains visually identical (no change)
- Kakao/Naver login buttons retain exact brand colors

### Error Paths
- None (CSS-only changes, no logic changes)

### Mock Updates Needed
- None (no API/data changes)

## Tech Debt Resolved

| Item | Resolution |
|---|---|
| glass-mobile-nav too transparent | Fixed: deleted override block, nav now inherits general glass system (0.82) |
| `.floating-bottom-nav` dead CSS | Removed: dead class in globals.css, zero component usage |
| text-[Npx] token violations | Fixed: 2 of 4 replaced with tokens, 2 accepted as deliberate |
| lessons/new dark mode gap | Fixed: all 12 inputs get dark mode (pattern from matches/[id]/edit) |
| teams/new dark mode gap | Fixed: 1 chip selector gets dark mode |
| checkout-modal dark mode gap | Fixed: 1 inactive state gets dark mode |

**No deferred items.**

## Security Notes

No security impact. All changes are CSS styling. No new endpoints, no data flow changes, no auth changes.

## Validation Strategy

After all changes:
```bash
cd apps/web && npx tsc --noEmit     # TypeScript check
cd apps/web && pnpm lint             # ESLint
rg 'text-\[\d+px\]' apps/web/src/components/layout/ --count-matches  # Verify token adoption (expect 2: text-[9px] and text-[17px] -- both accepted)
rg 'rgba(255, 255, 255, 0.35)' apps/web/src/app/globals.css          # Verify old override gone (expect 0 matches)
rg 'floating-bottom-nav' apps/web/src/app/globals.css                 # Verify dead class removed (expect 0 matches)
rg -c 'dark:' apps/web/src/app/(main)/lessons/new/page.tsx            # Verify dark mode added (expect significant increase from 29)
```

Visual verification:
- Bottom navigation bar opacity in light and dark mode (should match header/panel glass)
- `lessons/new` page in dark mode (form inputs must have dark backgrounds)
- `teams/new` page chip selectors in dark mode

## Risks & Dependencies

- **Low risk**: glass-mobile-nav inheriting general glass system affects all pages but is purely visual. The general system is already used by header/panel glass surfaces without issues.
- **Cleanup scope**: `floating-bottom-nav` also appears in the `@supports` fallback block (L408-411) -- must be removed there too.
- **Dependency**: Task 55 (Design System Remediation Waves) is fully complete -- this task handles the remaining gaps.
- **No regression risk**: `border-l-4`, `transition-all`, inline empty states, and hardcoded colors are already at zero violations.
