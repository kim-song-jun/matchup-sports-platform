# Handoff 디자인 분석

## 범위와 검증

- 원본 아카이브: `/Users/kimsungjun/Downloads/Sports-platform-handoff.tar.gz`
- canonical 반입 경로: `docs/reference/handoff-2026-04-25/sports-platform/`
- 주 진입점: `project/Teameet Design.html`
- 의도 확인 소스: `chats/chat1.md`
- 검증 결과: archive `31` files / imported `31` files

즉, 이 분석은 "업로드된 번들 전체"를 실제 저장소 안에서 동일 파일 수로 반입한 상태를 기준으로 한다.

## 이 handoff가 실제로 담고 있는 것

이 번들은 단순 이미지 모음이 아니다. 실제 구조는 아래와 같다.

- `Teameet Design.html`
  - 33개 `DCSection`
  - 140개 `DCArtboard`
  - `00`, `00b~00h`, `01~24` 전 구간 레지스트리
- `tokens.jsx`
  - 색상, radius, shadow, base atom token
- `signatures.jsx`
  - 시그니처 primitive 묶음
- `screens-refresh1/2/3.jsx`
  - 지금 품질이 가장 높은 refresh pack
- 나머지 `screens-*.jsx`
  - 폭넓은 coverage를 제공하는 UI kit surface inventory

따라서 이 handoff는 "한두 화면의 레퍼런스"가 아니라, **새 디자인 시스템 후보 + 전체 화면 inventory**를 동시에 제공하는 prototype bundle로 보는 게 맞다.

## 채팅 로그에서 확인되는 최종 의도

`chat1.md`를 기준으로 사용자의 최종 요구는 아래로 수렴한다.

- 모바일 + 데스크탑 동시 고려
- 클릭 가능한 인터랙티브 프로토타입 밀도
- Home / Match / Team Match / Lessons / Marketplace / Venues / Chat / My / Payment / Settings / Public / Admin 전 범위
- 종목별 세부 UX 차이
  - 축구/풋살: 선출, 난이도, 포지션, 시간대/인원 충원
  - 농구: 3on3/5on5, 포지션, 신장/특기
  - 테니스: 단복식, NTRP, 파트너
  - 배드민턴: 군부, 복식 파트너
  - 하키/피겨: 경력 연차, 장비, 안전 체크
- 수강권 구매/잔여/만료, 장비 대여, 팀/시설 예약, 위젯/FAB 홈까지 포함한 deep flow

즉, 목표는 "몇 개 화면 추가"가 아니라 **전체 UI kit를 한 단계 높은 품질의 단일 시스템으로 다시 묶는 것**이다.

## 현재 번들의 가장 강한 부분

### 1. `00 · Toss DNA`는 실제 primitive 후보를 제공한다

가장 중요한 점은 `00`이 moodboard가 아니라는 것이다. 여기에는 다음 reusable primitive가 직접 정의되어 있다.

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

이 구간은 현재 사용자 요청의 "반드시 유지할 장점"과 거의 일치한다.

### 2. `00b~00h`는 section별 strongest shell을 이미 제시한다

- `00b`: onboarding/form funnel
- `00c`: mercenary urgency/pay shell
- `00d`: tournament/structured sports data shell
- `00e`: payment/history/refund 계열 grammar
- `00f`: chat/notification/activity stream grammar
- `00g`: desktop consumer workspace shell
- `00h`: admin analytics/table shell

즉, `00` 계열은 단순 미학이 아니라 **system grammar**를 제공한다.

### 3. coverage breadth는 이미 충분히 넓다

`01~24`에는 아래가 이미 들어 있다.

- onboarding
- home variants
- matches
- team matches
- lessons / marketplace / venues
- chat / notifications
- my pages
- sport-specific flows
- deep detail pages
- payments / reviews
- widget home
- skill qualification
- lesson pass / rental
- team / venue booking
- desktop
- admin
- create/edit forms
- my subpages
- operations flow
- public/marketing
- settings
- admin deep
- extras
- remaining details

즉, coverage 부족보다 **quality normalization과 system unification이 진짜 문제**다.

## 현재 저장소 SSOT와 잘 맞는 부분

- white-first surface
- `#3182f6` blue 중심 interaction
- Pretendard 기반 타이포
- 숫자/금액/통계에 tabular number 감각
- 12~16px radius 중심
- mobile-first spacing
- sticky CTA / bottom sheet / grouped notification / step progress 같은 interaction 문법

이 축은 `DESIGN.md`의 `layout first`, `solid first`, `trust through restraint`와 기본 방향이 잘 맞는다.

## 현재 저장소 규칙과 충돌하거나 보정이 필요한 부분

### 1. accent 확산

prototype token에는 `green`, `orange`, `yellow`, `teal`, `purple`가 넓게 열려 있고 일부 보드에서는 primary처럼 읽힌다. TeamMeet canonical rule은 one-accent system이므로, blue 외 색은 semantic support로만 후퇴시켜야 한다.

### 2. shadow/depth 과잉 여지

`tokens.jsx`는 `--sh-1`부터 `--sh-4`까지 넓게 열려 있다. 하지만 현재 저장소의 canonical direction은 hairline-level 또는 거의 없는 shadow다. 즉, prototype에 있는 level 3/4 depth는 대부분 폐기 또는 강한 제한이 필요하다.

### 3. 일부 home variant의 방향 이탈

`02 · Home`의 editorial / dark / stories variant는 coverage 아이디어로는 유효하지만 canonical default로 채택하면 `DESIGN.md`의 utilitarian, white-first, action-first 원칙과 충돌한다.

### 4. prototype 특유의 inline styling

`signatures.jsx`와 다수 screen 파일은 재사용성은 높지만 production-grade token/component architecture는 아니다. 시그니처는 옳지만 구현 형태는 prototype 레벨이다.

### 5. honest contract drift 위험

prototype에는 실제 backend truth를 확인하지 않은 상태/카피가 섞여 있다.

- 신뢰/리뷰/성장 지표를 강하게 말하는 카피
- 실제 환불/결제 capability보다 앞선 narrative
- 외부 이미지 기반을 전제로 읽히는 구간

이 부분은 live app 반영 시 반드시 truth-gated wording으로 다시 써야 한다.

## 현재 bundle의 핵심 판단

### 판단 1. `00` 계열은 "기준 팩"으로 승격 가능하다

`00`, `00b~00h`는 새 디자인 시스템의 시작점으로 삼아도 된다.

### 판단 2. `01~24`는 "coverage map + refactor target"으로 보는 것이 맞다

이 영역은 전부 가치가 있지만, 화면마다 품질 편차가 있다. 따라서 그대로 구현 대상으로 복제하기보다, `00` grammar를 기준으로 재편해야 한다.

### 판단 3. 실제 앱 반영은 section별 이식이 아니라 primitive/shell extraction부터 가야 한다

사용자가 요구한 범위는 너무 넓기 때문에, page-by-page cosmetic pass로는 다시 drift가 난다. 먼저 `00` 계열의 공통 grammar를 real component/shell로 뽑고, 그 다음 route family 단위로 이식하는 것이 맞다.

## 우선순위 높은 gap

### 가장 먼저 시스템화해야 하는 것

- 수치/결제/통계 grammar
- grouped history grammar
- onboarding/form step grammar
- desktop workspace grammar
- admin analytics/table grammar
- state panel family

### 사용자가 특히 강조한 deep flow

- 수강권 구매 / 잔여 / 만료
- 장비 대여 / 상세 / 주문 상태
- 팀/시설 예약
- sport-specific qualification
- chat/notification grouping
- widget/FAB home

이 구간은 이미 prototype coverage가 있으므로, 새로 상상할 일이 아니라 **어떤 것을 canonical shell로 승격할지**가 핵심이다.

## 권장 사용 방식

1. handoff는 reference pack으로 유지한다.
2. strongest source는 `00 · Toss DNA`, `00b~00h`로 한정한다.
3. `01~24`는 section inventory + gap audit 용도로 읽는다.
4. 실제 앱 구현은 `DESIGN.md`와 현재 route/backend truth 아래에서 다시 만든다.
5. home editorial/dark/story variants, multi-accent hero, deep-shadow cards, content-wide glass는 canonical adoption 대상에서 제외한다.

## 결론

이 handoff의 핵심 가치는 "새 화면 몇 장"이 아니다. 진짜 가치는 다음 두 가지다.

- `00` 계열이 이미 제공하는 강한 primitive/shell grammar
- `01~24`가 제공하는 넓은 coverage map

따라서 이 번들을 저장소에 흡수하는 가장 올바른 경로는:

1. reference pack 정규화
2. `00` 계열을 기준 팩으로 승격
3. `01~24`를 같은 시스템으로 다시 정렬
4. 그 결과를 실제 `apps/web` route family로 옮기는 것
