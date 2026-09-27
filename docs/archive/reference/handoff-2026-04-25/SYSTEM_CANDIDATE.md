# Handoff 00 기반 디자인 시스템 후보

## 목표

목표는 handoff 전체를 픽셀 복제하는 것이 아니다. `00 · Toss DNA`와 `00b~00h`에서 가장 강한 규칙만 추출해, TeamMeet의 다음 design system baseline으로 승격하는 것이다.

핵심은 다음 한 문장으로 요약된다.

**"강한 primitive + 강한 shell + 넓은 coverage map"을 하나의 일관된 시스템으로 묶는다.**

## 기준 소스

- 보드 레지스트리: `project/Teameet Design.html`
- primitive source: `project/lib/signatures.jsx`
- base token source: `project/lib/tokens.jsx`
- strongest shells
  - `project/lib/screens-refresh1.jsx`
  - `project/lib/screens-refresh2.jsx`
  - `project/lib/screens-refresh3.jsx`

## North Star

- Toss 스타일 기반의 절제된 UI
- white-first surface
- `#3182f6` single primary interaction accent
- Pretendard-friendly Korean typography
- numbers / money / stats -> tabular number
- 12~16px radius
- mobile-first, desktop-specific re-layout
- high-fidelity production-ready quality
- consistent spacing and component language

## Token Policy

### Color

- primary interaction: `#3182f6`
- support semantic only: green / orange / red / teal
- purple is not a primary accent in the live system
- no decorative gradient hero on utility surfaces

### Typography

- weight usage is intentionally narrow: `400 / 600 / 700`
- large numeric emphasis is reserved for real KPI/payment/activity moments
- data tables and financial rows use tabular numbers by default

### Shape

- inputs, buttons, cards: `12~16px`
- pills/chips: fully rounded
- no over-rounded content slabs

### Depth

- default: borderless or hairline border
- shadow: `none` or hairline only
- deep floating shadow is reserved for actual floating chrome only

## Primitive Family To Promote

### Metric / Money

- `NumberDisplay`
  - large numeric headline with unit and sub copy
  - target: payment success, wallet, lesson pass remaining, mercenary pay, KPI summary
- `MoneyRow`
  - label / amount / optional subtext
  - target: checkout, receipt, refund, settlement, pricing breakdown
- `KPIStat`
  - label / value / delta
  - target: home summary, mercenary urgency, tournament, admin KPI
- `StatBar`
  - compact quantitative comparison
  - target: attendance, fill rate, skill band, admin distribution

### Structure / List

- `SectionTitle`
  - title + optional sub + optional action
- `ListItem`
  - standardized row for settings, history, receipt, activity
- `StackedAvatars`
  - participants, team preview, chat member presence
- `WeatherStrip`
  - sports-context inline weather

### Feedback / State

- `EmptyState`
- `Skeleton`
- `Toast`
- `PullHint`

### Control / Filter

- `HapticChip`
  - the base filter/segment interaction language

## Shell Family To Promote

### 1. `OnboardingStepShell`

- top progress
- question-first headline
- option card or selection list
- contextual helper block
- bottom sticky CTA

Targets:

- onboarding
- qualification flows
- create/edit wizards
- lesson pass purchase steps
- team join / booking steps

### 2. `DetailSummaryShell`

- header / media / core summary / CTA / structured sections
- `NumberDisplay` or `MoneyRow` only where the domain actually needs it
- reviews and related items are secondary sections, not hero clutter

Targets:

- match detail
- venue detail
- lesson detail
- marketplace listing detail
- team detail
- payment detail
- tournament detail

### 3. `GroupedHistoryShell`

- grouped rows by time or state
- section summary above list
- `ListItem` + `MoneyRow` grammar

Targets:

- payments history
- refunds
- notifications
- lesson pass usage
- order status
- my activity pages

### 4. `DesktopWorkspaceShell`

- restrained KPI band
- left filter rail
- main result area
- optional sticky side summary

Targets:

- desktop matches
- lessons
- marketplace
- venues
- public desktop landing/search/detail

### 5. `AdminAnalyticsShell`

- KPI row
- chart cards
- dense table card
- side nav + light working canvas

Targets:

- admin dashboard
- disputes
- payouts / settlements
- users
- operational tools
- venue / lesson ticket / mercenary admin

### 6. `StatePanelFamily`

Required state set:

- empty
- loading
- error
- success
- disabled
- pending
- deadline
- sold out
- permission denied

This state family must be available for all major verticals, not invented ad hoc per page.

## Interaction Grammar

- button / chip tap scale
- pull-to-refresh hint
- skeleton shimmer
- toast notification
- bottom sheet open / close
- sticky CTA
- card -> detail push transition
- filter chip selection
- notification grouping
- form step progress
- payment success confirmation

All of these already exist conceptually inside the handoff bundle and should become shared contracts rather than screen-local tricks.

## Section-Wide Adoption Rules

### Consumer Mobile

- big numbers are allowed, but only when the domain deserves them
- information hierarchy stays time/place/capacity/action-first
- lists outrank cards when the surface is operational
- home variants collapse into one canonical family, not six disconnected aesthetics

### Consumer Desktop

- desktop is not mobile stretched wider
- use workspace patterns: rail, filters, content, sticky summary
- marketing pages keep wide white space but not gradient hero spectacle

### Admin

- higher density than consumer surfaces
- tables, KPI cards, chart cards share one grammar
- no glossy control-room fantasy styling

## Explicitly Reject

- conic-gradient story rings as default navigation language
- purple-blue product gradients on primary surfaces
- deep floating shadow on content cards
- content-wide glass / blur
- dashboard-style hero handling on utility screens
- oversized KPI display that outranks time/place/capacity/action in sports flows

## Practical Adoption Order

### Wave 1 -- primitives

- `NumberDisplay`
- `MoneyRow`
- `KPIStat`
- `StatBar`
- `SectionTitle`
- `ListItem`
- `HapticChip`
- `StackedAvatars`
- `EmptyState`
- `Skeleton`
- `Toast`
- `PullHint`

### Wave 2 -- shells

- onboarding/form shell
- detail summary shell
- grouped history shell
- desktop workspace shell
- admin analytics shell
- state panel family

### Wave 3 -- highest-leverage surfaces

- onboarding
- home
- payments
- chat / notifications
- mercenary
- tournaments
- admin dashboard

### Wave 4 -- full route families

- matches
- team-matches
- lessons
- marketplace
- venues
- my / settings / profile
- desktop consumer variants
- admin deep pages

## 권장 결론

이 저장소가 handoff를 진짜 설계 자산으로 쓰려면, handoff 전체가 아니라 `00 · Toss DNA`와 `00b~00h`를 새 기준 팩으로 삼는 것이 맞다.

그 다음 올바른 경로는 다음이다.

1. prototype primitive를 real primitive로 추출
2. strongest shell을 real shell로 추출
3. `01~24` 전체를 같은 grammar로 재정렬
4. 실제 `apps/web` route family에 단계적으로 이식
