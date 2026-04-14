# E2E Screenshot Analysis Report

> Date: 2026-04-14
> Screenshots analyzed: 18 | Skipped: 3 (duplicates) | Unmatched: 9
> Agents: design-main, qa-uiux, ui-manager, ux-manager (4 per screenshot)
> Total agent executions: ~72

## Summary

| Category | Count |
|----------|-------|
| **Total Issues** | **157** |
| - 🔴 Critical | 44 |
| - 🟡 Warning | 67 |
| - 💡 Info | 46 |
| **UX Improvements** | 50 |
| **Weak Spots** | 30 |
| **Code Fix Proposals** | 30 |

## Analyzed Screenshots (18)

| SC-ID | Page | Description | Verdict |
|-------|------|-------------|---------|
| SC-01-001-S01-M | / (teams) | Root redirect — wrong page captured | ❌ FAIL |
| SC-01-001-S02-M | /landing | Landing page initial render | ❌ FAIL |
| SC-01-002-S02-M | /home | Auth redirect to home | ❌ FAIL |
| SC-01-003-S01-M | /login | Login page initial render | ❌ FAIL |
| SC-01-004-S02-M | /login | Register tab active | ❌ FAIL |
| SC-01-005-S03-M | /login | Password entered | ❌ FAIL |
| SC-01-005-S04-M | /login | Submitting (no visual feedback) | ❌ FAIL |
| SC-01-005-S05-M | /home | Post-login home | ❌ FAIL |
| SC-01-007-S02-M | /login | Validation error (no error shown) | ❌ FAIL |
| SC-01-011-S02-M | /home | Guest mode home | ❌ FAIL |
| SC-01-018-S01-M | /onboarding | Step 1: Sport selection | ❌ FAIL |
| SC-01-019-S02-M | /onboarding | Sport toggle selected | ❌ FAIL |
| SC-01-019-S04-M | /onboarding | All deselected (no disabled guard) | ❌ FAIL |
| SC-01-020-S01-M | /onboarding | Step 2: Features | ❌ FAIL |
| SC-01-021-S01-M | /home | Post-onboarding home | ❌ FAIL |
| SC-01-027-S01-M | /landing | Landing + LandingNav | ❌ FAIL |
| SC-01-028-S02-M | /landing | Hamburger menu open | ❌ FAIL |
| SC-01-029-S02-M | /guide | Empty page — render failure | ❌ FAIL |

## Critical Issues — Priority P0

### 1. Dev mode panel exposed in production UI (8+ screenshots)
- **Files**: `apps/web/src/app/(auth)/login/page.tsx`
- **Fix**: Gate behind `NEXT_PUBLIC_SHOW_DEV_LOGIN` or strict `NODE_ENV === 'development'`

### 2. Login form: placeholder-only labels (WCAG 1.3.1 violation)
- **Files**: `apps/web/src/app/(auth)/login/page.tsx` L216, 226, 237
- **Fix**: Remove `labelClassName="sr-only"`, show visible labels above inputs

### 3. Active tab underline black instead of blue-500
- **Files**: `apps/web/src/app/(auth)/login/page.tsx` L207
- **Fix**: `border-gray-900` → `border-blue-500 dark:border-blue-400`

### 4. No inline validation errors on login form
- **Files**: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/components/ui/input.tsx`
- **Fix**: Add `error` prop to Input component + `fieldErrors` state management

### 5. EmptyState overlaps bottom navigation (3+ screenshots)
- **Files**: `apps/web/src/app/(main)/home/home-client.tsx`
- **Fix**: Add `pb-28` wrapper around EmptyState sections

### 6. Login button disabled state has no visual feedback
- **Files**: `apps/web/src/app/(auth)/login/page.tsx`
- **Fix**: `disabled:opacity-60 disabled:cursor-not-allowed` + loading spinner

### 7. /guide page render failure — blank screen
- **Files**: `apps/web/src/app/guide/page.tsx`, `apps/web/src/app/guide/layout.tsx`
- **Fix**: Diagnose SSR/hydration failure

### 8. Hamburger menu missing focus trap + overlay
- **Files**: `apps/web/src/components/landing/landing-nav.tsx`
- **Fix**: Add `role="dialog"` + `aria-modal="true"` + backdrop overlay

### 9. Onboarding: zero-sport disabled guard missing
- **Files**: `apps/web/src/app/(main)/onboarding/page.tsx`
- **Fix**: Disable "Next" button when no sport selected

### 10. `extractErrorMessage()` not used in catch block
- **Files**: `apps/web/src/app/(auth)/login/page.tsx` L158-160
- **Fix**: Replace direct type assertion with project utility

## Repeated Patterns

| # | Pattern | Occurrences | Files |
|---|---------|-------------|-------|
| 1 | Dev mode panel visible | 8+ screenshots | login/page.tsx |
| 2 | Tab underline black not blue-500 | 5+ screenshots | login/page.tsx |
| 3 | Placeholder-only labels | 5+ screenshots | login/page.tsx |
| 4 | Bottom nav content overlap | 4+ screenshots | home-client.tsx, EmptyState |
| 5 | Pink/salmon background tint | 3+ screenshots | Root layout |
| 6 | Next.js "N" dev badge | 3+ screenshots | Dev overlay |
| 7 | Dark banner hardcoded color | 3+ screenshots | home-client.tsx |
| 8 | Sport filter no scroll affordance | 2+ screenshots | team-list.tsx, home-client.tsx |

## Pages Covered

| Area | Pages | Screenshots | Issues |
|------|-------|-------------|--------|
| Auth (Login/Register) | /login | 6 | 34 |
| Home | /home | 4 | 28 |
| Onboarding | /onboarding | 4 | 21 |
| Landing | /landing | 3 | 16 |
| Guide | /guide | 1 | 6 |
| Root Redirect | / | 1 | 8 |

## Files Requiring Changes (Priority)

| File | Issues | Priority |
|------|--------|----------|
| `apps/web/src/app/(auth)/login/page.tsx` | 20+ (labels, tab, catch, dev panel, password, disabled) | P0 |
| `apps/web/src/app/(main)/home/home-client.tsx` | 15+ (EmptyState, banner, filters, spacing, CTA) | P0 |
| `apps/web/src/app/(main)/onboarding/page.tsx` | 12+ (CTA color, disabled guard, color tokens, animation) | P1 |
| `apps/web/src/components/landing/landing-nav.tsx` | 8+ (menu focus trap, overlay, CTA hierarchy) | P1 |
| `apps/web/src/components/ui/input.tsx` | 3 (error prop, focus ring) | P1 |
| `apps/web/src/app/guide/page.tsx` | 6 (render failure) | P0 |
| `apps/web/src/app/landing/page.tsx` | 5 (hero padding, subtitle, CTA width) | P2 |
| `apps/web/src/app/(main)/teams/team-list.tsx` | 3 (filter chip, search label) | P2 |

## Output Files

| File | Content | Entries |
|------|---------|--------|
| `e2e/scenarios/issues.log` | Design/QA/UI issues with severity | 157 |
| `e2e/scenarios/ux-improvements.log` | UX improvement suggestions | 50 |
| `e2e/scenarios/weak-spots.log` | Structural weak spots | 30 |
| `e2e/scenarios/code-fixes.log` | Copy-paste-ready code fix proposals | 30 |
| `e2e/scenarios/queue/unmatched-results.log` | Unmatched screenshot analyses | 1 |
| `e2e/scenarios/queue/unmatched.log` | Unmatched file IDs | 9 |
| `e2e/scenarios/queue/skipped.log` | Skipped duplicate IDs | 3 |
