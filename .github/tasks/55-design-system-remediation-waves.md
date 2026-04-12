# Task 55 — Design System Remediation Waves

> Active execution task. Implements the 6-wave remediation plan from `docs/DESIGN_SYSTEM_REFERENCE.md` Section 8. Rules source: `DESIGN.md`. Evidence source: `docs/DESIGN_SYSTEM_REFERENCE.md`.

Owner: frontend-ui-dev + frontend-review
Date drafted: 2026-04-12
Status: In Progress
Priority: P0

## Context

`docs/DESIGN_SYSTEM_REFERENCE.md` audit (2026-04-12) found overall design system compliance at ~55%. Key violations:
- Shadow compliance: 40% (shadow-lg 29x, shadow-xl 14x)
- Border compliance: 30% (border-2 in 20 files, 52 occurrences)
- Card reuse: 6% (138 inline vs 8 component)
- Glass compliance: 85% (image overlay badges violate)

## Goal

Execute waves 0-5 sequentially, bringing compliance from ~55% to >85%.

## Original Conditions

- [x] Task document created
- [x] Wave 0: Primitive defaults (card.tsx, button.tsx) — DONE 2026-04-12
- [x] Wave 1: Discovery family normalization (10 pages) — DONE 2026-04-12. backdrop-blur 8건 제거, CTA shadow 6건 제거, chip 정규화 3페이지, aria-pressed 추가
- [x] Wave 2: Public marketing shadow reduction (5 pages) — DONE 2026-04-12. shadow-lg/xl/blue 전량 제거, ring 기반 강조로 대체
- [x] Wave 3: Content glass cleanup — DONE 2026-04-12. Wave 1에서 8건, 추가로 badges/lessons-detail 2건 제거. 남은 2건은 admin 모달 backdrop(허용)
- [x] Wave 4: Form border-2 cleanup (20 files) — DONE 2026-04-12. 52→9건, 선택상태 ring+bg 패턴으로 교체. 잔여 9건은 스피너/대시존(허용)
- [x] Wave 5: Domain card extraction (7 components) — DONE 2026-04-12. MatchCard, TeamMatchCard, TeamCard, LessonCard, MarketplaceListingCard, MercenaryCard, VenueCard 추출 완료

## Wave Specifications

### Wave 0 — Primitive Defaults

**Files**: `apps/web/src/components/ui/card.tsx`, `apps/web/src/components/ui/button.tsx`

| Target | Current | Goal |
|--------|---------|------|
| Card.default shadow | `shadow-sm` | `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` |
| Card.surface shadow | `shadow-[0_16px_30px_rgba(15,23,42,0.05)]` | `shadow-[0_2px_8px_rgba(0,0,0,0.04)]` |
| Card.surface border/bg | `border-white/80 bg-white/92` | `border-gray-200 bg-white` |
| Button.primary shadow | `shadow-sm shadow-blue-500/20` | Remove shadow |
| Button focus ring | `ring-4 ring-blue-500/15` | `ring-2 ring-blue-500/40` |

**Validation**: `tsc --noEmit`, visual check on any 3 pages using Card/Button

### Wave 1 — Discovery Family Normalization

**Files**: home-client.tsx, matches-client.tsx, lessons/page.tsx, venues/page.tsx, teams/teams-client.tsx, marketplace/page.tsx, mercenary/page.tsx, team-matches/page.tsx, tournaments/page.tsx

**Goal**: Unify CTA/filter/chip/input grammar so same-type controls use same visual language

### Wave 2 — Public Marketing Shadow Reduction

**Files**: landing/page.tsx, pricing/page.tsx, guide/page.tsx, faq/page.tsx, about/page.tsx

**Goal**: Replace shadow-lg/xl with hierarchy through spacing and typography. Target: "clean persuasion" not "showcase polish"

### Wave 3 — Content Glass Cleanup

**Files**: matches-client.tsx:111-131, lessons/page.tsx:80-103

**Goal**: Replace backdrop-blur on image overlay badges with solid tint badges

### Wave 4 — Form Border Cleanup

**Files**: 20 files with border-2 (team-matches/new, team-matches/[id]/edit, matches/[id], mercenary/new, lessons/new, etc.)

**Goal**: Replace border-2 selected-state patterns with bg/icon/check grammar

### Wave 5 — Domain Card Extraction

**Components**: MatchCard, TeamMatchCard, LessonCard, MarketplaceListingCard, MercenaryCard, VenueCard, TournamentCard

**Goal**: Extract from inline markup, built on fixed Card primitive

## Validation Strategy

After each wave:
```bash
cd apps/web && npx tsc --noEmit
rg 'shadow-lg' apps/web/src --count-matches
rg 'shadow-xl' apps/web/src --count-matches
rg 'border-2' apps/web/src --count-matches
rg 'backdrop-blur' apps/web/src --count-matches
```

## Acceptance Criteria

- All 6 waves complete with tsc passing
- shadow-lg count reduced from 29 to <10
- shadow-xl count reduced from 14 to <5
- border-2 count reduced from 52 to <15
- backdrop-blur content violations: 0
- Card component adoption: >20 files (from 8)

## Risks & Dependencies

- Card.default shadow change affects 8 existing consumers — visual regression check needed
- Button focus ring change must maintain WCAG 2.1 AA focus visibility
- Wave 4 border-2 removal requires alternative selected-state affordance design before execution
- Wave 5 depends on Wave 0 completion (correct Card defaults)
