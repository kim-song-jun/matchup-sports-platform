# Task 84 -- V1 First Design Port Map

Owner: codex
Status: Drafted
Priority: P0
Target: frontend
Mode: CODE

## Purpose

Port every section in `Team Design > 1차 디자인 완료` into `apps/v1_web` as real v1 frontend pages.

Current decision: first import every `1차 디자인 완료` surface into `apps/v1_web` routes before productizing the pages. The route layer now points to a shared `FirstDesignPage` wrapper, which renders the exported design-source components inside `DesignFrame`.

## Source Of Truth

- Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Design section list: `.github/tasks/82-sm-new-rebuild-plan.md`
- Exported design components: `apps/v1_web/src/design-source/sm-first-design.jsx`
- Current route scaffold: `apps/v1_web/src/app/**/page.tsx`
- E2E matrix: `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`

## Current Finding

- Route files exist for the main v1 surfaces and required missing surfaces.
- Route files use `FirstDesignPage` and `DesignFrame` so the exported first-complete design components are visible on normal v1 routes.
- The previous product-page scaffolds remain in `components/domain/**` as later productization helpers, but they are no longer the active route target.
- PowerShell may display Korean as mojibake, so verify with UTF-8 reads when needed.
- `src/hooks` and `src/types` are still empty, so real API binding is not started.
- Production-candidate `apps/v1_web/src/app` routes no longer import
  `DesignFrame` or `design-source`; design references remain only outside app
  routes.

## Porting Rule

One design section does not always equal one route.

- Primary product screens become normal app routes.
- Duplicate design screens usually represent state variants such as empty, error, stale, filter sheet, pending, permission denied, or completed states.
- State variants should be implemented inside the owning page/component when possible.
- Separate state routes may remain only as QA/dev fixtures when they are useful for visual review, for example `/matches/empty` or `/search/error`.
- Deferred domains must render honest disabled/read-only copy and must not simulate successful payment, refund, support, or admin outcomes.

## Design Section Map

Important: `No` below is the original design number shown in `Team Design >
1차 디자인 완료`. Do not renumber `02-1`, `03-1`, or `04-1` as ordinary
sequential product sections; those suffixes are part of the source design
inventory and must stay visible in publishing work.

| No | Design section | Required product page(s) | Current route evidence | Port status | Exception/state handling |
|---|---|---|---|---|---|
| 00 | `core-shell-sm-final` | shared shell, top bar, bottom nav, search entry, notification entry | `components/design/first-design-page.tsx`, `components/design/design-frame.tsx` | Imported | First-complete design shell is active on v1 routes. Product shell replacement comes after visual import review. |
| 01 | `auth-onboarding-sm-final` | login, terms, signup, onboarding sport/level/region/confirm/resume | `/login`, `/signup`, `/terms`, `/onboarding/*` | Imported | Provider denied, email missing, conflict, blocked, incomplete resume, validation failure are available in design-source and need route exposure if QA requires separate URLs. |
| 02 | `home-discovery-sm-final` | `/home`, search entry, recommendations, quick actions, home notices | `/home`, `/search`, `/search/new`, `/search/empty`, `/search/error`, `/search/stale` | Imported | Search states are exposed through fixture routes where available. |
| 02-1 | `home-notice-sm-final` | `/notices`, `/notices/[id]` | routes exist | Imported | Notices are read-only. |
| 03 | `matches-core-sm-final` | `/matches`, `/matches/[id]`, `/matches/participants`, joined/created management entry | routes exist: list/detail/empty/error/filter/joined/participants | Imported | Empty/error/filter are separate fixture routes for first visual review. |
| 03-1 | `matches-core-sm-create-final` | `/matches/new/*`, `/matches/[id]/edit`, create complete | routes exist for sport, place-time, confirm, complete, edit | Imported | Required-field, invalid time, permission, duplicate submit, save failure, cancel guard remain productization states. |
| 04 | `teams-team-matches-sm-revision-4` | `/team-matches`, `/team-matches/[id]`, application/manage states | routes exist: list/detail/empty/error/filter | Imported | Empty/error/filter are separate fixture routes for first visual review. |
| 04-1 | `teams-team-matches-sm-create-final` | `/team-matches/new/*`, `/team-matches/[id]/edit`, complete | routes exist for team, sport, info, condition, place-time, confirm, complete, edit | Imported | Team owner/manager and cost note product behavior remains for API binding. |
| 05 | `team-browse-sm-revision-5` | `/teams`, `/teams/[id]`, `/teams/new`, `/teams/[id]/edit`, `/teams/[id]/members` | routes exist: list/detail/filter/search states/new/edit/members | Componentized core | Search/filter empty/error remain separate fixture routes for visual QA until folded into API-bound page states. |
| 06 | `community-sm-final` | `/chat`, `/chat/[id]`, `/notifications`, notification read state | routes exist | Componentized core | V1 chat is linked match/team-match/team text chat only; websocket/backfill/read mutation behavior remains for API binding. |
| 07 | `my-profile-trust-sm-revision` | `/my`, `/my/matches/joined`, `/my/matches/created`, `/my/teams`, `/my/teams/[id]`, `/my/teams/[id]/members`, profile/trust sections | core my/team management plus `/my/profile/edit` | Componentized core | Profile/settings routes now use API-bindable my components; deeper trust/review history states remain future API-bound variants. |
| 08 | `payments-support-sm-revision` | disabled/read-only payment/support surfaces only if visible | no dedicated v1 payment/support route expected | Deferred | Must not show fake payment/refund/support success. Match/team-match CTA maps to application request, not checkout. |
| 09 | `settings-states` | settings main, notification settings, legal, logout, withdrawal | `/my/settings`, `/my/settings/notifications`, `/my/settings/legal`, `/my/settings/withdrawal` | Closest imported | Dedicated settings export is not present; current routes use profile/trust/notification designs as placeholders. |
| 10 | `public-marketing-sm-revision` | landing/public entry route if launch needs it | `/landing`; `/` still redirects to `/home` | Imported | Root remains app-first until launch routing is decided. |
| 11 | `desktop-web` | responsive desktop treatment for core pages | no desktop-specific implementation confirmed | Pending | Implement after mobile core pages are stable. Same APIs, wider layout. Keyboard/focus state must be covered. |
| 12 | `admin-ops-sm-revision` | admin minimum dashboard/status/audit pages | `/admin`, `/admin/audit` | Imported | API exists for admin minimum. Non-minimum admin actions remain blocked/deferred. |
| 13 | `common-flows-motion` | shared list/detail/form/mutation states across all domains | scattered state routes exist | Pending | Loading, empty, error, retry, stale, duplicate submit, permission denied, destructive confirm, optimistic navigation must become shared UI patterns. |

## Existing Route Coverage Snapshot

Covered as route scaffold:

- `/landing`
- `/login`, `/signup`, `/terms`
- `/onboarding/resume`, `/onboarding/sport`, `/onboarding/level`, `/onboarding/region`, `/onboarding/confirm`
- `/home`
- `/search`, `/search/new`, `/search/empty`, `/search/error`, `/search/stale`
- `/notices`, `/notices/[id]`
- `/matches`, `/matches/[id]`, `/matches/[id]/edit`, `/matches/empty`, `/matches/error`, `/matches/filter`, `/matches/joined`, `/matches/participants`, `/matches/new/*`
- `/team-matches`, `/team-matches/[id]`, `/team-matches/[id]/edit`, `/team-matches/empty`, `/team-matches/error`, `/team-matches/filter`, `/team-matches/new/*` including `/team-matches/new/condition`
- `/teams`, `/teams/[id]`, `/teams/[id]/edit`, `/teams/[id]/members`, `/teams/filter`, `/teams/new`, `/teams/search/*`
- `/my`, `/my/matches/*`, `/my/teams/*`
- `/my/profile/edit`, `/my/settings`, `/my/settings/notifications`, `/my/settings/legal`, `/my/settings/withdrawal`
- `/notifications`, `/notifications/read`
- `/chat`, `/chat/[id]`
- `/admin`, `/admin/audit`

Missing or unclear:

- desktop-specific layout validation
- whether `/landing` should become root before cutover candidate
- whether state fixture routes remain visible dev routes or move behind QA-only convention

## Implementation Sequence

### Phase 1 -- Frontend Design Inventory Freeze

- [x] Create this design port map.
- [x] Restore the original `Team Design > 1차 디자인 완료` numbering
  (`00`, `02-1`, `03-1`, `04-1`) in the publishing inventory.
- [ ] Add a per-route checklist under this document after inspecting every existing page.
- [ ] Decide whether state fixture routes remain public dev routes or move behind a QA-only convention.

### Phase 2 -- First Design Import Baseline

- [x] Export missing first-complete design-source components needed by v1 routes.
- [x] Add `FirstDesignPage` wrapper.
- [x] Route the v1 pages to first-complete design components through `DesignFrame`.
- [ ] Review closest-placeholder routes for settings/team create/profile edit/admin audit.
- [x] Start the componentized publishing path with `/home`: the route now uses
  `page -> view-model -> HomePageView -> v1-ui shell/primitives` instead of
  rendering `design-source` directly.
- [x] Continue the componentized publishing path with core `03 / 03-1` personal
  match routes: `/matches`, `/matches/[id]`, `/matches/new/*`, and
  `/matches/[id]/edit` now use `matches.types -> matches.view-model ->
  matches-page` instead of rendering `design-source` directly. State fixture
  routes such as `/matches/empty`, `/matches/error`, `/matches/filter`,
  `/matches/joined`, and `/matches/participants` remain as visual QA fixtures
  until their API-bound state variants are folded into the shared match view.
- [x] Continue the componentized publishing path with core `04 / 04-1` team
  match routes: `/team-matches`, `/team-matches/[id]`,
  `/team-matches/new/*`, and `/team-matches/[id]/edit` now use
  `team-matches.types -> team-matches.view-model -> team-matches-page`
  instead of rendering `design-source` directly. Added the missing
  `/team-matches/new/condition` route so the create flow keeps the source
  design's six-step structure. State fixture routes such as
  `/team-matches/empty`, `/team-matches/error`, and `/team-matches/filter`
  remain as visual QA fixtures until folded into API-bound page states.
- [x] Continue the componentized publishing path with core `05` team browse
  routes: `/teams`, `/teams/[id]`, `/teams/new`, `/teams/[id]/edit`, and
  `/teams/[id]/members` now use `teams.types -> teams.view-model ->
  teams-page` instead of rendering `design-source` directly. Search/filter
  state routes remain as visual QA fixtures for now.
- [x] Continue the componentized publishing path with core `06` community
  routes: `/chat`, `/chat/[id]`, `/notifications`, and
  `/notifications/read` now use `community.types -> community.view-model ->
  community-page` instead of rendering `design-source` directly.
- [x] Continue the componentized publishing path with core `07` my/profile
  routes: `/my`, `/my/matches/joined`, `/my/matches/created`, `/my/teams`,
  `/my/teams/[id]`, `/my/teams/[id]/members`, `/my/profile/edit`, and
  `/my/settings/*` now use `my.types -> my.view-model -> my-page`
  instead of rendering `design-source` directly.

### Phase 3 -- Mobile Core Pages

- [x] Port `/home` and search states to product-page scaffolds.
- [x] Port `/notices` and notice detail to product-page scaffolds.
- [x] Port `/matches` list/detail/create/edit/manage states.
- [x] Port `/team-matches` list/detail/create/edit/manage states.
- [x] Port `/teams` list/detail/join/create/edit/member states.
- [x] Port `/chat` and `/notifications` list/read scaffolds.
- [x] Port `/my` root activity/profile scaffold.

### Phase 4 -- Missing Required Surfaces

- [x] Add auth/login/signup/terms/onboarding route plan and implement the v1-supported subset.
- [x] Add settings/profile edit routes or explicitly place them under `/my`.
- [x] Add admin minimum routes or document why admin remains API-only for the current v1 slice.
- [x] Decide whether public marketing is needed before cutover candidate.

### Phase 5 -- Contract Binding

- [x] Add `apps/v1_web/src/types/api.ts`.
- [x] Add API client and v1 development auth header handling.
- [x] Add query keys, domain hooks, and MSW handlers.
- [ ] Bind all core pages to hooks after first-design visual import is accepted.

### Phase 6 -- Verification

- [ ] Run `make dev-v1`.
- [x] Smoke `localhost:3013` core routes.
- [x] Capture mobile viewport evidence for each required design section.
- [ ] Convert `docs/scenarios/12-v1-sm-new-e2e-scenarios.md` into Playwright specs after hook binding.

## Acceptance Criteria

- Every one of the 17 first-complete design sections has either an implemented v1 page, a documented state variant, or an explicit deferred decision.
- Duplicate design screens are represented as state variants, not accidental duplicate product pages.
- Missing routes are tracked before API hook work starts.
- Payment/support/admin/public/desktop gaps are honest and do not imply completed functionality.
- The next frontend worker can implement pages from this map without reopening product scope.

## Progress Snapshot

- [x] Confirmed current v1 design source exports.
- [x] Confirmed current `apps/v1_web/src/app` route scaffold.
- [x] Identified and removed production-candidate `DesignFrame` wrappers from app routes.
- [x] Created section-by-section design port map.
- [x] First pass shell/copy baseline added for home/search/notices/matches/team-matches/teams/chat/notifications/my root routes.
- [ ] Inspect every route file and add per-route implementation notes.
- [x] Complete first-design route conversion into `DesignFrame`.
- [x] Add missing auth/onboarding/settings/profile/admin/public route scaffolds.
- [x] Add first-pass v1 frontend contract layer: API types, client, query keys, hooks, and MSW fixtures/handlers.
- [x] Repoint active v1 routes to first-complete design components before productization.
- [x] Corrected the design map so publishing work follows source design numbers
  instead of sequential scenario numbering.
- [x] Added the first API-bindable publishing slice for `02 home`: shared
  `v1-ui` shell/primitives, `HomePageView`, and `home.view-model`.
- [x] Added the API-bindable publishing slices for `03 / 03-1 matches` and
  `04 / 04-1 team-matches`, preserving source design numbering and fixed
  shell behavior while moving active routes to componentized page views.
- [x] Added the API-bindable publishing slice for `05 teams`, including
  browse cards, detail CTA, create/edit form scaffold, and member management.
- [x] Added the API-bindable publishing slice for `06 community`, including
  chat category counts, pinned/unread room rows, chat context card, fixed
  message input, unread notifications, and all-read notification state.
- [x] Added the API-bindable publishing slice for `07 my/profile`, including
  profile summary, monthly activity, joined/created match lists, my team
  management, member review, profile edit, settings, legal, notification
  settings, and withdrawal warning surfaces.
- [x] Completed mobile visual acceptance evidence for the componentized v1
  core route set: 39 routes captured at the 375x812 mobile contract with zero
  automated route/status issues.
- [x] Started the shell/chrome consistency pass: removed the mock mobile
  status bar from active `AppChrome` routes and the standalone search surface,
  then realigned topbar and scroll-area anchors to the actual app-frame top.
- [x] Detail pass started with `02 home`: compared active
  `HomePageView` against `SMRevisionHomeMobileV2`, kept the existing
  componentized structure, and corrected route continuity for home shortcuts,
  featured/recommended match cards, section actions, and notice rows.

## Detail Pass Handoff

Current checkpoint: the active v1 frontend has moved from "show the first
design as exported source" to "publish the same first design through
API-bindable components." The next work should be detail correction, not broad
new surface expansion.

Completed componentized slices:

1. `00` shared shell
   - Top bar and bottom nav are fixed chrome.
   - Only the content area scrolls.
   - Shared `v1-ui` shell/primitives/icons are now the baseline for active
     componentized routes.
2. `02` home
   - `/home` uses `HomePageView + home.view-model + v1-ui`.
3. `03 / 03-1` personal matches
   - `/matches`, `/matches/[id]`, `/matches/new/*`, and
     `/matches/[id]/edit` use componentized match views.
4. `04 / 04-1` team matches
   - `/team-matches`, `/team-matches/[id]`, `/team-matches/new/*`, and
     `/team-matches/[id]/edit` use componentized team-match views.
   - Missing `/team-matches/new/condition` was added to preserve the source
     design create-step structure.
5. `05` teams
   - Team browse, detail, create/edit, and member management use
     componentized team views.
6. `06` community
   - Chat list, chat room, notification list, and read-state notification
     routes use componentized community views.
7. `07` my/profile/settings baseline
   - My home, joined/created matches, my teams, team management, member
     management, profile edit, settings, notification settings, legal, and
     withdrawal warning routes use componentized my views.

Deferred:

- `08 payments-support-sm-revision` is intentionally deferred. Do not implement
  fake payment, refund, dispute, or support success states. When resumed, this
  slice must keep test/mock payment honesty visible through the full flow and
  show disabled/read-only or pending states unless real API contracts are ready.
- `09 settings-states` is partially covered by the `07` settings baseline.
  Treat the remaining `09` work as detailed state coverage rather than a new
  top-level page build.

Next detail-pass order:

1. [x] `/home`
   - Active implementation already matched the `SMRevisionHomeMobileV2`
     spacing/radius/density baseline closely.
   - Converted quick actions to real links for `/matches`, `/team-matches`,
     and `/teams`; kept `나의 팀` disabled because its route remains undecided.
   - Converted featured/recommended match cards to `/matches/[id]`, the
     추천 매치 section action to `/matches`, notice rows to `/notices/[id]`,
     and 공지사항 전체보기 to `/notices`.
   - Fixed the shared icon button positioning so the notification new dot is
     anchored to the topbar action itself.
   - Restored the `06` design's home chat floating entry above the bottom nav
     and exposed unread count through the home view-model.
2. [x] `/matches`, `/matches/[id]`, `/matches/new/*`
   - Rechecked active match list/detail/create/edit against
     `SMRevisionMatchListMobileSM7`, `SMRevisionMatchDetailMobileSM3`, and
     the `03-1` create final components.
   - Replaced text glyph controls with shared icons for list FAB, detail back,
     and share action while keeping the existing componentized route structure.
   - Added create/edit/complete back navigation through shared `AppChrome`
     (`/matches/new/*` -> `/matches`, edit -> detail, complete -> list).
   - Connected detail secondary CTA to `/chat/room-1` and the owner manage CTA
     to `/matches/[id]/edit`; pending/approved locked buttons now keep distinct
     orange/green status fills instead of neutral-only disabled styling.
3. [x] `/team-matches`, `/team-matches/[id]`, `/team-matches/new/*`
   - Rechecked active team-match list/detail/create/edit against
     `SMRevisionTeamMatchListMobileSM4`, `SMRevisionTeamMatchDetailMobileSM2`,
     and the `04-1` create final components.
   - Moved the team-match create FAB into the shared shell `floatingSlot`, so
     it stays fixed to the app frame and does not move with content scroll.
   - Replaced text glyph controls with shared icons for list FAB, detail back,
     and share action.
   - Added create/edit/complete back navigation through shared `AppChrome`
     (`/team-matches/new/*` -> `/team-matches`, edit -> detail, complete ->
     list).
   - Connected detail secondary CTA to `/chat/room-1`, owner manage CTA to
     `/team-matches/[id]/edit`, and team info card to `/teams/team-1`.
   - Pending/approved locked buttons now keep distinct orange/green status
     fills instead of neutral-only disabled styling.
4. [x] `/teams`, `/teams/[id]`, `/teams/new`, `/teams/[id]/members`
   - Rechecked active team browse/detail/create/member routes against
     `SMRevisionTeamBrowseMobileSM5`, `SMRevisionTeamBrowseDetailSM5`, and
     the related `07` member-management final surface.
   - Moved the team create FAB into the shared shell `floatingSlot`, keeping it
     app-frame fixed instead of content-scroll anchored.
   - Updated the team browse surface to the SM5 search/filter chrome, one-line
     summary bar, and team-intro card density instead of the earlier three-stat
     card layout.
   - Expanded team detail to show basic info, multi-sport chips, SNS/link
     fields, uploaded-vs-example image slots, and member entry continuity.
   - Updated create/edit to expose only saveable fields and disabled pending
     save CTAs until real persistence is bound, avoiding false success.
   - Split member management into team members and join requests with explicit
     locked/pending actions.
5. [x] `/chat`, `/chat/[id]`, `/notifications`
   - Partial correction: `/notifications` now uses shared shell back navigation
     to return to `/home`, matching the community design's back-title chrome.
   - Partial correction: `/chat` now returns to `/home`, and `/chat/[id]`
     returns to `/chat` through the same shared shell back navigation.
   - Rechecked active community routes against `SMRevisionChatListMobileSM2`,
     `SMRevisionChatRoomMobileSM2`, and `SMRevisionNotificationsMobileSM2`.
   - Updated chat list to show search/notification chrome, chip filters,
     fixed-frame chat FAB, pinned-first grouping, and card-style unread rows.
   - Updated chat room context card, message input, and send action so the
     unbound send state is disabled instead of appearing successful.
   - Updated notifications to use explicit href/action labels per item,
     a read-all state route, and read-all disabled/success copy without
     pretending a live mutation has completed.
6. [x] `/my`, `/my/matches/*`, `/my/teams/*`, `/my/profile/edit`,
   `/my/settings/*`
   - Rechecked active my/profile/team-management routes against
     `SMRevisionMyPageSM1`, `SMRevisionMyMatchesJoinedSM1`,
     `SMRevisionMyMatchesCreatedSM1`, `SMRevisionMyTeamsSM1`,
     `SMRevisionMyTeamDetailSM1`, and `SMRevisionMyTeamMembersSM1`.
   - Updated `/my` to the SM1 profile band and four-stat summary rhythm.
   - Added segmented joined/created match navigation and made unbound manage
     actions disabled/pending instead of false-success buttons.
   - Added explicit back navigation across my subpages and kept team detail
     CTA continuity to team chat and public team information.
   - Updated profile edit, logout, withdrawal, member approval, and request
     actions to show pending/disabled states until real API contracts are
     bound.

Validation notes:

- `git diff --check -- apps/v1_web/src/app/globals.css apps/v1_web/src/components/home/home-page.tsx apps/v1_web/src/components/home/home.types.ts apps/v1_web/src/components/home/home.view-model.ts apps/v1_web/src/components/v1-ui/primitives.tsx` passed.
- `pnpm --filter v1_web exec tsc --noEmit --pretty false` was attempted but
  PowerShell blocked `pnpm.ps1` by execution policy.
- `pnpm.cmd install --frozen-lockfile` required network access on first run
  and then completed with the lockfile unchanged.
- `pnpm.cmd --filter v1_web exec tsc --noEmit --pretty false` passed after
  dependencies were installed.
- `pnpm.cmd --filter v1_web dev` still fails on this Windows host because the
  script depends on `sh`; smoke used direct `next dev --hostname 0.0.0.0
  --port 3013` instead.
- Smoke routes returned `200`: `/home`, `/matches`, `/matches/match-2`,
  `/notices`, `/notices/notice-1`.
- Follow-up smoke for the home/community correction returned `200`: `/home`,
  `/notifications`, `/chat`.
- Follow-up smoke for chat back-navigation chrome returned `200`: `/chat`,
  `/chat/room-1`.
- Match detail pass smoke returned `200`: `/matches`, `/matches/match-1`,
  `/matches/new/sport`, `/matches/new`, `/matches/new/place-time`,
  `/matches/new/confirm`, `/matches/new/complete`, `/matches/match-1/edit`.
- Restarted the v1 dev server on `3013` after the matches changes; readiness
  check returned `200` for `/matches`.
- Team-match detail pass smoke returned `200`: `/team-matches`,
  `/team-matches/team-match-1`, `/team-matches/new/team`,
  `/team-matches/new/sport`, `/team-matches/new/info`,
  `/team-matches/new/condition`, `/team-matches/new/place-time`,
  `/team-matches/new/confirm`, `/team-matches/new/complete`,
  `/team-matches/team-match-1/edit`.
- Restarted the v1 dev server on `3013` after the team-match changes;
  readiness check returned `200` for `/team-matches`.
- `pnpm.cmd --filter v1_web exec tsc --noEmit --pretty false` could not run
  directly from the current WSL `bash` shell because the Windows batch file was
  parsed as shell script; `cmd.exe /c pnpm.cmd ...` also failed with a WSL
  interop socket error. Equivalent `pnpm --filter v1_web exec tsc --noEmit
  --pretty false` passed.
- Team detail pass smoke returned `200`: `/teams`, `/teams/team-1`,
  `/teams/new`, `/teams/team-1/edit`, `/teams/team-1/members`.
- Restarted the v1 dev server on `3013` with `pnpm --filter v1_web dev:e2e`
  from WSL after the team changes; readiness GET returned `200` for `/teams`.
- Community detail pass smoke returned `200`: `/chat`, `/chat/room-1`,
  `/notifications`, `/notifications/read`.
- Restarted the v1 dev server on `3013` with `pnpm --filter v1_web dev:e2e`
  from WSL after the community changes; readiness GET returned `200` for
  `/chat`.
- My/profile detail pass smoke returned `200`: `/my`,
  `/my/matches/joined`, `/my/matches/created`, `/my/teams`,
  `/my/teams/team-1`, `/my/teams/team-1/members`, `/my/profile/edit`,
  `/my/settings`, `/my/settings/notifications`, `/my/settings/legal`,
  `/my/settings/withdrawal`.
- Restarting with `pnpm --filter v1_web dev:e2e` initially hit a Next dev
  chunk-load/manifest drift 500 on `/my`; restarted with
  `pnpm --filter v1_web dev` to clear `.next`, then readiness GET returned
  `200` for `/my`.
- Added `scripts/qa/v1-mobile-design-acceptance.mjs` for route-level mobile
  design acceptance capture. The preferred Playwright browser path was blocked
  in this host because Playwright Chromium install reported unsupported
  `ubuntu26.04-x64`, and no system Linux Chromium was available.
- `visual-qa-codex` MCP capture was unavailable in this runtime, so visual
  evidence used the script's Windows Chrome CLI fallback with
  `CHROME_CLI_EXECUTABLE='/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'`.
  The fallback uses `CHROME_CLI_WINDOW_SIZE=487,1056` and
  `CHROME_CLI_DEVICE_SCALE_FACTOR=1.3` to approximate the 375x812 CSS viewport
  under Windows display scaling.
- Mobile visual acceptance run passed for 39 routes with zero automated issues:
  `output/playwright/visual-audit/v1-mobile-acceptance-2026-05-20-dsf/report.md`.
  Representative manual review covered `/home`, `/matches`, `/team-matches`,
  `/team-matches/team-match-1`, `/teams`, `/teams/team-1`, `/my`,
  `/chat/room-1`, and `/my/settings/withdrawal`; no critical visual blockers
  were found.
- Post-evidence checks passed: `git diff --check --
  .github/tasks/84-v1-first-design-port-map.md
  scripts/qa/v1-mobile-design-acceptance.mjs`,
  `node --check scripts/qa/v1-mobile-design-acceptance.mjs`, and
  `pnpm --filter v1_web exec tsc --noEmit --pretty false`.
- Final dev-server readiness: a stale `next-server (v1)` process on `3013`
  returned `500` after the failed restart attempt; stopped only that process,
  restarted with `pnpm --filter v1_web dev`, and confirmed `200` for `/home`
  and `/teams`.
- Shell/chrome pass validation passed: active component search has no remaining
  `9:41`, `tm-status-bar`, `tm-status-icons`, or `StatusBar` references outside
  `design-source`; `git diff --check -- apps/v1_web/src/components/v1-ui/shell.tsx
  apps/v1_web/src/app/globals.css apps/v1_web/src/components/search/search-experience.tsx`
  passed; `pnpm --filter v1_web exec tsc --noEmit --pretty false` passed.
- Restarted the v1 dev server on `3013` with `pnpm --filter v1_web dev` after
  the shell/chrome pass; readiness smoke returned `200` for `/home`, `/search`,
  and `/matches/match-1`.

## Ambiguity Log

- Auth/signup/terms/onboarding now have v1 route scaffolds, but social auth provider handling remains pending API contract binding.
- Settings/profile edit are fixed under `/my/settings` and `/my/profile/edit` for the current v1 slice.
- Admin v1 has minimum route scaffolds under `/admin` and `/admin/audit`; non-minimum operations remain deferred.
- Public marketing has a `/landing` scaffold, while `/` still redirects to `/home` until launch routing is decided.
- State fixture routes such as `/matches/empty` and `/search/error` are useful for QA but should not become user navigation destinations unless deliberately exposed.
