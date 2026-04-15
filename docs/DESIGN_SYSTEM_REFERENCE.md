# Teameet Design System Reference

> **Agent-consumable reference.** This document is the single source for any agent needing to understand the current state of the Teameet design system — tokens, components, assets, compliance, and remediation priorities. It does NOT define rules (that is `DESIGN.md`). It reports the gap between rules and reality.

Audit date: 2026-04-12
Baseline commit: `9ba813a25a349f4d60a1b5412ed8c90a455beb68`
Rule source: `DESIGN.md`
Execution contract: `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`
Coverage contract: `.github/tasks/54-unified-visual-audit-coverage-master.md`

## 1. Compliance Summary

| Area | DESIGN.md Rule | Code Reality | Compliance | Severity |
|------|---------------|-------------|------------|----------|
| Shadow | Hairline-only on content cards | shadow-lg 29x in 14 files, shadow-xl 14x in 7 files | **40%** | HIGH |
| Border | Subtle or borderless | border-2 in 20 files, 52 occurrences | **30%** | HIGH |
| Glass | Chrome-only (nav, header, overlay) | backdrop-blur in 9 files, image overlay badges violate | **85%** | MEDIUM |
| Card reuse | Shared Card component | 138 inline cards vs 8 Card uses (6% adoption) | **6%** | CRITICAL |
| EmptyState reuse | Shared EmptyState | 70 files import vs 6 inline (92%) | **92%** | OK |
| ErrorState reuse | Shared ErrorState | 38 files import vs ~35 inline (52%) | **52%** | MEDIUM |
| Modal reuse | Shared Modal | 18 files import vs 3 inline (86%) | **86%** | OK |
| Color tokens | Token-first, no hardcoded | Tokens 100% defined in globals.css @theme | **100%** | OK |
| Typography tokens | Type scale tokens | 12-step scale defined, but 3 hardcoded values in layout components | **97%** | MEDIUM |
| Responsive system | Documented breakpoints | @3xl container query undocumented, dual system (CQ + Tailwind) | **—** | HIGH |

**Overall design system compliance: ~55%**

**Caveats**: Glass 85% is based on `backdrop-blur` grep only — `glass-mobile-*` custom classes need separate tracking. Typography was initially reported as 100% but 3 violations exist in MobileGlassHeader (`text-[17px]`) and MobilePageTopZone (`text-[11px]`, `text-[1.85rem]`).

## 2. Token Inventory

Source: `apps/web/src/app/globals.css`
- `@theme` block: lines 3-66 (colors, type scale, animations)
- `:root` block: lines 85-106 (duration tokens, glass custom properties)

**Counting methodology**: "Uses" in this document = number of files that import the component, not total JSX render instances. A file importing Card once or five times counts as 1 use.

### 2.1 Colors

| Token | Value | Role |
|-------|-------|------|
| `--color-primary` | `#3182F6` | Primary accent |
| `--color-primary-dark` | `#1B64DA` | Primary hover/active |
| `--color-background` | `#F9FAFB` | Page background |
| `--color-surface` | `#FFFFFF` | Card/panel surface |
| `--color-text-primary` | `#191F28` | Body text |
| `--color-text-secondary` | `#6B7684` | Secondary text |
| `--color-text-tertiary` | `#8B95A1` | Hint/placeholder |
| `--color-border` | `#E5E8EB` | Default border |
| `--color-success` | `#34C759` | Success state |
| `--color-warning` | `#FF9500` | Warning state |
| `--color-error` | `#FF3B30` | Error state |

**Blue scale**: `blue-50` #EFF6FF, `blue-100` #DBEAFE, `blue-500` #3182F6, `blue-600` #1B64DA, `blue-700` #1957C2
Note: `blue-950` (#172554) is used in dark mode (`dark:bg-blue-950/30`) but comes from Tailwind defaults, not the @theme block.

**Gray scale (complete)**:

| Token | Value | Common use |
|-------|-------|-----------|
| `gray-50` | #F9FAFB | Page background |
| `gray-100` | #F2F4F6 | Card background alt, skeleton |
| `gray-200` | #E5E8EB | Borders, dividers |
| `gray-300` | #D1D6DB | Disabled borders |
| `gray-400` | #B0B8C1 | Placeholder text |
| `gray-500` | #8B95A1 | Tertiary text |
| `gray-600` | #6B7684 | Secondary text |
| `gray-700` | #4E5968 | Muted headings |
| `gray-800` | #333D4B | Strong text alt |
| `gray-900` | #191F28 | Primary text, dark mode bg |

### 2.2 Typography

Base: 14px, minor third scale (1.2). Font: Pretendard Variable.

| Token | Size | Use |
|-------|------|-----|
| `--font-size-2xs` | 10px | Badges, timestamps |
| `--font-size-xs` | 11px | Meta, captions |
| `--font-size-sm` | 13px | Body small, chips |
| `--font-size-base` | 14px | Body default |
| `--font-size-md` | 15px | Body prominent |
| `--font-size-lg` | 16px | Card titles |
| `--font-size-xl` | 18px | Section headers |
| `--font-size-2xl` | 22px | Page titles |
| `--font-size-3xl` | 28px | Hero, metrics |
| `--font-size-4xl` | 36px | Landing hero |
| `--font-size-5xl` | 44px | Landing display |
| `--font-size-6xl` | 56px | Landing jumbo |

### 2.3 Motion

**Animations** (inside `@theme`, lines 41-51): fade-in, fade-out, slide-up, slide-down, scale-in, scale-out, badge-pulse, shimmer, banner-in, stagger-in

**Duration tokens** (inside `:root`, lines 89-92 — NOT in `@theme`):

| Token | Duration |
|-------|----------|
| `--duration-fast` | 150ms |
| `--duration-normal` | 200ms |
| `--duration-slow` | 300ms |

**Compliance win**: `transition-all` usage = 0 occurrences (DESIGN.md prohibits it). This is a regression baseline to maintain.

**Delight animations** (plain CSS classes outside @theme, globals.css lines 533-547):
- `animate-fade-in-up`, `animate-slide-in-right`, `animate-slide-in-left`, `animate-expand`, `animate-check-draw`, `animate-gentle-bounce`, `stagger-children`
- Used in: Toast (`check-draw`), EmptyState (`gentle-bounce`), landing/guide (`fade-in-up`)

### 2.4 Sport Colors

Source: `apps/web/src/lib/constants.ts` (lines 41-53) `sportCardAccent`

| Sport | Tint | Badge | Dot |
|-------|------|-------|-----|
| soccer | green-50/40 | green-50 text-green-600 | green-400 |
| futsal | blue-50/40 | blue-50 text-blue-500 | blue-400 |
| basketball | amber-50/40 | amber-50 text-amber-600 | amber-400 |
| badminton | cyan-50/40 | cyan-50 text-cyan-600 | cyan-400 |
| ice_hockey | teal-50/40 | teal-50 text-teal-600 | teal-400 |
| tennis | red-50/40 | red-50 text-red-500 | red-400 |
| swimming | sky-50/40 | sky-50 text-sky-600 | sky-400 |
| figure_skating | purple-50/40 | purple-50 text-purple-500 | purple-300 |
| short_track | slate-50/40 | slate-50 text-slate-600 | slate-400 |
| baseball | orange-50/40 | orange-50 text-orange-600 | orange-400 |
| volleyball | indigo-50/40 | indigo-50 text-indigo-500 | indigo-400 |

Icon map: `apps/web/src/components/icons/sport-icons.tsx` — 11 inline SVG components via `SportIconMap`

**Token drift warning**: A legacy `sportIconColor` mapping exists at `constants.ts:26` with different values for 3 sports:
- `figure_skating`: iconColor = `gray-100/gray-500` vs cardAccent = `purple-50/purple-500`
- `short_track`: iconColor = `gray-100/gray-500` vs cardAccent = `slate-50/slate-600`
- `volleyball`: iconColor = `blue-50/blue-500` vs cardAccent = `indigo-50/indigo-500`

`sportCardAccent` is the canonical mapping. `sportIconColor` (1 file use) is a consolidation candidate.

### 2.5 Spacing Conventions

No custom spacing tokens in @theme. Project uses Tailwind v4 default 4px grid (1 unit = 0.25rem = 4px).

| Context | Typical values | Source |
|---------|---------------|--------|
| Card padding | `p-4` (16px), `p-5` (20px), `p-6` (24px) | card.tsx lines 11-14 |
| Page shell gap | `gap-8` (32px), `px-8` (32px) | layout shells |
| Mobile content gap | `gap-3` (12px), `gap-4` (16px) | list/card layouts |
| Safe area insets | `--safe-area-top`, `--safe-area-bottom`, `pb-safe` | globals.css line 303 |

### 2.6 Border Radius Vocabulary

No custom radius tokens. Uses Tailwind defaults:

| Class | Value | Use |
|-------|-------|-----|
| `rounded-lg` | 8px | Buttons (sm/md), small chips |
| `rounded-xl` | 12px | Buttons (lg), cards, inputs |
| `rounded-2xl` | 16px | Card.default, dialog |
| `rounded-3xl` | 24px | Card.surface, hero panels |
| `rounded-[24px]` | 24px | Arbitrary duplicate of rounded-3xl (anti-pattern) |

DESIGN.md rule: "Content card must not appear rounder than chrome." Currently `Card.surface` uses `rounded-[24px]`/`rounded-3xl` while `MobileGlassHeader` uses `rounded-2xl` — this **violates** the radius hierarchy rule.

### 2.7 Z-Index Layering

No custom z-index tokens. Ad-hoc values in use:

| z-value | Component | File |
|---------|-----------|------|
| `z-[9999]` | Progress bar | progress-bar.tsx:46 |
| `z-[100]` | Media lightbox | media-lightbox.tsx:156 |
| `z-[100]` | Toast | toast.tsx:62 |
| `z-[90]` | Modal | modal.tsx:82 |
| `z-[60]` | Onboarding overlay | onboarding/page.tsx:61 |
| `z-[60]` | Chat full-screen | chat/[id]/page.tsx:23 |
| `z-50` | Bottom nav | bottom-nav.tsx:28 |
| `z-40` | Sidebar | sidebar.tsx:61 |
| `z-20` | Sticky header | mobile-glass-header.tsx:40 |

### 2.8 Responsive System

**Dual mechanism** — not documented in DESIGN.md, discovered by audit:

1. **CSS Container Queries** (`@container` + `@3xl:`) — primary layout pivot
   - Mobile shell: `max-w-3xl` (768px)
   - Desktop shell: `max-w-[960px]`
   - `@3xl` breakpoint = container >= 48rem (768px) — this is the mobile/desktop toggle
   - `@3xl:hidden` = mobile-only, `@3xl:flex` = desktop-only
   - Source: `apps/web/src/app/(main)/layout.tsx`

2. **Tailwind responsive prefixes** (`sm:`, `md:`, `lg:`, `xl:`) — viewport-based, used for components outside containers
   - `sm`: 640px, `md`: 768px, `lg`: 1024px, `xl`: 1280px, `2xl`: 1536px
   - Used for: Sidebar visibility (`lg:`), Toast position (`lg:`), Modal layout

**Agent rule**: For content inside the `(main)/layout.tsx` container, use `@3xl:` prefix. For global chrome (toast, modal, sidebar), use Tailwind viewport prefixes (`lg:`).

### 2.9 Glass Tokens

Source: `:root` block, globals.css lines 86-106

| Token | Light value | Dark value |
|-------|------------|------------|
| `--glass-mobile-bg` | rgba(255,255,255,0.82) | rgba(15,23,42,0.78) |
| `--glass-mobile-bg-strong` | rgba(255,255,255,0.88) | rgba(15,23,42,0.84) |
| `--glass-mobile-bg-soft` | rgba(255,255,255,0.9) | rgba(15,23,42,0.86) |
| `--glass-mobile-border` | rgba(226,232,240,0.86) | rgba(255,255,255,0.1) |
| `--glass-mobile-border-strong` | rgba(203,213,225,0.72) | rgba(255,255,255,0.1) |
| `--glass-mobile-blur` | 14px | (same) |
| `--glass-mobile-blur-strong` | 20px | (same) |
| `--glass-mobile-saturate` | 150% | (same) |
| `--glass-mobile-fallback` | rgba(248,250,252,0.96) | (not overridden) |

Custom classes consuming these: `glass-mobile-surface`, `glass-mobile-panel`, `glass-mobile-header`, `glass-mobile-nav`, `glass-mobile-icon-button`, `floating-bottom-nav`

## 3. Component Catalog

### 3.1 Shared UI (`components/ui/`)

| Component | File | Uses | Compliance |
|-----------|------|------|------------|
| **Toast** | `toast.tsx` | 53 | OK |
| **Skeleton** | `skeleton.tsx` | 75 | OK |
| **EmptyState** | `empty-state.tsx` | 70 | OK |
| **ErrorState** | `error-state.tsx` | 37 | MEDIUM — 36 inline alternatives |
| **Modal** | `modal.tsx` | 16 | OK |
| **SafeImage** | `safe-image.tsx` | 11 | OK — robust fallback |
| **TrustSignalBanner** | `trust-signal-banner.tsx` | 11 | OK |
| **Input** | `input.tsx` | 9 | OK |
| **Card** | `card.tsx` | 8 | CRITICAL — 138 inline alternatives |
| **Button** | `button.tsx` | 8 | MEDIUM — primitives need default fix |
| **ImageUpload** | `image-upload.tsx` | 6 | OK |
| **MediaLightbox** | `media-lightbox.tsx` | 5 | OK |
| **FormField** | `form-field.tsx` | 5 | MEDIUM — many forms skip this |
| **AppErrorScreen** | `app-error-screen.tsx` | 3 | OK |
| **Textarea** | `textarea.tsx` | 3 | OK |
| **Select** | `select.tsx` | 2 | LOW — most selects are inline |
| **SectionHeader** | `section-header.tsx` | 2 | LOW |
| **MiniCalendar** | `mini-calendar.tsx` | 1 | LOW |
| **LocaleSwitcher** | `locale-switcher.tsx` | 1 | OK |
| **BadgeDisplay** | `badge-display.tsx` | 0 | UNUSED |
| **MapPlaceholder** | `map-placeholder.tsx` | 0 | UNUSED |
| **SportAvatar** | `sport-avatar.tsx` | 0 | UNUSED |

### 3.2 Layout (`components/layout/`)

| Component | File | Uses |
|-----------|------|------|
| **MobileGlassHeader** | `mobile-glass-header.tsx` | 24 |
| **MobilePageTopZone** | `mobile-page-top-zone.tsx` | 9 |
| **BottomNav** | `bottom-nav.tsx` | 1 |
| **Sidebar** | `sidebar.tsx` | 1 |
| **Footer** | `footer.tsx` | 1 |
| **ProgressBar** | `progress-bar.tsx` | 1 |

### 3.3 Domain Components

| Component | Path | Uses |
|-----------|------|------|
| **SportIcons** | `icons/sport-icons.tsx` | 13 |
| **AdminToolbar** | `admin/admin-toolbar.tsx` | 11 |
| **LandingNav** | `landing/landing-nav.tsx` | 5 |
| **LandingFooter** | `landing/landing-footer.tsx` | 5 |
| **ScrollReveal** | `landing/scroll-reveal.tsx` | 5 |
| **ChatBubble** | `chat/chat-bubble.tsx` | 1 |
| **CheckoutModal** | `payment/checkout-modal.tsx` | 1 |
| **TicketPlanSelector** | `lesson/ticket-plan-selector.tsx` | 1 |
| **LessonCalendar** | `lesson/lesson-calendar.tsx` | 1 |
| **TransferOwnershipModal** | `teams/transfer-ownership-modal.tsx` | 1 |
| **ApplicationsSection** | `team-matches/applications-section.tsx` | 1 |
| **MatchesMapView** | `map/matches-map-view.tsx` | 1 |
| **EditProfileModal** | `profile/edit-profile-modal.tsx` | 1 |

### 3.4 Missing Components (from Task 54 contract)

**CRITICAL — Discovery cards (all missing, all inline):**
- MatchCard, TeamMatchCard, LessonCard, MarketplaceListingCard, MercenaryCard, VenueCard, TournamentCard

**HIGH — Form primitives:**
- SegmentedToggle (6 files use inline radio), ChipFilter, DateTimePicker, Drawer

**MEDIUM — Identity/Transaction:**
- ProfileSummary, StatsStrip, AccountMenu, PaymentSummaryCard, RefundStatusCard, ReviewCard, ParticipantStatusRow, AdminActionPanel

**LOW — Shell:**
- DesktopTopNav, FilterBar, TabStrip

## 4. Anti-Pattern Evidence

### 4.1 Shadow Violations

**DESIGN.md rule**: Hairline-only on content cards. Stronger shadow only on truly floating chrome.

| Pattern | Files | Count | Top Violators |
|---------|-------|-------|---------------|
| `shadow-lg` | 14 | 29 | landing/page.tsx:97 (7x), pricing/page.tsx:56 (5x), guide/page.tsx:239 (3x) |
| `shadow-xl` | 7 | 14 | landing/page.tsx:97 (5x), pricing/page.tsx:56 (4x), settings/account:1x |
| `shadow-2xl` | 1 | 2 | admin/lesson-tickets/page.tsx:222 |

**Pattern**: 76% of shadow violations are in public marketing pages (landing, pricing, guide, faq, about).

### 4.2 Border Violations

**DESIGN.md rule**: Subtle full border or borderless. No thick outlines, no border-heavy grids.

| Pattern | Files | Count | Top Violators |
|---------|-------|-------|---------------|
| `border-2` | 20 | 52 | team-matches/new:7x, team-matches/[id]/edit:6x, matches/[id]:6x |
| `border-l-4` | 0 | 0 | CLEAR |

**Pattern**: 90% of border-2 is in create/edit forms — used as selected-state indicator for radio/toggle choices.

### 4.3 Glass Violations

**DESIGN.md rule**: Glass on chrome only (navbar, sticky header, bottom nav, overlay).

| Pattern | Files | Context | Verdict |
|---------|-------|---------|---------|
| `backdrop-blur-sm` on image overlay badges | matches-client.tsx:111,123,127,131 | Status chips over match images | VIOLATION |
| `backdrop-blur-sm` on lesson badges | lessons/page.tsx:80,95,99,103 | Category chips over lesson images | VIOLATION |
| `backdrop-blur` on modal backdrop | modal.tsx | Overlay background | ALLOWED |
| `glass-mobile-nav` on bottom nav | bottom-nav.tsx:31 | Chrome | ALLOWED |
| `glass-mobile-header` on sticky header | mobile-glass-header.tsx:40,76 | Chrome | ALLOWED |
| `glass-mobile-icon-button` on action buttons | 28+ files | Button chrome | ALLOWED |

**Tracking note**: `glass-mobile-*` custom classes apply glass via CSS custom properties internally and are NOT detectable by grepping `backdrop-blur`. To track all glass usage, also grep for `glass-mobile`.

### 4.4 Card Primitive Defaults

Source: `apps/web/src/components/ui/card.tsx`

- **Card.default** (line 5): includes `shadow-sm` — should be `shadow-none` or hairline per DESIGN.md
- **Card.surface** (line 7): includes `shadow-[0_16px_30px_rgba(15,23,42,0.05)]` — too heavy

Source: `apps/web/src/components/ui/button.tsx`

- **Button.primary** (line 6): includes blue shadow default — should be solid-only
- **focus ring** (line 40): `ring-4` — oversized, should be `ring-2`

## 5. Asset Inventory

### 5.1 Static Assets

Total: **87 files** / **19.3 MB**

| Category | Files | Size | Format |
|----------|-------|------|--------|
| Photoreal sport images | 38 | 18 MB | JPG/WebP |
| AI-generated scenes | 11 | 1.1 MB | WebP |
| Sport scene illustrations | 15 | 60 KB | SVG |
| Profile avatars | 12 | 48 KB | SVG |
| Generic venue/team | 4 | 16 KB | SVG |
| Marketplace items | 6 | 12 KB | SVG |
| PWA/favicon | 3 | 1.8 KB | ICO/SVG |

### 5.2 Icon System

- **Custom sport icons**: 11 (in `components/icons/sport-icons.tsx`)
- **Lucide React icons**: 92 unique icons across 121 files
- **Static SVGs in components**: 0 (all dynamic)

### 5.3 Mock Image Catalog

Source: `apps/api/prisma/mock-image-catalog.ts`

6 seeding functions with hash-based deterministic selection:
- `getMatchSeedImage()` — sport-specific + venue fallback
- `getVenueSeedImages()` — up to 4 images
- `getLessonSeedImages()` — up to 4 hero images
- `getListingSeedImages()` — marketplace items
- `getTeamCoverSeedImage()` — sport-specific + team fallback
- `getTeamPhotoSeedImages()` — up to 3 gallery images

### 5.4 Fallback System

Primary handler: `components/ui/safe-image.tsx`
- Path normalization with security checks
- Automatic fallback on load error
- State tracking to prevent infinite loops
- Empty div graceful degradation

Empty/Error states: Icon-based (no image dependencies)

### 5.5 Missing Assets

- **OG image** — No social sharing preview image
- **Twitter card image** — Not configured
- **Branded logo SVG** — Only favicon exists, no standalone logo file

## 6. Route Coverage Matrix

### 6.1 Canonical Routes: 92

| Batch | Routes | Static | Dynamic | Persona Mix |
|-------|--------|--------|---------|-------------|
| batch-1-public-auth | 6 | 6 | 0 | guest (6) |
| batch-2-main-discovery | 10 | 10 | 0 | user (8), teamOwner (2) |
| batch-3-detail-pages | 14 | 0 | 14 | user (9), teamOwner (5) |
| batch-4-create-edit-forms | 19 | 8 | 11 | teamOwner (9), user (5), instructor (2), seller (2), admin (1) |
| batch-5-account-utility | 21 | 21 | 0 | user (15), teamOwner (4), instructor (1), seller (1) |
| batch-6-admin | 22 | 15 | 7 | admin (22) |

### 6.2 Interaction States: 234 total

| State | Routes | Platform |
|-------|--------|----------|
| default | 92 | all |
| scrolled | 91 | all |
| focus-first-input | 26 | all (form routes) |
| hover-primary-cta | 14 | desktop only |
| hover-card-first | 9 | desktop only |
| menu-open | 5 | all (public pages) |
| filter-open | 1 | all (/matches) |

### 6.3 Screenshot Coverage (2026-04-11 verified)

| Batch | Route Coverage | Viewport Coverage | Notes |
|-------|---------------|-------------------|-------|
| batch-1 public/auth | **6/6** | mobile-sm through tablet-sm | tablet-md+ missing |
| batch-5 account/utility | **3/21** | mobile-md, desktop-md | /feed, /badges, /chat only |
| batch-2 discovery | **0/10** | none | HIGHEST PRIORITY |
| batch-3 detail | **0/14** | none | |
| batch-4 form/edit | **0/19** | none | |
| batch-6 admin | **0/22** | none | |

**Effective coverage: 9/92 routes (10%), 72/2,106 state-viewport pairs (~3%)**

Note: 1,505+ PNG artifacts exist across 111 test runs in `output/playwright/visual-audit/`, but many are from partial/failed runs. Verified usable coverage is limited to the batches above.

### 6.4 Persona Requirements

| Persona | Routes | Dev-login nickname | Warmup |
|---------|--------|--------------------|--------|
| guest | 6 | (none) | /landing |
| user | 37 | 시나로E2E | /matches |
| teamOwner | 20 | 팀장오너E2E | /teams |
| seller | 3 | 판매자E2E | /marketplace |
| instructor | 3 | 강사E2E | /lessons |
| admin | 23 | 관리자E2E | /admin/dashboard |

## 7. Screenshot-Backed Findings (from existing artifacts)

Source: `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md:107-378`

### 7.1 Public Surface (batch-1, evidence available)

- Layout direction is clean and solid-first — approaching DESIGN.md intent
- **CTA and featured card shadow/lift still excessive**: `shadow-lg`, `hover:shadow-xl` on landing/pricing
- **Mobile spacing rhythm loose**: hero-to-proof-block gap too long on landing/about/guide/pricing
- **Reference surfaces**: /faq (current best public page), /login mobile (best auth page)
  - **CAVEAT**: /faq still has `shadow-lg shadow-blue-500/20` and `hover:shadow-xl` violations. It is "less bad" not "fully compliant." Do NOT copy its shadow/CTA patterns as reference. It is a Wave 2 remediation target.
  - /login mobile is genuinely compliant for auth surface baseline.
  - /admin/dashboard is a candidate for utility reference (low anti-pattern density) but has no screenshot evidence yet.

### 7.2 Account Utility (batch-5, partial evidence)

- **Glass discipline good**: chrome-only glass on /feed, /badges, /chat mobile
- **Exception**: /badges summary icon chip has residual glass feeling
- **Desktop density problem**: /feed, /badges, /chat desktop feel empty — width/density issue, not shadow

### 7.3 Discovery/Detail/Form/Admin (batches 2-6, no screenshot evidence yet)

**Code-predicted issues (from anti-pattern audit):**
- batch-2: discovery list pages will show inconsistent control language (each page has different CTA/filter/chip patterns)
- batch-3: detail pages will show content-area glass violations (backdrop-blur on image badges)
- batch-4: form pages will show border-2 heavy selected-state patterns
- batch-6: admin pages likely cleaner (fewer anti-patterns detected)

## 8. Remediation Priority

### Wave 0 — Primitive Defaults (prerequisite for all waves)

**What**: Fix Card, Button defaults to match DESIGN.md
**Files**: `card.tsx`, `button.tsx`, `globals.css`
**Impact**: 8 Card + 8 Button direct consumers auto-fixed; sets correct baseline for 138 inline card migrations

| Fix | Current | Target |
|-----|---------|--------|
| Card.default shadow | `shadow-sm` | `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` (hairline — barely visible, preserves depth cue without weight) |
| Card.surface shadow | `shadow-[0_16px_30px_rgba(15,23,42,0.05)]` | `shadow-[0_2px_8px_rgba(0,0,0,0.04)]` (reduced to hairline depth) |
| Card.surface border/bg | `border-white/80 bg-white/92` | Glass-like translucency on content card — violates DESIGN.md 4.4. Change to `border-gray-200 bg-white` (solid) or deprecate variant |
| Button.primary shadow | `shadow-sm shadow-blue-500/20` | Remove (solid-only per DESIGN.md). Note: subtle (2px blur, 20% opacity) but still non-compliant |
| Button focus ring | `ring-4 ring-blue-500/15` | 15% opacity makes this nearly invisible — likely fails WCAG focus visibility. Recommend `ring-2 ring-blue-500/40` for visible but restrained focus |

### Wave 1 — Discovery Family Normalization

**What**: Unify CTA/filter/chip/input grammar across all 10 discovery list pages
**Files**: home-client.tsx, matches-client.tsx, lessons/page.tsx, venues/page.tsx, teams/teams-client.tsx, marketplace/page.tsx, mercenary/page.tsx, team-matches/page.tsx (if exists or inline in layout), tournaments/page.tsx
**Pattern to eliminate**: page-local CTA/filter markup → shared FilterBar or control strip component

### Wave 2 — Public Marketing Shadow Reduction

**What**: Reduce shadow-lg/xl in public pages, keep hierarchy through spacing and typography
**Files**: landing/page.tsx (12 shadow hits), pricing/page.tsx (9 hits), guide/page.tsx (4 hits), faq/page.tsx (4 hits), about/page.tsx (3 hits)
**Target**: "Clean persuasion" not "showcase polish"
**Why before glass cleanup**: Public-facing CTA shadow is the first brand impression external users encounter. Trust through restraint (DESIGN.md 3.3) demands this surface be fixed before internal image badges.

### Wave 3 — Content Glass Cleanup

**What**: Remove backdrop-blur from image overlay badges in content cards
**Files**: matches-client.tsx:111-131 (4 instances), lessons/page.tsx:80-103 (4 instances)
**Replace with**: Solid tint badge (`bg-gray-900/70 text-white` or sport-color solid chip)
**Note**: teams/team-list.tsx and teams/[id]/page.tsx were initially flagged but verified as false positives — they use solid surfaces or allowed chrome glass, not content glass violations.

### Wave 4 — Form Border Cleanup

**What**: Replace border-2 selected-state patterns with background/icon/check grammar
**Files**: 20 files with 52 border-2 occurrences (mostly create/edit forms)
**Risk**: Must design alternative selected-state affordance before removing borders

### Wave 5 — Domain Card Extraction

**What**: Extract 7 missing domain card components from inline markup
**Components**: MatchCard, TeamMatchCard, LessonCard, MarketplaceListingCard, MercenaryCard, VenueCard, TournamentCard
**Prerequisite**: Wave 0 (Card defaults fixed first)

## 9. Validation Strategy

### Static Checks (before/after grep counts)

```
# Run these after each wave to track progress
rg 'shadow-lg' apps/web/src --count-matches
rg 'shadow-xl' apps/web/src --count-matches
rg 'border-2' apps/web/src --count-matches
rg 'backdrop-blur' apps/web/src --count-matches
rg 'glass-mobile' apps/web/src --count-matches  # Custom glass classes (allowed on chrome)
rg 'transition-all' apps/web/src --count-matches # Should stay at 0
rg '<Card' apps/web/src --count-matches          # Should increase
rg 'rounded-xl border bg-white' apps/web/src     # Inline cards — should decrease
```

### Type Check

```bash
cd apps/web && npx tsc --noEmit
```

### Representative Route Review Set

| Wave | Routes to verify |
|------|-----------------|
| 0 | Any 3 pages using Card/Button |
| 1 | /home, /matches, /lessons, /venues, /teams |
| 2 | /landing, /pricing, /faq |
| 3 | /matches (card badges), /lessons (card badges) |
| 4 | /team-matches/new, /lessons/new, /mercenary/new |
| 5 | All discovery list pages (card rendering) |

### Screenshot Expansion Priority

```
batch-2 (discovery) → batch-3 (detail) → batch-4 (form) → batch-6 (admin) → batch-1/5 missing viewports
```

## 10. Document Relationships

```
DESIGN.md                     ← Rules (source of truth)
  ↓
docs/DESIGN_SYSTEM_REFERENCE.md  ← THIS FILE: current state, evidence, gap analysis
  ↓
.github/tasks/52-...          ← Active remediation execution contract
.github/tasks/54-...          ← Visual audit coverage contract
.github/tasks/53-...          ← Operator one-pager for screenshot runs
docs/PLAYWRIGHT_E2E_RUNBOOK.md ← Runtime commands for captures
```

When starting any design work:
1. Read `DESIGN.md` for rules
2. Read this file for current state and evidence
3. Read Task 52 for active remediation plan
4. Read Task 53/Runbook for capture execution

## 11. Dark Mode System

Three parallel mechanisms in `globals.css`:

1. **Raw utility overrides** (lines 130-183): `.dark .bg-white { background-color: #1A1D23 !important; }`
2. **`ds-*` marker class overrides** (lines 186-218): `.dark .ds-card.ds-card-default { background-color: #1A1D23 }`, `.dark .ds-button.ds-button-primary { ... }`
3. **Legacy form fallback** (lines 243-264): `.dark input:not(.ds-input) { ... }`

**Implicit behavior**: `.dark .rounded-2xl` and `.dark .rounded-3xl` automatically get `border-color: #2C3038` (lines 182-183), adding a border to all rounded elements in dark mode regardless of light mode border state.

**Gap**: `teal-50` (ice_hockey sport badge) has no explicit dark override in globals.css (lines 151-160). Other sport colors (green, amber, red, etc.) all have overrides. Ice hockey badges may have poor contrast in dark mode.

**Impact on Wave 5**: 138 inline cards use `bg-white dark:bg-gray-800` with raw utility. When migrated to Card component, they will switch to `ds-card` mechanism. Both produce similar results but the transition must be verified.

## 12. UX Concerns (Design Team Audit)

These are user experience issues discovered during the design review that are NOT visual drift problems but affect the overall product quality. They do not belong in the remediation waves (which focus on DESIGN.md compliance) but must be tracked.

### 12.1 Discovery Feature Completeness Gap

The "inconsistent control language" across discovery pages is actually a **feature completeness disparity**:

| Page | Search | Sport filter | Date filter | Region filter | Level filter |
|------|--------|-------------|-------------|---------------|--------------|
| /matches | YES | YES (chips) | YES (advanced) | YES (advanced) | YES (advanced) |
| /lessons | YES | YES (chips) | NO | NO | NO |
| /marketplace | YES | YES (category chips) | NO | NO | NO |
| /mercenary | NO | YES (chips) | NO | NO | NO |
| /teams | NO | NO | NO | NO | NO |

A user who learns to filter by date on /matches expects the same on /lessons — and fails. This is a UX consistency problem, not a visual one.

### 12.2 Navigation Architecture

- **Teams/TeamMatches/Mercenary** share one bottom nav icon with no internal distinction
- **Chat** is not in the bottom nav — requires Profile → scroll → chat menu item (3+ taps)
- **Unread badge** on Profile tab merges chat + notification count — misleading
- **MobileGlassHeader** uses `@3xl:hidden` but desktop replacement (Sidebar) has minimal adoption

### 12.3 Onboarding-to-Home Disconnect

`/onboarding` collects sport preferences → stores in `localStorage`. But `/home/home-client.tsx` initializes sport filter to `'all'`, not from localStorage. Preferred sports from onboarding are never used. **Broken first-session promise.**

### 12.4 Loading/Skeleton Inconsistency

| Page | Loading pattern |
|------|----------------|
| /home (match section) | Inline `div.skeleton-shimmer` |
| /matches | `Card variant="subtle"` + internal shimmer |
| /lessons | Local `LessonCardSkeleton` component |
| /mercenary | Inline `div.animate-pulse` |

No canonical answer exists for "what does the skeleton look like for a discovery card vs. a detail page."

### 12.5 Typography Violations in Layout Components

| File | Line | Value | Nearest token | Impact |
|------|------|-------|--------------|--------|
| mobile-glass-header.tsx | 57 | `text-[17px]` | text-md (15px) or text-lg (16px) | 24 routes |
| mobile-page-top-zone.tsx | 43 | `text-[11px]` | text-xs (11px) — matches but bypasses token | 9 routes |
| mobile-page-top-zone.tsx | 49 | `text-[1.85rem]` (29.6px) | text-3xl (28px) — no exact match | 9 routes |
