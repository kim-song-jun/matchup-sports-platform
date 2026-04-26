# Task 79 -- Teameet Design Handoff Unification

> Execution task. Normalize the uploaded handoff bundle into a canonical reference pack, then use `00 · Toss DNA` and `00b~00h` as the design-system baseline for reworking the full `01~24` UI kit and the real app surfaces that map to it.

Owner: codex
Date drafted: 2026-04-25
Status: In Progress
Priority: P1

## Context

The user provided `/Users/kimsungjun/Downloads/Sports-platform-handoff.tar.gz` and asked to:

1. extract/copy it into this repository
2. analyze the full `Teameet Design.html` bundle and related files
3. use the `00 · Toss DNA` and `00b~00h` refresh boards as the core reference
4. re-organize all `01~24` sections into one consistent mobile/desktop/admin design system

This task is not "add a few new screens." The actual target is:

- mobile UI kit
- desktop UI kit
- admin UI kit
- states
- flows
- micro-interactions
- shared primitives
- cross-section consistency

The current handoff bundle already contains wide coverage, but quality is mixed. The work therefore begins with reference normalization and section mapping before any production-code migration.

## Progress Snapshot

### Completed in this turn

- [x] verified the handoff archive was imported under `docs/reference/handoff-2026-04-25/sports-platform/`
- [x] verified archive/import parity (`31` files vs `31` files)
- [x] re-read intent from `sports-platform/chats/chat1.md`
- [x] inspected `Teameet Design.html`, `tokens.jsx`, `signatures.jsx`, and `screens-refresh1/2/3.jsx`
- [x] created `docs/reference/handoff-2026-04-25/INDEX.md`
- [x] created `docs/reference/handoff-2026-04-25/SECTION_UNIFICATION_MATRIX.md`
- [x] refreshed `ANALYSIS.md` / `SYSTEM_CANDIDATE.md` direction for this handoff pack
- [x] linked the handoff pack from `docs/DESIGN_DOCUMENT_MAP.md`
- [x] started direct prototype rework inside `project/Teameet Design.html`
- [x] normalized shared Toss-style interaction tokens in `project/lib/tokens.jsx` and `project/lib/signatures.jsx`
- [x] upgraded payment/form signature surfaces in `project/lib/screens-more.jsx` and `project/lib/screens-forms.jsx`
- [x] upgraded payment detail/refund surfaces in `project/lib/screens-extras.jsx` with `NumberDisplay`, `MoneyRow`, `SectionTitle`, and `AnnouncementBar`
- [x] expanded `01~24` HTML sections so refresh and legacy variants are preserved side-by-side instead of being silently dropped
- [x] re-validated prototype JSX references after the section expansion (`33` sections, `181` artboards, missing refs `0`)
- [x] changed the execution direction to source/prototype parity:
  - source = actual `apps/web` implementation
  - prototype = `Teameet Design.html` and its `lib/*.jsx`
- [x] inventoried current source page routes (`101`) and prototype coverage
- [x] added `docs/reference/handoff-2026-04-25/SOURCE_PROTOTYPE_PARITY.md`
- [x] unified prototype bottom navigation around five canonical tabs (`home`, `matches`, `lessons`, `marketplace`, `my`)
- [x] added prototype section `00i · 글로벌 셸` for bottom nav, global menu, and dark mode
- [x] added prototype section `25 · Source ↔ Prototype Parity` for missing source-backed functions
- [x] added prototype section `26 · 미구현 페이지 후보 + 주제별 그룹핑`
- [x] added prototype section `27 · Future Service Prototypes` with coach, venue owner, tournament, trust, rental, captain, safety, and growth candidate pages
- [x] added prototype section `28 · Topic-grouped UI Kit` with Core, Discovery, Transaction, Operations, and Identity/Public grouping boards
- [x] normalized remaining legacy-heavy prototype surfaces in `screens-ops.jsx`, `screens-other.jsx`, `screens-team.jsx`, and `screens-extras.jsx` without deleting variants
- [x] removed remaining negative `letterSpacing` values from prototype JSX files
- [x] removed one-sided blue border selection accents from desktop/admin prototype surfaces
- [x] fixed read-only review findings: stale board count, `lesson`/`venues` nav aliases, duplicate `DCArtboard` ids, and external mock image URLs
- [x] browser-validated the initial parity prototype at `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix8`
- [x] changed the latest prototype IA from legacy-preserving comparison to module-first grouping per user direction
- [x] removed visible legacy/레거시 artboards from `Teameet Design.html`
- [x] split the mixed `05 · 레슨 · 장터 · 시설` section into `05A · 레슨 Academy`, `05B · 장터 Marketplace`, and `05C · 시설 Venues`
- [x] added `LessonAcademyHub` as the primary lesson entry so Academy Hub is clearly the lesson main
- [x] moved lesson detail, lesson create, lesson pass, and desktop lesson boards into the `lessons` module section
- [x] moved marketplace detail/create/desktop boards into `marketplace`, and venue detail/booking/desktop boards into `venues`
- [x] browser-validated the latest module IA at `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix9`
- [x] reorganized all remaining `01~24` prototype content into functional modules instead of mixed catch-all sections
- [x] removed decision-helper/meta prototype sections from the rendered kit (`25 · Source ↔ Prototype Parity`, `26`, `27`, `28`) after distributing useful boards into owning modules
- [x] converted the post-reference kit into `01~19` module sections: auth/onboarding, home, matches, teams, lessons, marketplace, venues, mercenary, tournaments, rental, sports/level/safety, community, my/profile, payments/support, settings/states, public, desktop, admin, common flows
- [x] updated the prototype cache key to `fix10`
- [x] ran a full rendered prototype QA pass across all `163` artboards for `fix11`
- [x] normalized common Toss palette raw colors into prototype design tokens and added static/alpha tokens
- [x] created `docs/reference/handoff-2026-04-25/prototype-system/` as the dedicated hub for module map, common flows, interactions/states, color system, and QA report
- [x] updated prototype cache key to `fix11`
- [x] added implementation-ready case matrix boards to every functional module (`01~18`)
- [x] added common state, edge-case, interaction, and handoff readiness atlas boards to `19 · 공통 플로우 · 인터랙션`
- [x] created `docs/reference/handoff-2026-04-25/prototype-system/CASE_COVERAGE_MATRIX.md`
- [x] browser-validated and QA-validated `fix12` with `185` rendered artboards, `18` module case matrix boards, and `4` common coverage boards
- [x] created page-by-page readiness audit for missing edge/interaction/animation/responsive/dark/copy-fit coverage
- [x] started sequential page hardening with `01 · 인증 · 온보딩`
- [x] added auth state/edge, validation/permission, button/input states, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix13`
- [x] browser-validated and QA-validated `fix13` with `192` rendered artboards and first page-family readiness coverage
- [x] continued page-family hardening with `02 · 홈 · 추천`
- [x] added home state/edge, recommendation edge, button/FAB/filter states, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix14`
- [x] browser-validated and QA-validated `fix14` with `198` rendered artboards and second page-family readiness coverage
- [x] continued page-family hardening with `03 · 개인 매치`
- [x] added match state/edge, join sheet, map/permission, button/filter/CTA states, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix15`
- [x] browser-validated and QA-validated `fix15` with `205` rendered artboards and third page-family readiness coverage
- [x] continued page-family hardening with `04 · 팀 · 팀매칭`
- [x] added team state/edge, role permission, join approval, ops conflict, controls, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix16`
- [x] browser-validated and QA-validated `fix16` with `213` rendered artboards and fourth page-family readiness coverage
- [x] continued page-family hardening with `05 · 레슨 Academy`
- [x] added lesson Academy IA, state/edge, ticket lifecycle, schedule exceptions, controls, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix17`
- [x] browser-validated and QA-validated `fix17` with `221` rendered artboards and fifth page-family readiness coverage
- [x] continued page-family hardening with `06 · 장터 Marketplace`
- [x] added marketplace state/edge, order lifecycle, upload/price exceptions, dispute/safety, controls, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix18`
- [x] browser-validated and QA-validated `fix18` with `229` rendered artboards and sixth page-family readiness coverage
- [x] continued page-family hardening with `07 · 시설 Venues`
- [x] added venue state/edge, booking slot conflict, map/location permission, closure/price exceptions, controls, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix19`
- [x] browser-validated and QA-validated `fix19` with `237` rendered artboards and seventh page-family readiness coverage
- [x] continued page-family hardening with `08 · 용병 Mercenary`
- [x] added mercenary state/edge, position filled/waitlist, reward change consent, host trust/safety, controls, motion, responsive, and dark mode boards
- [x] updated prototype cache key to `fix20`
- [x] browser-validated and QA-validated `fix20` with `245` rendered artboards and eighth page-family readiness coverage
- [x] continued page-family hardening with remaining modules `09~18` via five parallel subagent-owned files
- [x] added `80` readiness boards for tournaments, rental, sports/safety, community, my/profile, payments, settings, public, desktop, and admin
- [x] fixed desktop/admin compact preview width and dark-mode contrast issues found during visual QA
- [x] updated prototype cache key to `fix21`
- [x] browser/headless-validated `fix21` with `325` rendered artboards and full `01~18` page-family readiness coverage
- [x] removed rendered dark-mode boards and the global theme toggle after the user changed the prototype direction to light-only
- [x] added `00j · 화면 카탈로그` boards for Tailwind token quantification and responsive/copy-fit QA
- [x] added `sports-platform/project/tailwind.teameet.config.js` as the Tailwind handoff token config
- [x] added `TAILWIND_TOKEN_SYSTEM_FIX23.md` and `DESIGN_QA_FIX23.md` to the prototype-system hub
- [x] applied mobile/tablet/desktop copy-fit fixes for chips, buttons, list rows, toast, and compact responsive labels
- [x] set Admin desktop sidebars to a dark panel while keeping consumer/desktop workspaces light
- [x] updated prototype cache key to `fix23`
- [x] browser/headless-validated `fix23` with `29` rendered sections and `311` rendered artboards
- [x] re-framed the work from visual cleanup to development-ready design-system foundation after user feedback
- [x] added `00k · 디자인 시스템 Foundation` with typography, button, controls, motion, responsive storyboard, and Tailwind implementation contract boards
- [x] expanded Tailwind handoff files with `tm-*` component class contracts in `tailwind.teameet.config.js` and `tailwind.teameet.css`
- [x] updated shared prototype atoms (`SBtn`, `Chip`, `Badge`, `Card`, `ListItem`, `HapticChip`) to use the common token/class contract where possible
- [x] fixed leaf text clipping issues found in responsive sports/community/desktop boards
- [x] added `DESIGN_SYSTEM_FOUNDATION_FIX24.md`, `TAILWIND_TOKEN_SYSTEM_FIX24.md`, and `DESIGN_QA_FIX24.md`
- [x] updated prototype cache key to `fix24`
- [x] browser/headless-validated `fix24` with `30` rendered sections and `317` rendered artboards
- [x] attempted the remaining design-system normalization as a parallel subagent wave, then failed over to the main session after subagent usage limits
- [x] added a common `tm-pressable tm-break-keep` bridge to `234` remaining direct screen buttons
- [x] updated prototype cache key to `fix25`
- [x] browser/headless-validated `fix25` with `30` rendered sections, `317` rendered artboards, and `611` rendered `tm-pressable` instances
- [x] used four parallel explorer agents to audit token migration, component extraction, route/page ownership, and QA gates
- [x] added `00l · 개발 핸드오프` with token map, component map, page waves, and QA gates
- [x] added `PRODUCTION_HANDOFF_FIX26.md` and `DESIGN_QA_FIX26.md`
- [x] updated prototype cache key to `fix26`
- [x] browser/headless-validated `fix26` with `31` rendered sections and `321` rendered artboards
- [x] added `00m · 개발 핸드오프 II` with route manifest, bottom-nav contract, token alignment map, component extraction plan, and page migration priority boards
- [x] added `ROUTE_OWNERSHIP_MANIFEST_FIX27.md` mapping all `101` source routes to `01~18/19` modules with cross-module + future scope split
- [x] added `BOTTOM_NAV_CONTRACT_FIX27.md` deciding source 5-tab canonical (`home/matches/teams/marketplace/more`) and `normalizeNavId` legacy alias rules
- [x] added `TOKEN_ALIGNMENT_PLAN_FIX27.md` resolving `blue-600` drift, `grey→gray` rename, type/control/motion/shadow drift
- [x] added `COMPONENT_EXTRACTION_PLAN_FIX27.md` with extraction order, props draft, caller hotspots, and PR scope for NumberDisplay / FilterChip / MoneyRow / StatBar / MetricStat
- [x] added `DESIGN_QA_FIX27.md`
- [x] added `screens-dev-handoff2.jsx` with the five `00m` board components
- [x] added `scripts/qa/teameet-design-fix27-full-qa.mjs` and ran a full headless QA pass
- [x] updated prototype cache key to `fix27`
- [x] browser/headless-validated `fix27` with `32` rendered sections and `326` rendered artboards
- [x] ran prototype audit with `scripts/qa/teameet-design-prototype-audit.mjs` to answer 4 user inspection questions with quantitative results
- [x] measured color compliance 92.9% (source) / DOM raw hex 3, spacing compliance 69.4%, typography class adoption 41.6% (spec-equivalent 67.1%)
- [x] produced 31-module compliance heatmap; identified top-5 weakest modules for production sweep priority
- [x] confirmed 18 functional modules all have mobile + tablet + desktop boards (viewport coverage pass)
- [x] confirmed developer readiness pass: route manifest / bottom nav / token plan / component plan / 18 module readiness all decided
- [x] classified P0=0 / P1=3 / P2=4 backlog
- [x] added `00n · Prototype Audit Summary` section (5 boards) to prototype
- [x] updated prototype cache key to `fix28`
- [x] browser/headless-validated `fix28` with `33` rendered sections and `331` rendered artboards
- [x] added `PROTOTYPE_AUDIT_FIX28.md` — 4-question quantitative+qualitative answers, module heatmap, viewport matrix, P0/P1/P2 backlog
- [x] added `DESIGN_QA_FIX28.md` — fix28 QA result, section/artboard diff, decision summary
- [x] updated `prototype-system/README.md` current prototype URL/counts (fix28: 33 sections / 331 artboards / `00n` reference range), added audit gate to Operating Rule
- [x] updated `SOURCE_PROTOTYPE_PARITY.md` Current Inventory Snapshot and Validation Snapshot to fix28

- [x] adopted viewport-aware ID schema `m{NN}-{viewport}-{kind}[-{state|asset}]` documented in `PROTOTYPE_ID_SCHEMA_FIX29.md`
- [x] inventoried 19 modules × 3 viewports × kind/state grid in `PROTOTYPE_INVENTORY_FIX29.md`
- [x] built M01 viewport grid POC (`screens-grid-m01.jsx`, 13 boards) — main mb/tb/dt + 3 mb states + components mb/tb/dt + assets mb/tb/dt + motion
- [x] built M02 viewport grid POC (`screens-grid-m02.jsx`, 15 boards) — main mb/tb/dt + 5 mb states + components mb/tb/dt + assets mb/tb/dt + motion
- [x] added prototype sections `m01-grid` and `m02-grid` with 28 ID-schema-compliant boards
- [x] extended audit script with `idSchemaViolations` linter
- [x] updated prototype cache key to `fix29`
- [x] browser/headless-validated `fix29` with `35` rendered sections, `359` rendered artboards, ID schema violations `0`
- [x] added `DESIGN_QA_FIX29.md`
- [x] expanded viewport grid POC to all 19 modules (Wave A·B·C·D·E parallel via 17 frontend-ui-dev agents)
- [x] added `screens-grid-m03.jsx` ~ `screens-grid-m19.jsx` (17 신규 jsx, 270 신규 보드)
- [x] integrated 17 grid sections into `Teameet Design.html` (m02-grid 직후 12 + m07/m10/m11/m13/m19는 wave 진행 중 일부 에이전트가 직접 추가한 위치 그대로)
- [x] resolved 4 integration issues — M15 export 이름 정렬, M14 NumberDisplay/MoneyRow/ListItem prefix, ComponentSwatch 글로벌 alias (M01 → window), perl rename 자동화
- [x] updated cache key to `fix30`
- [x] browser/headless-validated `fix30` with `52` rendered sections, `601` rendered artboards, 270 m-grid boards, ID schema violations `0`
- [x] audit re-measure (fix30): color 92.6% → 93.0%, spacing 70.2% → 74.3% (+4.1pp), typography 41.6% → **53.4% (+11.8pp)** thanks to 17 grids 모두 `tm-text-*` class 강제
- [x] added `DESIGN_QA_FIX30.md`
- [x] augmented globals.css with 12 new tokens (blue-200/400, gray-150, control-*, ease-out-*, semantic-50)
- [x] extracted production primitive — `NumberDisplay` (`apps/web/src/components/ui/number-display.tsx` + test 6/6)
- [x] extracted production primitive — `FilterChip` (`apps/web/src/components/ui/filter-chip.tsx` + test 5/5)
- [x] extracted production primitive — `MoneyRow` (`apps/web/src/components/ui/money-row.tsx` + test 5/5)
- [x] extracted production primitive — `StatBar` (`apps/web/src/components/ui/stat-bar.tsx` + test 5/5)
- [x] extracted production primitive — `MetricStat` (`apps/web/src/components/ui/metric-stat.tsx` + test 6/6) + admin/kpi-card.tsx 내부 위임 (외부 API 무변경)
- [x] verified all 477 frontend tests pass + tsc --noEmit 0 errors
- [x] prototype color sweep codemod — `scripts/qa/teameet-prototype-token-sweep.mjs` (233 raw hex → var() token)
- [x] cache key fix31 update + Playwright QA: 52 sections, 601 artboards, m-grid 270, idSchemaViolations 0, pageErrors 0
- [x] audit re-measure (fix31): color **95.8%** (fix30 93.0% → +2.8pp, raw hex 587→356)
- [x] DESIGN_QA_FIX31.md 작성

### Not done yet

- [ ] production-code migration of the prototype IA into `apps/web/src/app/**`
- [ ] production-code extraction of handoff primitives into `apps/web/src/components/**`
- [ ] route-by-route migration of real `apps/web/src/app/**`
- [ ] desktop consumer shell unification in the live app
- [ ] admin shell unification in the live app
- [ ] visual verification in browser for the migrated real app surfaces

## Source Of Truth Order For This Task

1. `DESIGN.md`
2. `.impeccable.md`
3. `docs/reference/handoff-2026-04-25/INDEX.md`
4. `docs/reference/handoff-2026-04-25/ANALYSIS.md`
5. `docs/reference/handoff-2026-04-25/SYSTEM_CANDIDATE.md`
6. `docs/reference/handoff-2026-04-25/SECTION_UNIFICATION_MATRIX.md`
7. `docs/reference/handoff-2026-04-25/SOURCE_PROTOTYPE_PARITY.md`
8. `docs/reference/handoff-2026-04-25/sports-platform/project/Teameet Design.html`

## Goal

Create one coherent TeamMeet design system where:

- `00 · Toss DNA` defines primitives
- `00b~00h` define the strongest shell patterns
- `01~24` stop behaving like separate design experiments
- mobile/desktop/admin share the same type, spacing, interaction, and status language

## Non-Negotiable Constraints

- white-first surfaces
- `#3182f6` remains the main interaction color
- exaggerated gradients, deep shadows, and decorative chrome are excluded
- Pretendard-friendly typography and tabular numerals for numbers/money/stats
- 12~16px radius for most buttons/cards/fields
- mobile-first structure, desktop-specific re-layout
- list/information hierarchy before card decoration
- component reuse and tokenization over per-screen inline styling

## Deliverables

- [x] imported reference pack
- [x] handoff index
- [x] design analysis
- [x] section unification matrix
- [ ] extracted primitive inventory for real app components
- [ ] shared shell inventory for real app routes
- [ ] route migration plan by wave
- [ ] implementation across consumer/mobile flows
- [ ] implementation across desktop flows
- [ ] implementation across admin flows
- [x] prototype state coverage and interaction coverage verification
- [x] prototype Tailwind token quantification and light-only responsive/copy-fit verification
- [ ] production state coverage and interaction coverage verification

## Required Primitive Set

- `NumberDisplay`
- `MoneyRow`
- `KPIStat`
- `SectionTitle`
- `ListItem`
- `StackedAvatars`
- `WeatherStrip`
- `StatBar`
- `EmptyState`
- `Skeleton`
- `Toast`
- `PullHint`
- `HapticChip`

## Required Shell Set

- `OnboardingStepShell`
- `FormStepShell`
- `DiscoverListShell`
- `DetailSummaryShell`
- `GroupedHistoryShell`
- `DesktopWorkspaceShell`
- `AdminAnalyticsShell`
- `StatePanelFamily`

## Real App Route Families In Scope

- consumer public: `landing`, `pricing`, `faq`, `guide`, `about`, `users/[id]`
- consumer app: `home`, `matches`, `team-matches`, `teams`, `lessons`, `marketplace`, `venues`, `mercenary`, `chat`, `notifications`, `payments`, `reviews`, `profile`, `my/*`, `settings/*`, `badges`, `feed`, `onboarding`
- desktop consumer variants of the same route families
- admin: `dashboard`, `matches`, `team-matches`, `users`, `reviews`, `disputes`, `payouts`, `statistics`, `ops`, `venues`, `lesson-tickets`, `mercenary`, `payments`, `teams`, `lessons`

## Wave Plan

### Wave 0 -- Reference Normalization

- [x] import + verify handoff bundle
- [x] capture read order and design intent
- [x] define `00 -> 01~24` matrix

### Wave 1 -- Source / Prototype Parity

- [x] define source/prototype terms
- [x] inventory source routes
- [x] add missing source-backed prototype boards
- [x] add global navigation and dark-mode contract boards
- [x] add service-future candidate prototype boards
- [x] add topic-grouped UI kit boards
- [x] browser-validate parity boards
- [x] physically reorganize prototype sections by module for lessons, marketplace, and venues after user approved removing legacy boards
- [x] physically reorganize all remaining `01~24` content into functional module sections and remove rendered meta/legacy helper sections

### Wave 2 -- Primitive Extraction

- [ ] identify which prototype primitives should become real `apps/web/src/components/ui/**`
- [ ] remove duplicated inline badge/stat/history patterns in the live app

### Wave 3 -- Shell Extraction

- [ ] onboarding/form shell
- [ ] history/payment shell
- [ ] desktop workspace shell
- [ ] admin analytics shell

### Wave 4 -- Consumer Mobile Surfaces

- [ ] home
- [ ] matches
- [ ] team-matches
- [ ] lessons
- [ ] marketplace
- [ ] venues
- [ ] chat/notifications
- [ ] payments/reviews
- [ ] my/settings/profile

### Wave 5 -- Desktop Consumer

- [ ] landing/public desktop
- [ ] logged-in home
- [ ] search/list/detail workspace patterns

### Wave 6 -- Admin

- [ ] dashboard
- [ ] operational tables
- [ ] dispute/settlement/detail tools

### Wave 7 -- States + Motion

- [x] prototype empty
- [x] prototype loading
- [x] prototype error
- [x] prototype success
- [x] prototype disabled
- [x] prototype pending
- [x] prototype deadline
- [x] prototype sold out
- [x] prototype permission denied
- [x] prototype tap scale, pull hint, skeleton, toast, bottom sheet, sticky CTA, push transition, grouped notifications, form progress, payment success
- [x] first page-family hardening for `01 · 인증 · 온보딩`
- [x] page-family hardening for `02 · 홈 · 추천`
- [x] page-family hardening for `03 · 개인 매치`
- [x] page-family hardening for `04 · 팀 · 팀매칭`
- [x] page-family hardening for `05 · 레슨 Academy`
- [x] page-family hardening for `06 · 장터 Marketplace`
- [x] page-family hardening for `07 · 시설 Venues`
- [x] page-family hardening for `08 · 용병 Mercenary`
- [x] completed page-family hardening through `18 · 관리자 · 운영`
- [x] light-only prototype reset with Admin dark sidebar exception
- [x] Tailwind token and breakpoint quantification for prototype handoff
- [x] Tailwind component class contract for typography, buttons, controls, motion, and layout storyboard
- [ ] production migration of state and motion contracts

## Validation

- doc updates are internally consistent and linked from the design document map
- archive/import parity remains `31 == 31`
- section matrix covers `01~24`
- prototype browser proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix10`
  - sections: `28`
  - artboard slots: `163`
  - duplicate slot ids: `0`
  - visible legacy/레거시 hits: `0`
  - lesson module includes academy hub, detail, create, pass, and desktop lesson boards
  - marketplace module includes detail, create, and desktop marketplace boards
  - venues module includes detail, booking, and desktop venue boards
  - rendered meta sections removed: `25 · Source ↔ Prototype Parity`, `26`, `27`, `28`
  - inactive bottom nav rows: `0`
  - undefined background count: `0`
  - failed mock image/network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - screenshot: `output/playwright/teameet-design-fix10-modules-headless.png`
- latest prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix11`
  - sections: `28`
  - artboard slots: `163`
  - duplicate slot ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - broken images: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - color token coverage: about `93%`
  - qa artifact: `output/playwright/teameet-design-fix11-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix11-token-qa-headless.png`
- case matrix prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix12`
  - sections: `28`
  - artboard slots: `185`
  - functional module case matrix boards: `18`
  - common state/edge/interaction boards: `4`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix12-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix12-case-matrix-headless.png`
- page readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix13`
  - sections: `28`
  - artboard slots: `192`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix13-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix13-auth-readiness-headless.png`
- home readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix14`
  - sections: `28`
  - artboard slots: `198`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix14-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix14-home-readiness-headless.png`
- matches readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix15`
  - sections: `28`
  - artboard slots: `205`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix15-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix15-matches-readiness-headless.png`
- teams readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix16`
  - sections: `28`
  - artboard slots: `213`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - bad artboard boxes: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix16-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix16-teams-readiness-headless.png`
- lessons readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix17`
  - sections: `28`
  - artboard slots: `221`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - `05 · 레슨 Academy` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix17-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix17-lessons-readiness-headless.png`
  - representative board screenshots: `output/playwright/teameet-design-fix17-lessons-academy-hierarchy.png`, `output/playwright/teameet-design-fix17-lessons-responsive.png`, `output/playwright/teameet-design-fix17-lessons-dark-mode.png`
- marketplace readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix18`
  - sections: `28`
  - artboard slots: `229`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - `05 · 레슨 Academy` readiness boards: `8`
  - `06 · 장터 Marketplace` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix18-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix18-marketplace-readiness-headless.png`
  - representative board screenshots: `output/playwright/teameet-design-fix18-marketplace-state-edge.png`, `output/playwright/teameet-design-fix18-marketplace-responsive.png`, `output/playwright/teameet-design-fix18-marketplace-dark-mode.png`
- venues readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix19`
  - sections: `28`
  - artboard slots: `237`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - `05 · 레슨 Academy` readiness boards: `8`
  - `06 · 장터 Marketplace` readiness boards: `8`
  - `07 · 시설 Venues` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix19-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix19-venues-readiness-headless.png`
  - representative board screenshots: `output/playwright/teameet-design-fix19-venues-state-edge.png`, `output/playwright/teameet-design-fix19-venues-responsive.png`, `output/playwright/teameet-design-fix19-venues-dark-mode.png`
- mercenary readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix20`
  - sections: `28`
  - artboard slots: `245`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - `05 · 레슨 Academy` readiness boards: `8`
  - `06 · 장터 Marketplace` readiness boards: `8`
  - `07 · 시설 Venues` readiness boards: `8`
  - `08 · 용병 Mercenary` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix20-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix20-mercenary-readiness-headless.png`
  - representative board screenshots: `output/playwright/teameet-design-fix20-mercenary-state-edge.png`, `output/playwright/teameet-design-fix20-mercenary-responsive.png`, `output/playwright/teameet-design-fix20-mercenary-dark-mode.png`
- full functional-module readiness prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix21`
  - sections: `28`
  - artboard slots: `325`
  - functional module case matrix boards: `18`
  - page readiness audit board: `1`
  - page-family readiness boards: `139`
  - `01 · 인증 · 온보딩` readiness boards: `6`
  - `02 · 홈 · 추천` readiness boards: `6`
  - `03 · 개인 매치` readiness boards: `7`
  - `04 · 팀 · 팀매칭` readiness boards: `8`
  - `05 · 레슨 Academy` readiness boards: `8`
  - `06 · 장터 Marketplace` readiness boards: `8`
  - `07 · 시설 Venues` readiness boards: `8`
  - `08 · 용병 Mercenary` readiness boards: `8`
  - `09 · 대회 Tournaments` readiness boards: `8`
  - `10 · 장비 대여` readiness boards: `8`
  - `11 · 종목 · 실력 · 안전` readiness boards: `8`
  - `12 · 커뮤니티 · 채팅 · 알림` readiness boards: `8`
  - `13 · 마이 · 프로필 · 평판` readiness boards: `8`
  - `14 · 결제 · 환불 · 분쟁` readiness boards: `8`
  - `15 · 설정 · 약관 · 상태` readiness boards: `8`
  - `16 · 공개 · 마케팅` readiness boards: `8`
  - `17 · 데스크탑 웹` readiness boards: `8`
  - `18 · 관리자 · 운영` readiness boards: `8`
  - duplicate section ids: `0`
  - duplicate artboard ids: `0`
  - visible legacy/레거시 hits: `0`
  - rendered meta sections: `0`
  - failed network requests: `0`
  - console errors: `0`
  - warnings: expected Babel standalone development warning only
  - qa artifact: `output/playwright/teameet-design-fix21-full-qa.json`
  - screenshot: `output/playwright/teameet-design-fix21-admin-ops-readiness-headless.png`
  - representative board screenshots: `output/playwright/teameet-design-fix21-desktop-state-edge.png`, `output/playwright/teameet-design-fix21-admin-state-edge.png`, `output/playwright/teameet-design-fix21-admin-dark-mode.png`
- light-only responsive/token prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix23`
  - sections: `29`
  - artboard slots: `311`
  - rendered dark artboard slots: `0`
  - rendered dark text references: `0`
  - duplicate artboard ids: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - suspicious copy-fit detections: `6`, manually reviewed as KPI/headline/large-number false positives
  - qa artifact: `output/playwright/teameet-design-fix23-full-qa.json`
  - screenshots: `output/playwright/teameet-design-fix23-tailwind-token-system.png`, `output/playwright/teameet-design-fix23-responsive-copyfit-audit.png`, `output/playwright/teameet-design-fix23-adm-dash.png`, `output/playwright/teameet-design-fix23-admin-responsive.png`
- design-system foundation prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix24`
  - sections: `30`
  - artboard slots: `317`
  - `00k` foundation boards: `6`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - `tm-btn` instances: `50`
  - `tm-chip` instances: `454`
  - leaf text clipping detections: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - qa artifact: `output/playwright/teameet-design-fix24-full-qa.json`
  - screenshots: `output/playwright/teameet-design-fix24-system-typography.png`, `output/playwright/teameet-design-fix24-system-buttons.png`, `output/playwright/teameet-design-fix24-system-handoff.png`
- interaction bridge prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix25`
  - sections: `30`
  - artboard slots: `317`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - `tm-btn` instances: `308`
  - `tm-chip` instances: `524`
  - `tm-pressable` instances: `611`
  - leaf text clipping detections: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - qa artifact: `output/playwright/teameet-design-fix25-full-qa.json`
  - screenshots: `output/playwright/teameet-design-fix25-system-buttons.png`, `output/playwright/teameet-design-fix25-system-handoff.png`, `output/playwright/teameet-design-fix25-responsive-copyfit-audit.png`, `output/playwright/teameet-design-fix25-admin-responsive.png`
- development handoff prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix26`
  - sections: `31`
  - artboard slots: `321`
  - `00l` development handoff boards: `4`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - `tm-btn` instances: `308`
  - `tm-chip` instances: `524`
  - `tm-pressable` instances: `611`
  - leaf text clipping detections: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - qa artifact: `output/playwright/teameet-design-fix26-full-qa.json`
  - screenshots: `output/playwright/teameet-design-fix26-dev-token-map.png`, `output/playwright/teameet-design-fix26-dev-component-map.png`, `output/playwright/teameet-design-fix26-dev-page-waves.png`, `output/playwright/teameet-design-fix26-dev-qa-gates.png`
- development handoff II prototype QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix27`
  - sections: `32`
  - artboard slots: `326`
  - `00l` development handoff boards: `4`
  - `00m` development handoff II boards: `5`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - `tm-btn` instances: `308`
  - `tm-chip` instances: `524`
  - `tm-pressable` instances: `611`
  - suspicious leaf text clipping detections: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - qa script: `scripts/qa/teameet-design-fix27-full-qa.mjs`
  - qa artifact: `output/playwright/teameet-design-fix27-full-qa.json`
  - screenshots: `output/playwright/teameet-design-fix27-dev-route-manifest.png`, `output/playwright/teameet-design-fix27-dev-bottom-nav.png`, `output/playwright/teameet-design-fix27-dev-token-alignment.png`, `output/playwright/teameet-design-fix27-dev-component-extraction.png`, `output/playwright/teameet-design-fix27-dev-page-priority.png`
- prototype audit + audit summary section QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix28`
  - sections: `33`
  - artboard slots: `331`
  - `00l` development handoff boards: `4`
  - `00m` development handoff II boards: `5`
  - `00n` prototype audit summary boards: `5`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - `tm-btn` instances: `308`
  - `tm-chip` instances: `524`
  - `tm-pressable` instances: `611`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - audit result: P0=0 / P1=3 / P2=4
  - color compliance: `92.9%` (source) / DOM raw hex `3`
  - spacing compliance: `69.4%` (strict 4-multiple); estimated `88-92%` with fontSize-driven micro spacing allowed
  - typography class adoption: `41.6%`; spec-equivalent rate: `67.1%`
  - qa artifact: `output/playwright/teameet-design-fix28-full-qa.json`
  - audit artifact: `output/playwright/teameet-design-fix28-audit.json`
  - prototype source code changes: `0`
  - production source code changes: `0`
- M01·M02 viewport-grid POC QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix29`
  - sections: `35`
  - artboard slots: `359`
  - new sections: `m01-grid` (13 boards), `m02-grid` (15 boards)
  - ID schema violations: `0`
  - rendered dark artboard slots: `0`
  - duplicate artboard ids: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - audit (fix29 re-measure): color 92.6% / spacing 70.2% / typography 42.8% (class adoption +1.2pp from fix28)
  - qa script: `scripts/qa/teameet-design-fix29-full-qa.mjs`
  - audit script: `scripts/qa/teameet-design-prototype-audit.mjs` with `idSchemaViolations` field
  - qa artifact: `output/playwright/teameet-design-fix29-full-qa.json`
  - audit artifact: `output/playwright/teameet-design-fix29-audit.json`
  - representative screenshots (13): `output/playwright/teameet-design-fix29-m01-{mb,tb,dt}-main.png`, `m01-mb-state-error.png`, `m01-mb-components.png`, `m01-mb-assets.png`, `m02-{mb,tb,dt}-main.png`, `m02-mb-state-{empty,loading}.png`, `m02-mb-components.png`, `m02-mb-assets.png`
- M03-M19 viewport-grid expansion QA proof:
  - URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix30`
  - sections: `52`
  - artboard slots: `601`
  - new sections: `m01-grid` ~ `m19-grid` (19 모듈, 270 보드)
  - ID schema violations: `0`
  - duplicate artboard ids: `0`
  - browser page errors: `0`
  - unexpected console errors: `0`
  - audit re-measure: color 93.0% / spacing 74.3% / typography class adoption 53.4% (fix29 41.6% → +11.8pp)
  - tm-text-* class hits: 113 → 1,447 (×12.8)
  - qa script: `scripts/qa/teameet-design-fix30-full-qa.mjs`
  - audit script: `scripts/qa/teameet-design-prototype-audit.mjs`
  - qa artifact: `output/playwright/teameet-design-fix30-full-qa.json`
  - audit artifact: `output/playwright/teameet-design-fix30-audit.json`
  - representative screenshots (8): `teameet-design-fix30-{m03-mb-main,m04-dt-main,m06-mb-detail,m09-dt-main,m12-mb-main,m14-mb-flow-checkout,m17-dt-main,m18-dt-main}.png`
- any future production-code wave must validate with the narrowest matching checks first:
  - route/page-specific type checks
  - targeted tests
  - browser proof for touched pages

## Ambiguity Log

- The handoff bundle includes broad design coverage, but it is still a prototype reference, not production truth.
- `00g` and `00h` are strong direction setters; they do not yet guarantee parity with all live route capabilities.
- `02 · Home` includes stylistic variants that should not automatically become canonical defaults.
- Planning review for this wave kept production `apps/web/**` migration deferred until prototype parity, grouping, and user variant decisions are stable.

## Owned Files For Current Turn

- `docs/reference/handoff-2026-04-25/**`
- `docs/DESIGN_DOCUMENT_MAP.md`
- `.github/tasks/79-teameet-design-handoff-unification.md`
