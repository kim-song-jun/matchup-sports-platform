# Case Coverage Matrix

`Teameet Design.html?v=20260425-fix12`부터 각 기능 모듈은 happy path 화면만이 아니라 개발 핸드오프용 case matrix 보드를 함께 가진다.

## Purpose

개발팀이 구현할 때 필요한 판단 단위를 화면 안에서 바로 확인할 수 있게 한다.

- route와 owning shell
- 핵심 flow
- required state
- edge case
- micro-interaction
- persistent recovery UI

## Rendered Boards

각 기능 섹션 마지막에 `... · 케이스 매트릭스` 보드가 추가됐다.

| Module | Board id | Shell | Route refs |
|---|---|---|---|
| 인증 · 온보딩 | `auth-case-matrix` | `OnboardingStepShell` | `/login`, `/callback/*`, `/onboarding` |
| 홈 · 추천 | `home-case-matrix` | `DiscoverListShell` | `/home`, `/feed`, `/badges` |
| 개인 매치 | `matches-case-matrix` | `DetailSummaryShell + FormStepShell` | `/matches`, `/matches/[id]`, `/matches/new`, `/my/matches` |
| 팀 · 팀매칭 | `teams-case-matrix` | `TeamCaptainTools + DetailSummaryShell` | `/teams`, `/team-matches` |
| 레슨 Academy | `lessons-case-matrix` | `AcademyHub + TicketStatePanel` | `/lessons`, `/lessons/[id]`, `/my/lesson-tickets` |
| 장터 Marketplace | `marketplace-case-matrix` | `MarketplaceOrderStateShell` | `/marketplace`, `/marketplace/orders/[id]` |
| 시설 Venues | `venues-case-matrix` | `MapListSplit + BookingSlotShell` | `/venues`, `/venues/[id]/schedule` |
| 용병 Mercenary | `mercenary-case-matrix` | `DetailSummaryShell` | `/mercenary`, `/mercenary/[id]`, `/mercenary/new` |
| 대회 Tournaments | `tournaments-case-matrix` | `TournamentOpsShell` | `/tournaments`, `/admin/tournaments` |
| 장비 대여 | `rental-case-matrix` | `RentalStateShell` | `/rentals`, `/rentals/orders/[id]` |
| 종목 · 실력 · 안전 | `sports-case-matrix` | `SportCapabilityShell` | `/sports`, `/profile/edit`, `/matches/new` |
| 커뮤니티 · 채팅 · 알림 | `community-case-matrix` | `GroupedHistoryShell` | `/chat`, `/notifications`, `/feed` |
| 마이 · 프로필 · 평판 | `my-case-matrix` | `IdentityProfileShell` | `/my`, `/profile`, `/reviews`, `/users/[id]` |
| 결제 · 환불 · 분쟁 | `payments-case-matrix` | `PaymentDecisionShell` | `/payments`, `/payments/[id]/refund`, `/my/disputes` |
| 설정 · 약관 · 상태 | `settings-case-matrix` | `StatePanelFamily` | `/settings`, `/privacy`, `/terms` |
| 공개 · 마케팅 | `public-case-matrix` | `PublicConversionShell` | `/landing`, `/pricing`, `/faq`, `/guide`, `/users/[id]` |
| 데스크탑 웹 | `desktop-case-matrix` | `DesktopWorkspaceShell` | `/home`, `/matches`, `/lessons`, `/venues`, `/marketplace` |
| 관리자 · 운영 | `admin-case-matrix` | `AdminAnalyticsShell` | `/admin/*` |

## Common Coverage Boards

`19 · 공통 플로우 · 인터랙션`에는 전 모듈에 적용되는 보드가 추가됐다.

| Board id | Purpose |
|---|---|
| `state-coverage-atlas` | Empty, Loading, Error, Success, Disabled, Pending, Deadline, Sold out, Permission denied 상태 패밀리 |
| `edge-case-gallery` | 데이터 경합, 권한/역할, 거래/결제, 복구/안전 edge case 묶음 |
| `interaction-flow-atlas` | tap scale, bottom sheet, filter chip, toast, sticky CTA, push transition, skeleton, form progress 전이 |
| `handoff-readiness-matrix` | 모듈별 route/flow/state/edge/interaction/shell 구현 준비도 테이블 |

## State Rule

모든 상태는 다음 세 가지를 포함해야 한다.

1. 원인: 왜 이 상태가 되었는지
2. 복구: 사용자가 무엇을 할 수 있는지
3. 다음 상태: 성공, 대기, 실패, 권한 요청 중 어디로 이동하는지

Toast는 action feedback으로만 사용하고, 오류/대기/권한 제한은 화면 안에 persistent row, sheet, banner, disabled reason으로 남긴다.

## Current Count

- rendered sections: `31`
- rendered artboards: `321`
- functional module case matrix boards: `18`
- common state/edge/interaction boards: `4`
- page readiness audit boards: `1`
- page-family readiness boards: `121`
  - `5` for `01 · 인증 · 온보딩`
  - `5` for `02 · 홈 · 추천`
  - `6` for `03 · 개인 매치`
  - `7` for `04 · 팀 · 팀매칭`
  - `7` for `05 · 레슨 Academy`
  - `7` for `06 · 장터 Marketplace`
  - `7` for `07 · 시설 Venues`
  - `7` for `08 · 용병 Mercenary`
  - `7` for `09 · 대회 Tournaments`
  - `7` for `10 · 장비 대여`
  - `7` for `11 · 종목 · 실력 · 안전`
  - `7` for `12 · 커뮤니티 · 채팅 · 알림`
  - `7` for `13 · 마이 · 프로필 · 평판`
  - `7` for `14 · 결제 · 환불 · 분쟁`
  - `7` for `15 · 설정 · 약관 · 상태`
  - `7` for `16 · 공개 · 마케팅`
  - `7` for `17 · 데스크탑 웹`
  - `7` for `18 · 관리자 · 운영`
- duplicate artboard ids: `0` in static validation
- rendered dark artboard slots: `0`
- design-system foundation boards: `6`
- development handoff boards: `4`
