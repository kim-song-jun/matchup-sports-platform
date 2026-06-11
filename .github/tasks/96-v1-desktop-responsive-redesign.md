# Task 96 — v1 Desktop Version + Responsive Admin (Toss-style)

> Orchestrated via `/agent-all` on branch `feat/v1-admin-redesign-toss` (merged
> `origin/main` @ ef2bc4f3). Multi-wave parallel agent build.

## Context

The active v1 frontend (`apps/v1_web`) is **hard-pinned to a mobile column**: the
live consumer shell `AppChrome` (`components/v1-ui/shell.tsx`) renders
`.tm-app-frame { width: min(100%, 480px); margin: 0 auto }`. On desktop the entire
user-facing app is a 480px strip centered in empty space. All chrome
(`.tm-topbar`, `.tm-scroll-area`, `.tm-bottom-nav`, `.tm-fixed-cta`,
`.tm-filter-layer`, `.tm-floating-fab`) is absolutely positioned against that 480px
frame. Styling is **semantic CSS** (`.tm-*` in `apps/v1_web/src/app/globals.css`,
~3800 lines), not utility-first.

The **admin** area is a separate styling system: `AdminShell`
(`components/admin/admin-shell.tsx`) uses **Tailwind utilities** and already has a
`md:` desktop sidebar + mobile tab-strip. It needs polish + verified mobile, not a
ground-up build.

Dead code noted (out of scope, flag only): `components/domain/v1-pages.tsx`,
`v1-flow-pages.tsx`, `v1-support-pages.tsx` + the `.v1-*` shell classes — imported
by no route.

### Live render path (consumer)
`app/<route>/page.tsx` → `<Domain>Client` (`*-client.tsx`, data/react-query) →
`*-page.tsx` (renders `<AppChrome>`) → `.tm-*` classes.

## Goal

Make `apps/v1_web` a **real, usable desktop site across all ~90 routes** while
**keeping the polished mobile experience intact**, and make **admin fully
responsive on both desktop and mobile**. Follow the existing Toss-style design
system (blue `#3182f6`, `.tm-text-*` scale, `.tm-card`, grey ramp). Light mode only
(v1 has no dark mode). Verify with seeded backend mock data.

## Original Conditions (must all stay alive through design → build → verify)

- [ ] Pull `origin/main` and merge into the working branch. **(DONE — merge commit `911036b3`.)**
- [ ] Desktop version of the **user-facing** app (currently mobile-pinned).
- [ ] Admin works on **both desktop and mobile**.
- [ ] Follow the design system (tokens, type scale, components) — no hardcoded
      colors/spacing; reuse `.tm-*` and admin Tailwind tokens.
- [ ] Production-quality "real usable site" — not stubs or broken stretches.
- [ ] Verify with **mock data** via **backend + seed** (user choice), live in browser.
- [ ] **All ~90 pages** get bespoke desktop layouts (user choice: full coverage).

## Decisions (locked)

1. **Desktop scope** = full coverage of all pages (user). Executed in priority waves;
   every wave is independently shippable (pathspec commits on the current branch).
2. **Mock verification** = backend + Postgres seed (user). Stack stood up at the
   verify phase; per-wave gate = `tsc --noEmit` + vitest + build.
3. **Consumer desktop nav** = persistent **top navigation bar** (brand + 5 tabs +
   search/notifications/profile) with **centered max-width content**; per-page
   multi-column layouts within that width. Admin keeps its **left sidebar**
   (operational tool ≠ consumer app — clear visual distinction, Toss-like).
   `ui-manager`/`ux-manager` may refine in the gate.
4. **Breakpoints**: mobile `<768`, tablet `768–1023`, desktop `≥1024`, wide `≥1440`.
   Content max-width ~`1120px` (lists/detail), with two-pane master-detail where it
   helps. Mobile (`<768`) behavior is **unchanged**.
5. **CSS architecture for parallel safety**: the single shared `globals.css` cannot
   be edited by many agents at once. Foundation introduces a **desktop layer
   convention** — desktop `@media (min-width:1024px)` overrides live in **per-domain
   files** under `apps/v1_web/src/app/desktop/<domain>.css`, each imported once.
   Domain agents own their own file → zero merge conflict. Foundation owns the frame
   un-pin + shell chrome responsiveness in `globals.css` + the import wiring.
6. **Git**: stay on `feat/v1-admin-redesign-toss` (no new branch — shared-worktree
   rule). Commit only task-owned pathspecs; verify each with `git show --stat`.

## User Scenarios

- A user opens the site on a 1440px laptop → sees a proper desktop app: top nav,
  comfortably-wide content with multiple columns, no centered phone strip.
- The same user on a 390px phone → unchanged polished mobile app (bottom nav).
- An operator opens `/admin` on desktop → sidebar + dense tables/KPIs; on mobile →
  tab-strip + stacked cards, fully usable.
- Tablet (820px) → graceful single/two-column layout, no broken chrome.

## Test Scenarios

- **happy**: every top-level route renders without overflow/clipping at 390 / 820 /
  1280 / 1440; nav switches mode at the 768/1024 boundaries; admin tables scroll or
  reflow on mobile.
- **edge**: fixed CTAs, filter sheets, floating FAB re-scope to the content column on
  desktop (not stuck at 480px or full-bleed); long Korean strings wrap.
- **error/empty**: empty + error states fill desktop width gracefully (no tiny
  centered card in a huge canvas).
- **mock updates**: seed/fixtures enriched enough that desktop multi-column lists look
  populated (≥8–12 cards per primary list).

## Parallel Work Breakdown

**Wave 0 — Foundation (sequential, keystone, single implementer + design gate):**
`globals.css` frame un-pin + responsive `AppChrome` (top-nav desktop) + re-scope all
absolutely-positioned chrome to the content column + desktop CSS layer scaffold
(`app/desktop/_tokens.css` + import wiring). Verify build + spot-render before fan-out.

**Waves 1–2 — Per-domain desktop layouts (parallel, one `frontend-ui-dev` per domain,
each owns `app/desktop/<domain>.css` + its `*-page.tsx`):**
- Home + Landing + Terms
- Matches (list, detail, new wizard, filter, states)
- Team-matches (list, detail, new wizard, filter, states)
- Teams (list, detail, members, new, search)
- My (profile, settings, reviews, my-teams, my-matches)
- Auth + Onboarding (login, signup, social, callbacks, auth errors, onboarding)
- Search + Chat + Notifications + Notices
- **Admin** (desktop polish + mobile verification, 7 pages) — Tailwind-utility system

**Gate (per wave):** `frontend-review` (code) + `ui-manager` (pixel/visual) +
`ux-manager` (flow) + `design-main` (system consistency) + `qa-uiux` (states/responsive).

**Verify (final):** stand up Postgres + `v1_api` seed + `v1_web` dev (3013); Playwright
breakpoint matrix (390/820/1280/1440) on representative pages of each domain.

## Acceptance Criteria

- No route shows the legacy 480px centered strip on desktop; content uses the desktop
  width with intentional multi-column/master-detail layouts.
- Mobile (<768) visually unchanged from current (regression-checked).
- Admin usable + intentional at both desktop and mobile.
- `tsc --noEmit` clean, vitest green, `next build` succeeds.
- Design-system fidelity: tokens only, `.tm-*`/admin tokens reused, WCAG AA contrast,
  44px touch targets, keyboard focus rings.
- Live visual QA screenshots across breakpoints attached.

## Tech Debt Resolved

- Frame width un-pinned; chrome no longer hardcodes 480px math.
- Desktop CSS layer convention established (replaces "everything in one 3800-line file").
- Dead `.v1-*` prototype shell flagged for removal (separate cleanup).

## Security Notes

Pure frontend layout/CSS + a dev-only seed path. No new endpoints, no auth changes, no
secrets. Admin remains behind existing guards. No `dangerouslySetInnerHTML` introduced.

## Risks & Dependencies

- **R1**: Postgres for v1 is **not running**, no v1 docker-compose. Verify phase must
  provision `teameet_v1_dev` (Docker pg or local) + `db:push` + `db:seed[:mocks]`.
  Fallback if infra blocks: wire browser MSW for visual QA (note as deviation).
- **R2**: `globals.css` is one shared 3800-line file → strict per-domain file
  ownership for desktop overrides; Foundation must land first and stable.
- **R3**: Chrome re-scoping (`.tm-fixed-cta`, `.tm-filter-layer`) is intricate; high
  regression risk to mobile — mobile snapshot before/after.
- **R4**: Two-shell confusion — `.v1-*` is dead; only `AppChrome`/`.tm-*` is live.

## Ambiguity Log

- Desktop scope (key-flows vs all) → **resolved**: all pages (user, AskUserQuestion).
- Mock mode (browser MSW vs backend+seed) → **resolved**: backend+seed (user).
- Consumer desktop nav (sidebar vs top-nav) → **decided** top-nav (orchestrator);
  open to `ux-manager` refinement in the gate.

## Desktop Design Contract (every domain wave MUST follow)

Foundation (`apps/v1_web/src/app/desktop/_shell.css`, committed `9f256c24`) already
provides: desktop top-nav, frame un-pin, **content centered at `max-width:1120px`**
(via `.tm-scroll-area`), and shared primitives. Domain agents build WITHIN this.

1. **Breakpoints**: art-direct desktop at `@media (min-width:1024px)`; bump density
   at `@media (min-width:1440px)`. **Mobile (<768) MUST stay byte-for-byte visually
   unchanged** — never edit existing mobile rules; only add desktop `@media` blocks
   in your `desktop/<domain>.css` (+ optional desktop-only JSX gated by
   `.tm-show-desktop`/`.tm-hide-desktop`).
2. **Where desktop CSS lives**: ONLY your `apps/v1_web/src/app/desktop/<domain>.css`.
   Do NOT edit `globals.css`, `_shell.css`, `shell.tsx`, other domains' files, or
   admin. Page-component JSX edits are allowed only in YOUR domain's components.
3. **Kill the stretched column**: the #1 fix. A single mobile column stretched to
   1120px looks broken (huge gaps). Use real desktop composition: card lists →
   `.tm-desktop-grid-3` (2-up ≥1024, 3-up ≥1440) or bespoke grids; horizontal
   mobile rails (`.tm-match-rail`) → wrapped grids on desktop; KPI/stat strips →
   wider; forms → constrain to ~520–640px (don't stretch inputs full 1120px).
4. **Detail / back pages**: the mobile `.tm-topbar` (back + title) is hidden on
   desktop. Render the shared `.tm-desktop-page-head tm-show-desktop` header (back
   link + `.tm-text-heading` title) at the top of content. Re-scope any
   domain-specific full-bleed hero/CTA to the 1120px column.
5. **Tokens only**: `--blue500`, `--grey50…900`, `.tm-text-*`, `.tm-card`,
   `--shadow-1/2`, `.tm-badge-*`, `.tm-btn-*`. No hardcoded hex/px-color.
6. **A11y**: WCAG AA contrast, 44px touch targets, visible focus rings
   (`outline:2px solid var(--blue500); outline-offset:2px`), `aria-label` on icon
   links, `aria-current="page"` on active nav. Color never the sole signal.
7. **Verify**: `cd apps/v1_web && pnpm exec tsc --noEmit` clean before reporting
   DONE. Do not self-commit.

## Progress Snapshot

- [x] main merged (911036b3)
- [x] codebase mapped, live shell identified, decisions locked
- [x] Wave 0 Foundation (committed 9f256c24) — desktop nav + frame un-pin verified
- [ ] Domain waves
- [ ] Gate
- [ ] Live verify (backend+seed)
