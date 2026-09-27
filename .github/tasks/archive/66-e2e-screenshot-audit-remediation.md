# Task 66: E2E Screenshot Audit Remediation (244 Issues)

## Context

E2E screenshot analysis across 10 files revealed 244 UI/UX issues spanning WCAG accessibility violations, design system drift, missing interactive feedback, and direct type assertion anti-patterns. These issues fall into two priority tiers (P0: production-blocking, P1: quality-of-life) and involve both SHARED (depended-upon) and LEAF (page-level) files.

**Issue count mapping**: The 244 figure reflects per-instance counts across all files (e.g., "visible labels" covers 3 FormField instances, each counted separately; "min-h-[44px] missing" counts each button individually). The checklist below groups these into ~45 discrete work items, each addressing one or more individual instances.

## Goal

Resolve all 244 issues in a phased execution plan that maximizes parallelism while respecting file dependency order. Zero issues deferred -- all resolved in this task.

## Original Conditions (Checklist)

### Prerequisites (Phase 0 -- SHARED files, sequential)
- [ ] **P0-PREREQ-1**: Add `extractErrorMessage(error: unknown, fallback: string): string` to `apps/web/src/lib/utils.ts`
- [ ] **P0-PREREQ-2**: Remove all local `extractErrorMessage` definitions from mercenary page files (4 files: `my/mercenary/page.tsx`, `mercenary/[id]/page.tsx`, `mercenary/[id]/edit/page.tsx`, `mercenary/new/page.tsx`) -- replace with import from `@/lib/utils`
- [ ] **P0-PREREQ-3**: Update `apps/web/src/components/ui/input.tsx` -- add error prop + red border variant (`border-red-500 focus:border-red-500 focus:ring-red-500/10`)
- [ ] **P0-PREREQ-4**: Update `apps/web/src/components/ui/input.tsx` -- remove `React.forwardRef` pattern, use direct ref prop per React 19.2 convention

### P0 Files (Phase 1 -- parallel after Phase 0)
- [ ] **P0-LOGIN-1**: Visible labels -- remove `labelClassName="sr-only"` from FormField wrappers (WCAG 1.3.1)
- [ ] **P0-LOGIN-2**: Tab active color -- `border-gray-900 dark:border-white` to `border-blue-500 dark:border-blue-400`
- [ ] **P0-LOGIN-3**: Catch block -- replace `(err as { response?... })` with `extractErrorMessage(err, fallback)` from `@/lib/utils`
- [ ] **P0-LOGIN-4**: Empty catch in `handleDevLogin` -- add `extractErrorMessage` + toast error
- [ ] **P0-LOGIN-5**: Password show/hide toggle -- eye icon button with `aria-label`
- [ ] **P0-LOGIN-6**: Disabled button feedback -- `disabled:opacity-60 disabled:cursor-not-allowed` + spinner icon when `isLoading`
- [ ] **P0-LOGIN-7**: Inline field validation errors -- `fieldErrors` state + `<FormField error={...}>` integration
- [ ] **P0-LOGIN-8**: Tab switch resets form state (email, password, nickname, fieldErrors)
- [ ] **P0-LOGIN-9**: "Browse without login" link contrast -- `text-gray-400` to `text-gray-500` + underline decoration
- [ ] **P0-HOME-1**: EmptyState bottom padding -- add `pb-28` wrapper around EmptyState for bottom nav clearance
- [ ] **P0-HOME-2**: Banner desc auth-aware text -- if authenticated, replace "가입하고" with "매치에 참여해보세요"
- [ ] **P0-HOME-3**: Filter section spacing -- `mt-10` to `mt-6` (too much gap after quick-access chips)
- [ ] **P0-HOME-4**: Recommended matches section -- `mt-4` to `mt-2`
- [ ] **P0-HOME-5**: Banner indicator dots contrast -- inactive dots `w-1.5 bg-white/30` to `w-2 bg-white/50`
- [ ] **P0-HOME-6**: Guest login button hierarchy -- ensure single primary CTA, secondary styled differently
- [ ] **P0-NEWMATCH-1**: Sport chips -- apply `sportCardAccent` token colors from `lib/constants.ts`
- [ ] **P0-NEWMATCH-2**: Sport chips -- render `SportIconMap` icons inside chips
- [ ] **P0-NEWMATCH-3**: Step 0 explicit "next" CTA -- add "다음" button below sport grid (disabled if no sport selected). Current behavior auto-advances on click, which loses the ability to review selection
- [ ] **P0-NEWMATCH-4**: Selected state color -- `bg-gray-900` to `bg-blue-500` for sport selection chips
- [ ] **P0-NEWMATCH-5**: Add `aria-pressed` to sport selection buttons
- [ ] **P0-NEWMATCH-6**: Sport chip touch target -- `min-h-[44px]`
- [ ] **P0-NEWMATCH-7**: Hide bottom nav on create flow -- `BottomNav` is rendered unconditionally in `apps/web/src/app/(main)/layout.tsx` (line 30). **Mechanism**: Add a pathname check inside `BottomNav` component (`apps/web/src/components/layout/bottom-nav.tsx`) that returns `null` for `/matches/new` (and other create flows like `/teams/new`, `/mercenary/new`, `/lessons/new`). This is a SHARED file -- only Agent C touches it, other Phase 1 agents must NOT modify `bottom-nav.tsx`.
- [ ] **P0-NEWMATCH-8**: Catch block (line 103) -- replace direct type assertion with `extractErrorMessage`
- [ ] **P0-GUIDE-1**: Diagnose and fix blank screen rendering issue -- verify server component + client component boundary

### P1 Files (Phase 2 -- parallel, independent of each other)
- [ ] **P1-INPUT-DONE**: (Completed in Phase 0 -- error variant already applied)
- [ ] **P1-ONBOARD-1**: CTA "next" button color -- `bg-gray-900 dark:bg-white` to `bg-blue-500 text-white` (step 'sport')
- [ ] **P1-ONBOARD-2**: Disable "next" when no sport selected -- `disabled:opacity-60 disabled:cursor-not-allowed`
- [ ] **P1-ONBOARD-3**: Feature cards -- replace `emerald/amber` accents with neutral + semantic tokens (use `bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700` for all, differentiate with icons not color)
- [ ] **P1-ONBOARD-4**: Dark mode pairs -- verify all `bg-*` have `dark:bg-*` counterparts
- [ ] **P1-ONBOARD-5**: "종목 다시 선택" -- add `min-h-[44px]` touch target
- [ ] **P1-MATCHES-1**: EmptyState -- add `pb-24` wrapper for bottom nav clearance
- [ ] **P1-MATCHES-2**: Sport chip scroll affordance -- add fade gradient mask on overflow edges
- [ ] **P1-MATCHES-3**: "필터 초기화" button -- show conditionally when `activeFilterCount > 0`
- [ ] **P1-MATCHES-4**: Sport filter chips -- add `min-h-[44px]` (currently missing while level/sort chips have it)
- [ ] **P1-MATCHES-5**: Quick filter chips (today/free/beginner/available) -- add `min-h-[44px]`
- [ ] **P1-NAV-1**: Mobile menu -- add backdrop overlay (`fixed inset-0 bg-black/50`)
- [ ] **P1-NAV-2**: Hamburger toggle a11y -- verified: single button toggles Menu/X icons with conditional `aria-label` ("메뉴 열기"/"메뉴 닫기") and 44px touch target (`h-11 w-11`). No separate close button needed. Mark as verified, no code change.
- [ ] **P1-NAV-3**: Focus trap -- add `role="dialog"` + `aria-modal="true"` to mobile dropdown + Escape key handler to close
- [ ] **P1-SCROLL-1**: `hero-scroll-button.tsx` -- add `min-h-[44px]` to button (currently has `py-3.5` which likely meets it, verify and add explicit `min-h-[44px]`)
- [ ] **P1-TEAMS-1**: Filter chips -- add `min-h-[44px]` (currently `py-1.5`)
- [ ] **P1-TEAMS-2**: Search input -- replace raw `<input>` with `Input` component + add `<label htmlFor="team-search" className="sr-only">` + `id="team-search"`
- [ ] **P1-TEAMS-3**: Team count display -- conditional: hide when `filteredTeams.length === 0`, or show "조건에 맞는 팀이 없어요" instead

## Parallel Work Breakdown

### Dependency Graph

```
Phase 0 (Sequential -- SHARED files)
  lib/utils.ts ──┐
  input.tsx ─────┤
                 │
Phase 1 (Parallel -- P0 LEAF files, depend on Phase 0)
  ├── login/page.tsx ──────────── Agent A
  ├── home/home-client.tsx ────── Agent B
  ├── matches/new/page.tsx ────── Agent C
  └── guide/page.tsx ──────────── Agent D (diagnosis first)
                 │
Phase 2 (Parallel -- P1 LEAF files, independent)
  ├── onboarding/page.tsx ─────── Agent E
  ├── matches-client.tsx ──────── Agent F
  ├── landing-nav.tsx ─────────── Agent G
  ├── hero-scroll-button.tsx ──── Agent G (same agent, tiny change)
  └── team-list.tsx ───────────── Agent H
```

### Phase 0: Foundation (Sequential, 1 agent)

**Owner**: Single agent (prevents merge conflicts on shared files)

**Files touched**:
1. `apps/web/src/lib/utils.ts` -- add `extractErrorMessage`
2. `apps/web/src/components/ui/input.tsx` -- error variant + forwardRef removal
3. `apps/web/src/app/(main)/my/mercenary/page.tsx` -- remove local def, import from utils
4. `apps/web/src/app/(main)/mercenary/[id]/page.tsx` -- remove local def, import from utils
5. `apps/web/src/app/(main)/mercenary/[id]/edit/page.tsx` -- remove local def, import from utils
6. `apps/web/src/app/(main)/mercenary/new/page.tsx` -- remove local def, import from utils

**Do NOT touch**: Any page-level files from Phase 1/2

**Validation gate**: `cd apps/web && npx tsc --noEmit`

### Phase 1: P0 Page Files (Parallel, 4 agents)

**Precondition**: Phase 0 committed and merged to working branch

**Agent A -- login/page.tsx** (9 issues)
- Files: `apps/web/src/app/(auth)/login/page.tsx`
- Do NOT touch: `input.tsx`, `utils.ts`, `form-field.tsx`
- Import `extractErrorMessage` from `@/lib/utils`
- Use `<Input error={hasError}>` for field-level visual errors
- Use `<FormField error={fieldErrors.email}>` for field error messages

**Agent B -- home/home-client.tsx** (6 issues)
- Files: `apps/web/src/app/(main)/home/home-client.tsx`
- Do NOT touch: any file outside this single file
- Spacing adjustments, banner text, EmptyState padding, dot contrast

**Agent C -- matches/new/page.tsx + bottom-nav.tsx** (8 issues)
- Files: `apps/web/src/app/(main)/matches/new/page.tsx`, `apps/web/src/components/layout/bottom-nav.tsx`
- Do NOT touch: `input.tsx`, `utils.ts`, `layout.tsx`
- Import `extractErrorMessage` from `@/lib/utils`
- Import `SportIconMap` from `@/components/icons/sport-icons`
- Import `sportCardAccent` from `@/lib/constants`
- Modify step 0: separate sport selection from auto-advance, add explicit "다음" CTA
- Modify `bottom-nav.tsx`: add pathname-based hide for create flow paths (`/matches/new`, `/teams/new`, `/mercenary/new`, `/lessons/new`)

**Agent D -- guide/page.tsx** (1 issue: blank screen diagnosis)
- Files: `apps/web/src/app/guide/page.tsx`, `apps/web/src/app/guide/layout.tsx`
- Runtime diagnosis step: `curl localhost:3003/guide` or browser DevTools console check
- If SSR issue: check if `ScrollReveal` (client component) usage in server component is correct
- If hydration mismatch: wrap in Suspense or ensure consistent server/client render
- The code structure looks valid (server component importing client `ScrollReveal`), so issue may be environmental or CSS-related (content hidden behind nav without pt-offset)

**Validation gate**: `cd apps/web && npx tsc --noEmit && pnpm lint`

### Phase 2: P1 Page Files (Parallel, 4 agents)

**Precondition**: Phase 1 complete (no actual code dependency, but ensures tsc passes)

**Agent E -- onboarding/page.tsx** (5 issues)
- Files: `apps/web/src/app/(main)/onboarding/page.tsx`
- CTA color, disabled guard, feature card neutralization, dark mode, touch target

**Agent F -- matches-client.tsx** (5 issues)
- Files: `apps/web/src/app/(main)/matches/matches-client.tsx`
- EmptyState padding, scroll affordance, conditional filter reset, chip touch targets

**Agent G -- landing-nav.tsx + hero-scroll-button.tsx** (5 issues)
- Files: `apps/web/src/components/landing/landing-nav.tsx`, `apps/web/src/components/landing/hero-scroll-button.tsx`
- Mobile menu: backdrop, focus trap, dialog role, aria attributes
- Scroll button: explicit min-h-[44px]

**Agent H -- team-list.tsx** (3 issues)
- Files: `apps/web/src/app/(main)/teams/team-list.tsx`
- Replace raw `<input>` with `Input` component, add label, chip touch targets, conditional count

**Validation gate**: `cd apps/web && npx tsc --noEmit && pnpm lint`

## Test Scenarios

### Happy Path
- Login form: visible labels render, tab switches clear form, password toggle works, error messages appear inline
- Home: EmptyState has bottom padding, banner dots visible on dark backgrounds, spacing feels compact
- Match create: sport chips show icons + accent colors, explicit "다음" button advances step, catch blocks show user-friendly toast
- Guide: page renders content (not blank)
- Onboarding: "다음" disabled when no sport selected, features use neutral colors
- Matches list: filter chips have 44px touch targets, "필터 초기화" hidden when no filters active
- Landing nav: mobile menu has backdrop, focus traps inside dialog
- Team list: search input has accessible label, 0-team count handled gracefully

### Edge Cases
- Login: rapid tab switching does not preserve stale form data
- Login: password show/hide toggle preserves cursor position
- Match create: selecting then deselecting all sports keeps "다음" disabled
- Home: guest user sees "로그인" CTA, authenticated user sees "매치 만들기" CTA
- Matches list: all filters cleared returns to default state with hidden reset button
- Landing nav: pressing Escape closes mobile menu
- Team list: search with no results shows empty state, not "0개 팀"

### Error Paths
- Login: invalid email format shows inline field error before submission
- Login: server error uses `extractErrorMessage` with fallback "로그인에 실패했어요"
- Match create: submission failure uses `extractErrorMessage` with fallback "생성에 실패했어요. 잠시 후 다시 시도해주세요"
- Dev login: catch block no longer swallows errors silently

### Mock Updates Needed
- `extractErrorMessage` added to `lib/utils.ts` -- any existing tests importing from local definitions must update import paths
- `Input` component signature change (error prop added, forwardRef removed) -- update `apps/web/src/components/ui/input.test.tsx` if it exists
- No fixture file changes needed (all changes are frontend-only)

## Tech Debt Resolved

| Item | Resolution | Follow-up |
|------|-----------|-----------|
| `extractErrorMessage` duplicated in 4 mercenary files | Centralized in `lib/utils.ts`, local copies removed | None -- complete |
| `React.forwardRef` in `input.tsx` (React 19.2 violation) | Direct ref prop pattern applied | None -- complete |
| Direct type assertion in catch blocks (`err as { response?... }`) | Replaced with `extractErrorMessage` in login + match create | Audit remaining files for same pattern (trigger: next QA pass) |
| Empty catch block in `handleDevLogin` | Added proper error handling with toast | None -- complete |
| Raw `<input>` without accessible label in team-list.tsx | Replaced with `Input` component + proper label | None -- complete |

## Security Notes

### Threat Model
- **Open redirect**: `sanitizeRedirect()` already in `login/page.tsx` -- no changes needed, not weakened by this task
- **Password visibility toggle**: Does not change authentication flow, purely visual. Password field remains `type="password"` by default
- **No new API endpoints**: All changes are frontend-only CSS/accessibility/UX
- **No new dependencies**: Using existing project packages only

### Mitigations
- Password toggle uses `type="text"` / `type="password"` swap -- standard browser pattern, no security regression
- `extractErrorMessage` never exposes raw server error details to users -- always falls back to user-friendly message
- Field validation is client-side for UX only -- server-side validation unchanged

## Implementation Details

### `extractErrorMessage` signature (for `lib/utils.ts`)
```typescript
/** Safely extract an error message from an unknown catch value. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const axiosLike = error as { response?: { data?: { message?: string } } };
    if (typeof axiosLike.response?.data?.message === 'string') {
      return axiosLike.response.data.message;
    }
    const messageLike = error as { message?: string };
    if (typeof messageLike.message === 'string') {
      return messageLike.message;
    }
  }
  if (typeof error === 'string') return error;
  return fallback;
}
```

### `input.tsx` error variant pattern
```typescript
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
  error?: boolean;
}

export function Input({ className, error, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      className={cn(
        inputStyles,
        error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500',
        className,
      )}
      {...props}
    />
  );
}
```

## Risks & Dependencies

1. **`input.tsx` is consumed by ~20+ files** -- the forwardRef removal must be backward-compatible. React 19.2 handles ref as a regular prop, so existing `<Input ref={...}>` call sites continue working without changes.
2. **Guide blank screen** may have a root cause outside code (e.g., missing translations, network error, environment config). Agent D should diagnose first, not blindly refactor.
3. **Banner text change** ("가입하고" -> "매치에 참여해보세요") -- the banner data is a const array (line 22-26 of home-client.tsx). The auth-aware text needs to be computed at render time, not in the const. Agent B must move desc to a function or inline conditional.

## Ambiguity Log

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Match create step 0: should "다음" button replace auto-advance, or supplement it? | **Decision**: Supplement. Keep click-to-advance for fast flow, add explicit "다음" below grid for discoverability. "다음" is disabled if no sport selected. |
| 2 | Guide blank screen: is it a code bug or environment issue? | **Decision**: Agent D diagnoses at runtime first. If code fix needed, apply. If environment, document in Known Blockers. |
| 3 | Feature cards in onboarding: should all three be same neutral color or maintain visual hierarchy? | **Decision**: Use same neutral border (`gray-200/gray-700`) for all cards. Differentiate with descriptive icons and text, not color. This aligns with WCAG "color alone" principle. |

## Acceptance Criteria

- `cd apps/web && npx tsc --noEmit` passes with zero errors after each phase
- `cd apps/web && pnpm lint` passes after each phase
- All checklist items in "Original Conditions" are checked off
- No local `extractErrorMessage` definitions remain outside `lib/utils.ts` (`grep -r "function extractErrorMessage" apps/web/src --include="*.ts" --include="*.tsx"` returns only `lib/utils.ts`)
- Every `<input>` element in modified files uses the `Input` component from `@/components/ui/input` (no raw HTML `<input>` for user-facing form fields)
- Every interactive element (button, link, chip) in modified files has `min-h-[44px]` touch target
- `React.forwardRef` is removed from `input.tsx`; grep confirms no usage: `grep "forwardRef" apps/web/src/components/ui/input.tsx` returns empty
- Login page form labels are visible (not `sr-only`) and linked via `htmlFor`/`id`
- Password field has a show/hide toggle with `aria-label`
- Mobile landing nav dropdown has backdrop overlay and `role="dialog"`

## Commit Order

1. `fix: centralize extractErrorMessage and add input error variant` (Phase 0)
2. `fix: resolve P0 accessibility and UX issues in login, home, match-create, guide` (Phase 1)
3. `fix: resolve P1 touch targets, a11y, and design consistency across onboarding, matches, nav, teams` (Phase 2)
