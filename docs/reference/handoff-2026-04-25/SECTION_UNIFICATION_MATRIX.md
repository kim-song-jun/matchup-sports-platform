# 00 Reference -> 01-24 Unification Matrix

## 기준

- canonical rule source: `DESIGN.md`
- handoff reference source: `project/Teameet Design.html`
- strongest boards: `00 · Toss DNA`, `00b~00h`

이 문서는 `00` 계열의 강한 디자인 시스템을 `01~24` 전체 섹션과 실제 앱 route에 어떻게 매핑할지 정리한 실행용 matrix다.

## Core Reference Packs

1. `00 · Toss DNA`
   - 역할: primitive grammar
   - 핵심: `NumberDisplay`, `MoneyRow`, `KPIStat`, `SectionTitle`, `ListItem`, `StackedAvatars`, `WeatherStrip`, `StatBar`, `EmptyState`, `Skeleton`, `Toast`, `PullHint`, `HapticChip`
   - 적용 대상: 모든 consumer/admin surface

2. `00b · Onboarding 3-step`
   - 역할: funnel/form shell
   - 핵심: step progress, option card, sticky CTA, question-first layout
   - 적용 대상: onboarding, create/edit, qualification, checkout sub-step

3. `00c · 용병`
   - 역할: urgency + pay template
   - 핵심: KPI strip, pay `NumberDisplay`, host card, recruitment urgency
   - 적용 대상: mercenary, deadline cards, paid participation flows

4. `00d · 대회`
   - 역할: structured sports data template
   - 핵심: KPI quadrant, bracket, standings, prize `MoneyRow`
   - 적용 대상: tournaments, team-match score/evaluate, admin sports stats

5. `00e · 결제 풀 플로우`
   - 역할: transaction/history template
   - 핵심: checkout summary, success confirmation, grouped history, receipt grammar
   - 적용 대상: payments, refunds, lesson passes, settlements, order history

6. `00f · 채팅 / 알림`
   - 역할: activity stream template
   - 핵심: embedded object card, grouped notifications, system message row
   - 적용 대상: chat, notifications, ops activity, dispute timelines

7. `00g · 데스크탑 웹`
   - 역할: desktop consumer shell
   - 핵심: centered white canvas, KPI band, left filter rail, right results
   - 적용 대상: desktop public + logged-in consumer pages

8. `00h · Admin`
   - 역할: admin analytics shell
   - 핵심: KPI cards, chart cards, dense tables, restrained dashboard rhythm
   - 적용 대상: `/admin/*` 전체

## Section Mapping

### 01 · Onboarding

- reference: `00b`
- actual routes: `/(main)/onboarding`, `/(main)/profile`, 각 create/edit 초기 step
- action: onboarding을 독립 화면이 아니라 공통 `OnboardingStepShell`로 재정의하고, 종목/레벨/지역 외에도 스포츠별 자격 입력 진입점으로 확장

### 02 · Home

- reference: `00 · Toss DNA`, `00g`, `11 · 홈 (위젯 + FAB)`
- actual routes: `/(main)/home`, `/(main)/feed`
- action: `HomeToss` + `HomePlusV2`를 canonical home으로 채택하고, `D/E/F`는 inspiration-only로 강등

### 03 · 매치

- reference: `00 · Toss DNA`, `00c`
- actual routes: `/(main)/matches`, `/(main)/matches/[id]`, `/(main)/matches/new`, `/(main)/matches/[id]/edit`
- action: list/map/timeline/swipe/dense를 같은 filter/list/detail grammar로 묶고, 상세/참가 플로우는 `MoneyRow` + sticky CTA + state panel로 통일

### 04 · 팀 매칭

- reference: `00d`, `19 · 팀매치 운영 플로우`
- actual routes: `/(main)/team-matches`, `/(main)/team-matches/[id]`, `/(main)/team-matches/new`, `arrival/score/evaluate`
- action: 팀 매칭을 단순 카드 목록이 아니라 경기 운영 lifecycle로 통합하고, detail/book/attendance/score/evaluate를 하나의 shell family로 묶는다

### 05 · 레슨 · 장터 · 시설

- reference: `00 · Toss DNA`, `00e`, `00g`
- actual routes: `/(main)/lessons`, `/(main)/marketplace`, `/(main)/venues`
- action: 도메인은 분리하되 list shell은 공유하고, 카드/필터/결제 진입 구조는 공통화

### 06 · 채팅 · 알림

- reference: `00f`
- actual routes: `/(main)/chat`, `/(main)/chat/[id]`, `/(main)/notifications`
- action: 채팅방 안 임베드 카드, 시스템 메시지, 시간 그룹핑을 공용 activity grammar로 승격

### 07 · 마이페이지

- reference: `00 · Toss DNA`, `ActivityToss`
- actual routes: `/(main)/profile`, `/(main)/my/*`, `/(main)/reviews`, `/(main)/badges`
- action: hero식 소개를 배제하고 KPI + grouped list + history shell로 compact hub 재구성

### 08 · 종목별 특화 화면

- reference: `08 · 종목별 특화 화면`, `12 · 종목별 실력 인증`
- actual routes: `matches`, `team-matches`, `mercenary`, onboarding/profile qualification forms
- action: 스포츠별 차이를 카드 테마가 아니라 input grammar와 state model 차이로 드러내기

### 09 · 상세 (고도화)

- reference: `00 · Toss DNA`, `00e`
- actual routes: `matches/[id]`, `lessons/[id]`, `marketplace/[id]`, `venues/[id]`, `teams/[id]`, `users/[id]`
- action: media, summary, price/status, CTA, review, related item 섹션을 같은 detail shell로 재정리하고 "이전" 보드는 전부 퇴출

### 10 · 결제 · 리뷰

- reference: `00e`
- actual routes: `/(main)/payments`, `/(main)/payments/checkout`, `/(main)/payments/[id]`, `/(main)/payments/[id]/refund`, `/(main)/reviews`
- action: checkout/success/history/detail/refund/receipt를 한 family로, review는 post-transaction companion flow로 정렬

### 11 · 홈 (위젯 + FAB)

- reference: `00 · Toss DNA`, `11`
- actual routes: `/(main)/home`
- action: 위젯은 home의 alternate density mode로만 존재시키고, 별도 앱처럼 분리하지 않는다

### 12 · 종목별 실력 인증

- reference: `00b`, `12`
- actual routes: `/(main)/onboarding`, `/(main)/profile`, 팀/매치 신청 전 qualification steps
- action: 축구/풋살의 선출/난이도, 농구 포지션/신장, 테니스 NTRP, 배드민턴 군부, 하키/피겨 경력 연차를 공통 `QualificationFormShell` 아래로 통합

### 13 · 수강권 · 장비대여

- reference: `00e`, `00c`
- actual routes: `/(main)/my/lesson-tickets`, `/(main)/lessons/[id]`, `/(main)/marketplace`, `/(main)/marketplace/orders/[id]`, admin lesson-ticket
- action: 수강권 결제/잔여/만료와 장비 대여/반납/보증금 상태를 모두 transaction grammar로 다룬다

### 14 · 팀 · 시설 예약

- reference: `00b`, `00e`
- actual routes: `/(main)/venues/[id]`, `/(main)/teams/[id]`, `/(main)/team-matches/[id]`
- action: 예약은 시간표/정원/상태/CTA가 먼저 읽히는 booking shell로 통합하고, 팀 가입 신청도 같은 step/progress grammar 재사용

### 15 · 데스크탑 웹

- reference: `00g`
- actual routes: `landing`, `home`, `matches`, `lessons`, `venues`, `marketplace`, 각 detail pages
- action: 모바일 확대판을 버리고 `left rail + result/workspace + sticky summary` 패턴으로 재구성

### 16 · 관리자 Admin

- reference: `00h`
- actual routes: `admin/dashboard`, `admin/matches`, `admin/team-matches`, `admin/users`, `admin/reviews`, `admin/disputes`, `admin/payouts`, `admin/statistics`, `admin/ops`, `admin/venues`, `admin/lesson-tickets`, `admin/mercenary`
- action: 모든 admin surface를 동일한 KPI/table/detail grammar로 통일하고, decorative dashboard 감성을 배제

### 17 · 등록 · 수정 폼

- reference: `00b`
- actual routes: `matches/new`, `team-matches/new`, `lessons/new`, `marketplace/new`, `mercenary/new`, `teams/new`, 각 edit routes
- action: domain별 form을 따로 꾸미지 말고 `FormStepShell`, `FieldGroup`, `StickySubmitBar`로 공통화

### 18 · 마이 서브 페이지

- reference: `00 · Toss DNA`, `00e`
- actual routes: `/(main)/my/matches`, `/(main)/my/lessons`, `/(main)/my/listings`, `/(main)/my/teams`, `/(main)/my/disputes`, `/(main)/my/team-match-applications`
- action: 리스트와 history를 분리하지 않고 grouped sections + KPI header로 묶는다

### 19 · 팀매치 운영 플로우

- reference: `00d`, `19`
- actual routes: `team-matches/[id]/arrival`, `score`, `evaluate`
- action: 경기 당일 UX를 운영 폼이 아니라 guided action flow로 승격

### 19b · 마이크로 인터랙션 데모

- reference: `00 · Toss DNA`
- actual routes: cross-cutting
- action: tap scale, shimmer, toast, pull hint, bottom sheet, sticky CTA, chip selection, push transition을 컴포넌트 계약으로 승격

### 20 · 공개 · 마케팅

- reference: `00g`
- actual routes: `/landing`, `/pricing`, `/faq`, `/guide`, `/users/[id]`, `/about`
- action: public pages도 white-first, CTA-first, summary-first 원칙을 유지하고 marketing gradient/hero excess는 억제

### 21 · 설정 서브 페이지

- reference: `00f`, `07`
- actual routes: `/(main)/settings`, `settings/account`, `settings/notifications`, `settings/privacy`, `settings/terms`, `not-found`, `error`
- action: utility page grammar로 compact list + status + legal blocks를 정리

### 22 · Admin 서브 페이지

- reference: `00h`, `00f`
- actual routes: `admin/*` detail/tool pages
- action: 신고, 분쟁, 정산, 운영툴, 시설 등록, 수강권 관리, 용병/대회 관리까지 모두 admin shell 하위 module로 수렴

### 23 · 용병 · 대회 · 로그인 · 상태

- reference: `00c`, `00d`, `00e`
- actual routes: `/(auth)/login`, `/(main)/mercenary`, `/(main)/mercenary/[id]`, `/(main)/tournaments`, `/(main)/tournaments/[id]`
- action: extras 섹션이 아니라 독립 vertical로 취급하고 상태 화면도 공용 state panel로 통합

### 24 · 남은 상세 페이지

- reference: `00 · Toss DNA`, `00e`, `00f`
- actual routes: teams sub pages, payment detail, tournament detail, badges, feed, chat embeds
- action: 남은 상세를 예외 surface로 남기지 말고 same shell family로 흡수

## Cross-Cutting Rules To Apply Everywhere

- blue는 인터랙션에만 사용하고 decorative gradient로 쓰지 않는다
- 수치/금액/통계는 `NumberDisplay`, `MoneyRow`, `KPIStat`, tabular number로 정규화한다
- 리스트/정보 구조를 카드보다 우선하고, 그림자는 hairline 수준만 허용한다
- radius는 12~16px 중심으로 통일한다
- 상태 화면은 `empty / loading / error / success / disabled / pending / deadline / sold out / permission denied`를 모든 주요 여정에 포함한다
- 모바일과 데스크탑을 서로 다른 제품처럼 만들지 않고, 동일한 type/spacing/action language를 유지한다

## Explicit Deprioritization

- `02 · Home`의 editorial / dark / stories variant는 canonical default로 채택하지 않는다
- purple/orange를 primary처럼 읽히게 하는 accent 확산은 폐기한다
- content-wide glass, deep shadow, marketing hero 과장은 consumer/admin utility surface에서 금지한다
