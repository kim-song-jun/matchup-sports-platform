# Source / Prototype Parity Plan

## Terms

- **source**: 실제 `apps/web` 소스코드에 구현된 route, layout, state, interaction.
- **prototype**: `docs/reference/handoff-2026-04-25/sports-platform/project/Teameet Design.html`과 그 `lib/*.jsx` 화면.

## New Direction

Prototype 개선의 우선순위를 `00` 계열 디자인 품질만이 아니라 source parity로 바꾼다.

1. source에 실제 구현된 기능과 route를 먼저 inventory로 본다.
2. prototype에 없는 기능은 prototype에 먼저 추가한다.
3. global navigation, menu, light-only shell, admin shell처럼 서비스 전체에 걸친 시스템 화면을 prototype의 상위 기준으로 올린다.
4. 현재 prototype은 module-first IA를 기준으로 정리한다. 의미 있는 variant는 기능 모듈 안에 유지하되, 사용자가 제거를 허용한 visible legacy/레거시 artboard는 삭제한다.
5. source에도 아직 없는 서비스 필수 화면은 future page 후보로 따로 둔다.

## Current Inventory Snapshot

- source page routes: `101`
- prototype sections after full module grouping, foundation expansion, dev handoff I/II, prototype audit summary, and M01~M19 viewport-grid sections (19 모듈 풀 grid): `52`
- prototype artboards after visible legacy/meta removal, case matrix expansion, full `01~18` page readiness wave, light-only reset, Tailwind token catalog, design-system foundation, dev handoff I/II, prototype audit summary, and M01~M19 viewport × kind grid (270 m-grid boards covering main / detail / create / state / flow / components / assets / motion per module): `601`
- prototype system docs: `prototype-system/README.md`
- production-ready handoff docs: `prototype-system/ROUTE_OWNERSHIP_MANIFEST_FIX27.md`, `prototype-system/BOTTOM_NAV_CONTRACT_FIX27.md`, `prototype-system/TOKEN_ALIGNMENT_PLAN_FIX27.md`, `prototype-system/COMPONENT_EXTRACTION_PLAN_FIX27.md`
- audit docs: `prototype-system/PROTOTYPE_AUDIT_FIX28.md`, `prototype-system/DESIGN_QA_FIX28.md`
- ID schema docs: `prototype-system/PROTOTYPE_ID_SCHEMA_FIX29.md`, `prototype-system/PROTOTYPE_INVENTORY_FIX29.md`, `prototype-system/DESIGN_QA_FIX29.md`, `prototype-system/DESIGN_QA_FIX30.md`

## Source Route Groups

| Group | Source route examples | Prototype action |
|---|---|---|
| Public / Auth | `/`, `/landing`, `/about`, `/guide`, `/pricing`, `/faq`, `/login`, `/callback/kakao`, `/callback/naver`, `/users/[id]`, `/user/[id]` | OAuth callback states and public grouping added |
| Core Play | `/home`, `/onboarding`, `/matches`, `/matches/[id]`, `/matches/new`, `/matches/[id]/edit`, `/team-matches/*` | edit flow parity and global shell added |
| Commerce / Booking | `/lessons/*`, `/marketplace/*`, `/marketplace/orders/[id]`, `/venues/*` | split into module sections; detail/create/desktop/order/owner boards now live inside each owning module |
| Community / My | `/chat/*`, `/notifications`, `/feed`, `/reviews`, `/badges`, `/profile`, `/my/*` | expanded my routes and legal/settings parity added |
| Admin | `/admin/dashboard`, `/admin/matches/*`, `/admin/team-matches/*`, `/admin/users/*`, `/admin/teams/*`, `/admin/lessons/*`, `/admin/venues/*`, `/admin/payments`, `/admin/payouts`, `/admin/settlements`, `/admin/disputes/*`, `/admin/reviews`, `/admin/statistics`, `/admin/ops`, `/admin/lesson-tickets`, `/admin/mercenary` | admin route parity and detail toolkit added |

## Prototype Additions

### `00i · 글로벌 셸`

- `GlobalNavigationSystem`: bottom nav canonical 5 tabs.
- `GlobalMenuSystem`: non-tab routes grouped into menu topics.
- `GlobalLightShellSystem`: light-only navigation and menu contract for consumer surfaces.

### `00k · 디자인 시스템 Foundation`

- `TypographyFoundationBoard`: 9단계 type scale과 tabular number 기준.
- `ButtonActionSystemBoard`: `tm-btn` size/variant/state matrix.
- `ControlFoundationBoard`: chip, input, list row, card 공통 규격.
- `MotionInteractionSystemBoard`: tap, enter, sheet, skeleton, reduced motion 기준.
- `LayoutSpacingSystemBoard`: mobile/tablet/desktop 재배치 storyboard.
- `TailwindImplementationContractBoard`: Tailwind class usage와 Do/Do not 구현 계약.

### Source parity boards distributed into modules

- `AuthCallbackStates` -> `01 · 인증 · 온보딩`
- `EditFlowParity` -> `19 · 공통 플로우 · 인터랙션`
- `MarketplaceOrderStatus` -> `06 · 장터 Marketplace`
- `SettingsLegalPages` -> `15 · 설정 · 약관 · 상태`
- `MyExpandedCoverage` -> `13 · 마이 · 프로필 · 평판`
- `AdminDetailToolkit` -> `18 · 관리자 · 운영`
- Rendered meta boards such as `SourcePrototypeParityMap` and `AdminSourceParity` were removed from the visual kit.

### Future service boards distributed into modules

- `CoachWorkspace` -> `05 · 레슨 Academy`
- `VenueOwnerConsole` -> `07 · 시설 Venues`
- `TournamentOps` -> `09 · 대회 Tournaments`
- `TrustCenter` -> `14 · 결제 · 환불 · 분쟁`
- `RentalOperations` -> `10 · 장비 대여`
- `TeamCaptainTools` -> `04 · 팀 · 팀매칭`
- `SafetyChecks` -> `11 · 종목 · 실력 · 안전`
- `GrowthExperiments` -> `02 · 홈 · 추천`
- Rendered planning boards such as `FuturePageBacklog`, `PrototypeTopicGrouping`, and `Grouped*` were removed from the visual kit.

### Module-first physical grouping

- `01 · 인증 · 온보딩`: login, OAuth callback, onboarding steps, welcome.
- `02 · 홈 · 추천`: canonical home variants, widgets, recommendation/Invite surface.
- `03 · 개인 매치`: match list variants, detail, join sheet, create, my matches.
- `04 · 팀 · 팀매칭`: team matching, team profile, team creation, join request, booking, attendance, score, evaluation, captain tools.
- `05 · 레슨 Academy`: `LessonAcademyHub` is the lesson main, followed by lesson list, coach search, lesson detail, lesson create, lesson pass, my tickets, coach workspace, and desktop lesson boards.
- `06 · 장터 Marketplace`: marketplace list/trending/catalog, listing detail, listing create, order status, my listings, and desktop marketplace boards are grouped together.
- `07 · 시설 Venues`: venue list/map/week, venue detail, venue booking, venue owner console, and desktop venue boards are grouped together.
- `08~19`: mercenary, tournaments, rental, sports/level/safety, community, my/profile, payments/support, settings/states, public, desktop, admin, and common flows.
- The generic `09 · 상세 (고도화)` section was removed so detail screens belong to their owning module.
- Visible legacy/레거시 artboards and meta planning sections were removed from the rendered prototype; non-legacy variants remain inside their module or route-family sections.

### Case coverage matrix boards

`fix12` adds implementation-ready case boards to every functional module:

- `01~18` each end with a `... · 케이스 매트릭스` board.
- Each matrix includes route refs, owning shell, 핵심 flow, required states, edge cases, and interaction contract.
- `19 · 공통 플로우 · 인터랙션` adds `state-coverage-atlas`, `edge-case-gallery`, `interaction-flow-atlas`, and `handoff-readiness-matrix`.

These boards are the handoff contract for cases that are not fully visible in the happy-path screens.

### Page readiness waves

`fix13` starts the slower page-by-page readiness pass requested by the user:

- `19 · 공통 플로우 · 인터랙션` includes `page-readiness-audit`.
- `01 · 인증 · 온보딩` includes actual UI boards for state/edge, validation/permission, button/input states, motion contract, and responsive/copy-fit comparison.

`fix14` continues the same pass:

- `02 · 홈 · 추천` includes actual UI boards for loading/empty/error/offline/stale/pending recommendation states.
- It adds recommendation edge cases for missing location, blocked content, stale recommendations, invite attribution delay, and notification permission off.
- It adds filter/FAB/widget/button states, motion contract, and responsive/copy-fit comparison.

`fix15` continues the same pass:

- `03 · 개인 매치` includes actual UI boards for loading, empty, deadline, sold out, permission, and payment failure states.
- It adds join bottom sheet states for confirm, capacity race, duplicate application, pending approval, and payment failure.
- It adds map/location permission edge cases, button/filter/sticky CTA states, motion contract, and responsive/copy-fit comparison.

`fix16` continues the same pass:

- `04 · 팀 · 팀매칭` includes actual UI boards for pending, approved, rejected, permission, booking conflict, and cancelled states.
- It adds role permission matrix, join approval/rejection flow, attendance/score operations conflict, team controls, motion contract, and responsive/copy-fit comparison.

`fix17` continues the same pass:

- `05 · 레슨 Academy` includes Academy Hub hierarchy, lesson state/edge, ticket lifecycle, schedule exception, and reservation/purchase control boards.
- It adds lesson-specific motion contract and responsive/copy-fit comparison.

`fix18` continues the same pass:

- `06 · 장터 Marketplace` includes marketplace state/edge, order lifecycle, upload/price edge, dispute/safety, and filter/offer/CTA control boards.
- It adds marketplace-specific motion contract and responsive/copy-fit comparison.

`fix19` continues the same pass:

- `07 · 시설 Venues` includes venue state/edge, booking slot conflict, map/location permission, closure/price edge, and filter/date/slot control boards.
- It adds venue-specific motion contract and responsive/copy-fit comparison.
- Remaining modules are intentionally marked not ready until they receive the same treatment.

`fix20` continues the same pass:

- `08 · 용병 Mercenary` includes mercenary state/edge, position filled/waitlist, reward change consent, host trust/safety, and apply/cancel/confirm control boards.
- It adds mercenary-specific motion contract and responsive/copy-fit comparison.

`fix21` completes the same pass for the remaining modules in a parallel wave:

- `09 · 대회 Tournaments` includes tournament state/edge, bracket conflict, result dispute, payout account, controls, motion, and responsive/copy-fit boards.
- `10 · 장비 대여` includes rental state/edge, pickup/return, deposit/damage, inventory conflict, controls, motion, and responsive/copy-fit boards.
- `11 · 종목 · 실력 · 안전` includes capability states, verification rejection, equipment/safety, privacy display, controls, motion, and responsive/copy-fit boards.
- `12 · 커뮤니티 · 채팅 · 알림` includes message failure, blocked user, notification race, controls, motion, and responsive/copy-fit boards.
- `13 · 마이 · 프로필 · 평판` includes profile state/edge, upload error, privacy/trust, badge/review, controls, motion, and responsive/copy-fit boards.
- `14 · 결제 · 환불 · 분쟁` includes payment state/edge, pending/failed, refund edge, receipt/settlement, controls, motion, and responsive/copy-fit boards.
- `15 · 설정 · 약관 · 상태` includes OS permission, destructive confirm, legal versioning, controls, motion, and responsive/copy-fit boards.
- `16 · 공개 · 마케팅` includes logged-out limits, private profile, FAQ/pricing edge, controls, motion, and responsive/copy-fit boards.
- `17 · 데스크탑 웹` includes desktop state/edge, keyboard focus, side panel, table overflow, controls, motion, and responsive/copy-fit boards.
- `18 · 관리자 · 운영` includes admin state/edge, bulk partial failure, concurrent processing, audit recovery, controls, motion, responsive/copy-fit boards, and the dark sidebar exception.

## Global Navigation Contract

Bottom navigation canonical (decided in `fix27`, aligned with `apps/web/src/components/layout/bottom-nav.tsx`):

1. `home`
2. `matches`
3. `teams`
4. `marketplace`
5. `more` (sheet — matching / explore / communication / activity / service)

Legacy prototype aliases are normalized via `normalizeNavId`:

- `match` -> `matches`
- `market` -> `marketplace`
- `lessons` / `lesson_tab` -> `more` (legacy variant boards stay rendered, captioned `legacy`)
- `my` / `mypage` -> `more`
- `venue` / `venues` -> `more`
- `team_match` -> `teams`
- `chat` -> `more`

Chat, notifications, settings, profile, feed, reviews, badges, payments, lessons, tournaments, venues, mercenary, and team-matches belong inside the `more` sheet or contextual entry points, not the bottom nav.

Detailed contract: `prototype-system/BOTTOM_NAV_CONTRACT_FIX27.md`.

## Remaining Work

- Continue production-code migration after the prototype IA stabilizes.
- Upgrade the newly added parity boards from coverage-level fidelity to full visual fidelity where needed.
- Add detailed per-route source/prototype diff once production migration begins.
- Browser-check the updated prototype after every new prototype wave.

## Validation Snapshot

- Browser URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix30`
- Browser title: `Teameet — Design Review`
- Runtime sections: `52`
- Runtime artboard slots: `601`
- ID schema full coverage: M01~M19 = 270 viewport-grid boards (violations 0)
- audit (fix30): color 93.0% / spacing 74.3% / typography class 53.4% (fix29 → fix30: typo +11.8pp)
- Duplicate artboard slot ids: `0`
- Visible legacy/레거시 text hits: `0`
- Rendered meta sections: `0`
- Rendered dark artboard slots: `0`
- Admin dark sidebar references: `2`
- fix28 audit result: P0=0 / P1=3 / P2=4 (detail: `prototype-system/PROTOTYPE_AUDIT_FIX28.md`)
- Functional module case matrix boards: `18`
- Common state/edge/interaction boards: `4`
- Page readiness audit board: `1`
- Page-family readiness boards: `121`
  - `01 · 인증 · 온보딩`: `6`
  - `02 · 홈 · 추천`: `6`
  - `03 · 개인 매치`: `7`
  - `04 · 팀 · 팀매칭`: `8`
  - `05 · 레슨 Academy`: `8`
  - `06 · 장터 Marketplace`: `8`
  - `07 · 시설 Venues`: `8`
  - `08 · 용병 Mercenary`: `8`
  - `09 · 대회 Tournaments`: `8`
  - `10 · 장비 대여`: `8`
  - `11 · 종목 · 실력 · 안전`: `8`
  - `12 · 커뮤니티 · 채팅 · 알림`: `8`
  - `13 · 마이 · 프로필 · 평판`: `8`
  - `14 · 결제 · 환불 · 분쟁`: `8`
  - `15 · 설정 · 약관 · 상태`: `8`
  - `16 · 공개 · 마케팅`: `8`
  - `17 · 데스크탑 웹`: `8`
  - `18 · 관리자 · 운영`: `8`
- `lessons` contains academy hub, lesson detail, lesson create, lesson pass, desktop lesson boards, and lesson-specific readiness boards.
- `marketplace` contains listing detail, listing create, desktop marketplace boards, and marketplace-specific readiness boards.
- `venues` contains venue detail, venue booking, desktop venue boards, and venue-specific readiness boards.
- `mercenary` contains mercenary detail, create, case matrix, and mercenary-specific readiness boards.
- `tournaments` through `admin-ops` contain case matrix plus module-specific readiness boards for state, edge, controls, motion, and responsive/copy-fit coverage.
- Bottom navigation inactive rows: `0`
- Undefined background images: `0`
- Failed image/network requests from prototype mock catalog: `0`
- Console errors: `0`
- Console warnings: only the expected Babel standalone development warning
- New section checks: `01~19` are module-first sections; old rendered `25~28` helper sections are removed.
- Prototype mock images are served from `project/assets/mock/**` instead of Unsplash/pravatar runtime URLs.
- Color token normalization: about `93%` of prototype color references are token/variable backed after `fix11`.
- Full QA artifact (fix27): `output/playwright/teameet-design-fix27-full-qa.json`
- Full QA artifact (fix28): `output/playwright/teameet-design-fix28-full-qa.json`
- Audit artifact (fix28): `output/playwright/teameet-design-fix28-audit.json`
- Representative screenshots (fix27): `output/playwright/teameet-design-fix27-dev-route-manifest.png`, `output/playwright/teameet-design-fix27-dev-bottom-nav.png`, `output/playwright/teameet-design-fix27-dev-token-alignment.png`, `output/playwright/teameet-design-fix27-dev-component-extraction.png`, `output/playwright/teameet-design-fix27-dev-page-priority.png`
