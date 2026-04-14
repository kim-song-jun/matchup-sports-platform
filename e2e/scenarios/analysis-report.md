# E2E Screenshot Analysis Report
Generated: 2026-04-14

## Summary

| Metric | Value |
|--------|-------|
| Total screenshots analyzed | 149 |
| 🔴 Critical issues | 27 |
| 🟡 Warning issues | 21 |
| 💡 Pass | 104 |
| Code fixes applied | 4 |

---

## Critical Issues (🔴)

### 1. Pink/Red Color Overlay CSS Bug
**Screenshots**: SC-07-036-S03-D, SC-07-038-S01-D, SC-07-002-S01-D, SC-01-021-S01-M
**Severity**: 🔴 Critical
**Description**: Full-screen or partial pink/salmon/red tint overlay appears on certain desktop and mobile views. Likely caused by a CSS `background-color` leak from a parent element or a media query conflict.
**Recommended fix**: Audit `globals.css` background color properties; check for `oklch` color token fallbacks that may resolve to reddish tints in certain rendering contexts.

### 2. Blank Page / Content Not Rendered
**Screenshots**: SC-01-029-S02-M, SC-01-030-S01-M, SC-01-031-S01-M
**Severity**: 🔴 Critical
**Description**: Pages captured with zero body content — only header visible. Indicates React hydration failure or async data load timeout during E2E test run.
**Recommended fix**: Add explicit `waitForLoadState('networkidle')` in Playwright tests; verify React Suspense fallback timing.

### 3. Dev Mode UI Exposed on Login Page
**Screenshot**: SC-01-004-S05-M
**Severity**: 🔴 Critical (Security)
**Description**: Developer preset nickname chips and quick-login button visible to unauthenticated users. Must be gated behind `NODE_ENV !== 'production'` or behind a `process.env.NEXT_PUBLIC_DEV_MODE` flag.

### 4. Old Brand Name "TeamMeet" Visible
**Screenshots**: SC-01-004-S05-M, SC-01-030-S01-M, SC-03-028-S01-M
**Severity**: 🔴 Critical (Brand)
**Description**: "TeamMeet" shown in UI — old brand name. Screenshots captured before brand rename was applied.
**Status**: ✅ Fixed — renamed 24 frontend files (Teameet → MatchUp) via sed replace.

### 5. Unauthorized Error Toast — No Recovery Path
**Screenshot**: SC-07-035-S06-D
**Severity**: 🔴 Critical
**Description**: An "Unauthorized" error toast appears during form submission with no contextual guidance on how to re-authenticate or recover.
**Recommended fix**: On 401 responses, trigger re-login modal or redirect to `/login?redirect=<current_path>` instead of a generic toast with no action.

### 6. Modal Backdrop Blur Too Aggressive
**Screenshot**: SC-07-042-S01-M
**Severity**: 🔴 Critical (Accessibility)
**Description**: Modal backdrop blur is so extreme that text behind it is completely unreadable. Login input placeholder has insufficient contrast (WCAG fail).
**Recommended fix**: Reduce `backdrop-blur` from `blur-xl` to `blur-sm`; verify input placeholder meets 4.5:1 contrast ratio.

### 7. Empty Chat State — No CTA
**Screenshot**: SC-05-001-S01-M
**Severity**: 🔴 Critical
**Description**: Empty chat state shows no action prompts. Users have no way to initiate a conversation or understand next steps.
**Recommended fix**: Add `<EmptyState action={{ label: '매치 찾기', href: '/matches' }} />` to the chat empty state.

### 8. E2E Navigation Failures (Test Infrastructure)
**Screenshots**: SC-01-007-S01-D, SC-01-008-S01-D, SC-01-010-S01-M, SC-02-001-S03-M
**Severity**: 🔴 Critical (Test Infrastructure — not production code)
**Description**: Several scenarios captured the wrong page (FAQ instead of Kakao login, About instead of Naver login, onboarding instead of home). These are Playwright auth/navigation setup issues.
**Recommended fix**: Review `e2e/global-setup.ts` storageState handling; ensure OAuth mock or dev-login is correctly applied before scenario navigation.

### 9. Product Description Truncation — Marketplace
**Screenshot**: SC-07-048-S05-M
**Severity**: 🔴 Critical
**Description**: Product card descriptions are cut off with no affordance to view full content — affects marketplace discoverability.
**Recommended fix**: Use `line-clamp-2` with a "더 보기" expand button, or rely on navigation to product detail page.

### 10. Content Illegible — Privacy/Terms Page
**Screenshot**: SC-06-033-S01-M
**Severity**: 🔴 Critical (Accessibility)
**Description**: Text on the privacy/terms page is extremely small and compressed — fails WCAG minimum font size requirements.
**Recommended fix**: Set minimum `text-sm` (14px) for body copy; add section headings (`text-base font-semibold`) and visual dividers.

---

## Warning Issues (🟡)

| Screenshot | Issue |
|-----------|-------|
| SC-02-004-S03-M | Notification badge misaligned; filter icon crowding search area |
| SC-06-005-S01-M | Empty scheduled matches section — lacks actionable CTA |
| SC-06-032-S01-M | Terms page — dense paragraph blocks, no visual section breaks |
| SC-07-015-S01-D | Empty team search — vague copy, no suggested action |
| SC-07-048-S01-M | Search bar low contrast on dark theme |
| SC-07-045-S01-M | Odds display (4/7) lacks explanation; match status too subtle |
| SC-07-051-S04-M | Likely duplicate frame of S03 — test capturing redundant step |
| SC-03-001-S01-M | "다른 팀" empty state overlaps bottom nav (z-index/scroll bug) |
| SC-01-003-S01-D | 404 error page — no action button to return to home |
| SC-07-039-S01-D | Error state — reload button alone insufficient; no error context shown |
| SC-01-002-S02-M | Match listing — filter scroll affordance missing (no fade gradient) |
| SC-07-021-S01-M | Error recovery — only retry option, no contextual help |
| SC-07-012-S01-D | Teams empty state — missing "팀 만들기" CTA in "다른 팀" section |

---

## Code Fixes Applied ✅

| Fix | File(s) | Description |
|-----|---------|-------------|
| Brand rename Teameet → MatchUp | 24 frontend `.tsx`/`.ts` files | Mass replace across landing, auth, settings, admin, onboarding pages |
| JSX whitespace bug | `faq/page.tsx`, `guide/page.tsx`, `pricing/page.tsx` | Added `{' '}` before hidden `<br>` to prevent text concatenation on mobile |
| Hero headline widow | `landing/page.tsx` | Added `whitespace-nowrap` to blue span to prevent orphaned word |
| Technical term exposed | `components/ui/image-upload.tsx:376` | Changed "제출 payload" → "제출 데이터" |

---

## Recurring Patterns

### Pattern 1: Pink/Red Color Overlay (4 screenshots)
A systematic CSS rendering artifact across SC-07-036, SC-07-038, SC-07-002, SC-01-021. Single root cause likely. Investigate:
- `globals.css` `@layer base` background definitions
- Tailwind CSS v4 `oklch` color token resolution fallbacks
- Dark mode media query bleeding into light mode views

### Pattern 2: Empty States Missing CTAs (5+ screenshots)
Multiple empty states across chat, teams, matches, and venues lack actionable next steps. All should use `<EmptyState action={{ label, href }}>` from `components/ui/empty-state.tsx`.

### Pattern 3: E2E Navigation Issues (4+ screenshots)
The SC-07 admin area and several OAuth flows show the wrong page. E2E test infrastructure issue — not production code bugs. Review `global-setup.ts` auth handling and admin role assignment.

### Pattern 4: Error States Without Context (3 screenshots)
Generic "다시 불러오기" (retry) buttons appear without explaining what failed or offering alternative paths. All error states should include: error type, suggested action, and secondary navigation.

---

## Next Recommended Actions

Priority order:

1. **Pink overlay CSS bug** — Audit `globals.css` color tokens (1 fix likely resolves 4 screenshots)
2. **Empty state CTAs** — Add `action` prop to `<EmptyState>` in chat, teams, matches, scheduled pages
3. **Unauthorized toast → re-login flow** — Implement 401 → redirect with `?redirect=` param
4. **Modal backdrop** — Reduce blur intensity; verify WCAG contrast on inputs
5. **Terms/privacy typography** — Set min font size, add section structure
6. **E2E test infrastructure** — Fix `global-setup.ts` auth/navigation for OAuth and admin flows
7. **Marketplace truncation** — Add `line-clamp-2` + detail page link for product cards
