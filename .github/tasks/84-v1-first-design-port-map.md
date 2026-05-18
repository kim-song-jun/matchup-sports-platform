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

| No | Design section | Required product page(s) | Current route evidence | Port status | Exception/state handling |
|---:|---|---|---|---|---|
| 1 | `core-shell-sm-final` | shared shell, top bar, bottom nav, search entry, notification entry | `components/design/first-design-page.tsx`, `components/design/design-frame.tsx` | Imported | First-complete design shell is active on v1 routes. Product shell replacement comes after visual import review. |
| 2 | `auth-onboarding-sm-final` | login, terms, signup, onboarding sport/level/region/confirm/resume | `/login`, `/signup`, `/terms`, `/onboarding/*` | Imported | Provider denied, email missing, conflict, blocked, incomplete resume, validation failure are available in design-source and need route exposure if QA requires separate URLs. |
| 3 | `home-discovery-sm-final` | `/home`, search entry, recommendations, quick actions, home notices | `/home`, `/search`, `/search/new`, `/search/empty`, `/search/error`, `/search/stale` | Imported | Search states are exposed through fixture routes where available. |
| 4 | `home-notice-sm-final` | `/notices`, `/notices/[id]` | routes exist | Imported | Notices are read-only. |
| 5 | `matches-core-sm-final` | `/matches`, `/matches/[id]`, `/matches/participants`, joined/created management entry | routes exist: list/detail/empty/error/filter/joined/participants | Imported | Empty/error/filter are separate fixture routes for first visual review. |
| 6 | `matches-core-sm-create-final` | `/matches/new/*`, `/matches/[id]/edit`, create complete | routes exist for sport, place-time, confirm, complete, edit | Imported | Required-field, invalid time, permission, duplicate submit, save failure, cancel guard remain productization states. |
| 7 | `teams-team-matches-sm-revision-4` | `/team-matches`, `/team-matches/[id]`, application/manage states | routes exist: list/detail/empty/error/filter | Imported | Empty/error/filter are separate fixture routes for first visual review. |
| 8 | `teams-team-matches-sm-create-final` | `/team-matches/new/*`, `/team-matches/[id]/edit`, complete | routes exist for team, sport, info, place-time, confirm, complete, edit | Imported | Team owner/manager and cost note product behavior remains for API binding. |
| 9 | `team-browse-sm-revision-5` | `/teams`, `/teams/[id]`, `/teams/new`, `/teams/[id]/edit`, `/teams/[id]/members` | routes exist: list/detail/filter/search states/new/edit/members | Imported | Search/filter empty/error are separate fixture routes for first visual review. |
| 10 | `community-sm-final` | `/chat`, `/chat/[id]`, `/notifications`, notification read state | routes exist | Imported | V1 chat is linked match/team-match text chat only; product constraints remain for binding. |
| 11 | `my-profile-trust-sm-revision` | `/my`, `/my/matches/joined`, `/my/matches/created`, `/my/teams`, `/my/teams/[id]`, `/my/teams/[id]/members`, profile/trust sections | core my/team management plus `/my/profile/edit` | Imported | Profile/settings routes use closest exported profile/trust designs until a dedicated settings design is chosen. |
| 12 | `payments-support-sm-revision` | disabled/read-only payment/support surfaces only if visible | no dedicated v1 payment/support route expected | Deferred | Must not show fake payment/refund/support success. Match/team-match CTA maps to application request, not checkout. |
| 13 | `settings-states` | settings main, notification settings, legal, logout, withdrawal | `/my/settings`, `/my/settings/notifications`, `/my/settings/legal`, `/my/settings/withdrawal` | Closest imported | Dedicated settings export is not present; current routes use profile/trust/notification designs as placeholders. |
| 14 | `public-marketing-sm-revision` | landing/public entry route if launch needs it | `/landing`; `/` still redirects to `/home` | Imported | Root remains app-first until launch routing is decided. |
| 15 | `desktop-web` | responsive desktop treatment for core pages | no desktop-specific implementation confirmed | Pending | Implement after mobile core pages are stable. Same APIs, wider layout. Keyboard/focus state must be covered. |
| 16 | `admin-ops-sm-revision` | admin minimum dashboard/status/audit pages | `/admin`, `/admin/audit` | Imported | API exists for admin minimum. Non-minimum admin actions remain blocked/deferred. |
| 17 | `common-flows-motion` | shared list/detail/form/mutation states across all domains | scattered state routes exist | Pending | Loading, empty, error, retry, stale, duplicate submit, permission denied, destructive confirm, optimistic navigation must become shared UI patterns. |

## Existing Route Coverage Snapshot

Covered as route scaffold:

- `/landing`
- `/login`, `/signup`, `/terms`
- `/onboarding/resume`, `/onboarding/sport`, `/onboarding/level`, `/onboarding/region`, `/onboarding/confirm`
- `/home`
- `/search`, `/search/new`, `/search/empty`, `/search/error`, `/search/stale`
- `/notices`, `/notices/[id]`
- `/matches`, `/matches/[id]`, `/matches/[id]/edit`, `/matches/empty`, `/matches/error`, `/matches/filter`, `/matches/joined`, `/matches/participants`, `/matches/new/*`
- `/team-matches`, `/team-matches/[id]`, `/team-matches/[id]/edit`, `/team-matches/empty`, `/team-matches/error`, `/team-matches/filter`, `/team-matches/new/*`
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
- [ ] Add a per-route checklist under this document after inspecting every existing page.
- [ ] Decide whether state fixture routes remain public dev routes or move behind a QA-only convention.

### Phase 2 -- First Design Import Baseline

- [x] Export missing first-complete design-source components needed by v1 routes.
- [x] Add `FirstDesignPage` wrapper.
- [x] Route the v1 pages to first-complete design components through `DesignFrame`.
- [ ] Review closest-placeholder routes for settings/team create/profile edit/admin audit.

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
- [ ] Smoke `localhost:3013` core routes.
- [ ] Capture mobile viewport evidence for each required design section.
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

## Ambiguity Log

- Auth/signup/terms/onboarding now have v1 route scaffolds, but social auth provider handling remains pending API contract binding.
- Settings/profile edit are fixed under `/my/settings` and `/my/profile/edit` for the current v1 slice.
- Admin v1 has minimum route scaffolds under `/admin` and `/admin/audit`; non-minimum operations remain deferred.
- Public marketing has a `/landing` scaffold, while `/` still redirects to `/home` until launch routing is decided.
- State fixture routes such as `/matches/empty` and `/search/error` are useful for QA but should not become user navigation destinations unless deliberately exposed.
