# Task 39 — Mobile Navigation & Chrome Redesign System

> Historical design planning task. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and this file should not be used as a new rule-definition source.

Owner: codex -> project-director -> tech-planner -> design-main/ux-manager/ui-manager -> frontend-dev
Date drafted: 2026-04-11
Status: Reopened — audit complete, redesign planning in progress

## Why This Task Was Reopened

Round 1에서 mobile glass token과 일부 공용 chrome을 도입했지만, 실제 사용자 인상은 아직 "modern glass shell"보다 "하얀 카드 여러 개"에 가깝다.

사용자 피드백의 핵심은 다음과 같다.

- bottom nav가 너무 평범하고 정보가 과하다.
- icon과 text를 모든 탭에 동시에 노출할 필요가 없어 보인다.
- glassmorphism이 코드상으로는 존재하지만 시각적으로 거의 읽히지 않는다.
- `/home`부터 시작하는 전체 모바일 페이지가 하나의 디자인 시스템처럼 느껴지지 않는다.
- 원하는 방향은 "토스처럼 깔끔하고 신뢰감 있는 라이트 UI"이며, glass는 nav/header 같은 chrome layer에만 양념처럼 들어가야 한다.

즉, 이번 라운드는 "glass를 더 많이 넣기"가 아니라:

1. mobile chrome의 역할을 다시 정의한다.
2. bottom nav를 시작점으로 전체 모바일 셸 언어를 재설계한다.
3. `/home` 이후 전체 페이지를 chrome/content 관점으로 다시 묶는다.

## Audit Scope

### Route Coverage

- main app page files: `60`
- public marketing page files: `5`
- audit target:
  - `/home`
  - `/matches`, `/team-matches`, `/teams`, `/mercenary`, `/lessons`, `/marketplace`, `/venues`
  - `/profile`, `/settings`, `/notifications`, `/chat`, `/payments`, `/reviews`, `/badges`, `/feed`
  - `/my/*`
  - `/landing`, `/about`, `/guide`, `/pricing`, `/faq`

### Shared Chrome Inventory

- `MobileGlassHeader` 사용 상세/편집 계열 page: `12`
- plain ad-hoc mobile header를 유지하는 `(main)` page: `41`
- global floating bottom nav: `1`
- landing 전용 nav: `1`

### Representative Files Reviewed

- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/components/layout/mobile-glass-header.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/(main)/layout.tsx`
- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/(main)/notifications/page.tsx`
- `apps/web/src/app/landing/page.tsx`

## Design Direction

### Target Feeling

- Toss-like clarity
- mostly-white, confident, low-noise interface
- restrained blue accent
- glass only where the product benefits from floating chrome depth
- no flashy gradients, no luxury-gloss, no "template glass" look

### Core Principle

- `glass as chrome, solid as content`

This means:

- bottom nav, sticky header, floating action tray, landing nav: glass allowed
- dense list cards, forms, settings rows, transactional bodies: mostly solid
- home top zone and selected hero strips: partial glass accent allowed
- card body 전체를 glass로 바꾸는 것은 금지

## Strategic Findings

### 1) The product has glass tokens, but not a glass system

현재 `glass-mobile-*` 클래스는 존재하지만, 실제로는:

- 밝은 background 위에 너무 얌전하게 깔려서 그냥 semi-opaque white card처럼 보인다.
- nav/header/chip/card의 계층 차이가 시각적으로 충분히 벌어져 있지 않다.
- glass가 "frame language"가 아니라 "약한 배경 스타일"처럼 쓰이고 있다.

결과적으로 사용자는 "glass를 적용했다"가 아니라 "흰색 라운드 카드가 조금 더 흐린가?" 정도로 인지한다.

### 2) Bottom nav is over-explained and under-designed

현재 bottom nav는 5개 탭 모두에 icon + text를 항상 동시에 보여준다.

문제:

- 모든 탭이 같은 무게로 읽혀 active state가 약하다.
- 정보량은 많지만 hierarchy는 약하다.
- rounded bar 자체는 floating인데, 내부 item은 여전히 generic tab strip처럼 보인다.
- 현재 active state는 약간 더 하얗고 약간 더 파랄 뿐이라 "선택된 목적지"로 충분히 읽히지 않는다.

디자인 결론:

- inactive tab은 icon-only 또는 icon-dominant로 줄이고,
- active tab만 label을 갖는 pill treatment로 재설계하는 안이 우선 검토 대상이다.
- notification badge와 profile treatment는 별도 hierarchy로 남겨야 한다.

### 3) Headers are fragmented across the app

`MobileGlassHeader`를 쓰는 화면도 있지만, 더 많은 화면이 여전히 page-local header를 사용한다.

문제:

- back button 위치, padding, border, sticky behavior가 화면마다 다르다.
- 어떤 화면은 glass header, 어떤 화면은 plain border header, 어떤 화면은 section title만 있다.
- 사용자는 route transition을 "같은 앱 안의 이동"보다 "다른 템플릿으로 이동"처럼 느낄 수 있다.

디자인 결론:

- header는 detail/edit/create/settings/sub-list를 아우르는 공통 chrome contract로 정리해야 한다.
- header variants는 `title-only`, `back + title`, `back + title + actions` 정도로 제한한다.

### 4) `/home` is closer to the desired direction than the rest, but still reads as isolated styling

`/home` 상단은 glass panel을 이미 일부 쓰고 있다.

하지만:

- 그 언어가 `/matches`, `/teams`, `/profile`, `/settings`로 확산되지 않는다.
- 홈 상단 glass는 예쁘지만 page shell 전체의 grammar와 연결되지 않는다.
- quick action chip, category chip, banner card가 서로 다른 UI 패밀리처럼 보인다.

디자인 결론:

- `/home`을 "reference surface"로 삼되, 여기서 만든 chrome language를 다른 페이지 템플릿에 강제로 연결해야 한다.

### 5) List, detail, profile, settings each speak slightly different UI dialects

전반적 패턴:

- list pages: white card + gray header + filter chip
- detail pages: glass header + large hero + mixed badge styles
- profile/settings: utility app 스타일의 plain section list
- public landing: marketing page 스타일

문제는 각각이 나쁘다기보다, 서로 같은 제품군처럼 보이지 않는다는 점이다.

디자인 결론:

- 화면군별 template language를 명시적으로 정의해야 한다.
- 한 route에서 성공한 패턴이 다른 route로 전파되지 않는 현재 구조를 끊어야 한다.

## UX Findings

### Navigation

- 현재 bottom nav는 정보 전달은 충분하지만 방향성이 약하다.
- `/home` 이후 주요 이동이 "탭 이동"인지 "페이지 drill-down"인지 시각적으로 구분이 덜 된다.
- settings/profile/my pages는 back navigation과 section navigation이 섞여 있어 shell 일관성이 약하다.

### Hierarchy

- page title, chip row, filter row, CTA row가 모두 비슷한 white/gray density로 놓여 있다.
- 중요한 CTA와 보조 필터가 같은 층위로 읽히는 화면이 많다.

### Flow Simplicity

- Toss-like 느낌을 위해 필요한 것은 장식보다 "지금 이 페이지에서 무엇을 할 수 있는지"가 한눈에 읽히는 구조다.
- list 페이지는 top summary + primary action + filters + content의 구조가 더 분명해져야 한다.

## Page Cluster Audit

### Cluster A — Shell / Chrome

- `BottomNav`
- `MobileGlassHeader`
- `LandingNav`
- `(main)/layout.tsx`

Required change:

- 하나의 mobile chrome language로 재통합

### Cluster B — Discovery / Listing

- `/home`
- `/matches`
- `/team-matches`
- `/teams`
- `/mercenary`
- `/lessons`
- `/marketplace`
- `/venues`

Required change:

- 상단 zone과 filter zone의 hierarchy 정리
- list card는 solid 유지
- top summary/segmented control/floating action만 selective glass

### Cluster C — Detail

- `/matches/[id]`
- `/team-matches/[id]`
- `/teams/[id]`
- `/mercenary/[id]`
- `/lessons/[id]`
- `/marketplace/[id]`
- `/venues/[id]`
- `/user/[id]`

Required change:

- sticky glass header 통일
- hero/media/action area의 레이어 정리
- 정보 section은 solid 유지

### Cluster D — Create / Edit / Transactional

- `new`, `edit`, `checkout`, `refund`, `arrival`, `score`, `evaluate`

Required change:

- decorative glass 최소화
- header와 bottom action bar만 chrome treatment
- form body는 contrast 높은 solid 유지

### Cluster E — Profile / Settings / My

- `/profile`
- `/settings/*`
- `/notifications`
- `/payments`
- `/reviews`
- `/badges`
- `/feed`
- `/my/*`

Required change:

- utility list UI를 더 정돈된 product shell로 재구성
- section title, cell spacing, icon container, quick link card를 통일
- settings와 profile도 bottom nav와 같은 chrome family 안에 있도록 맞춘다

### Cluster F — Public Marketing

- `/landing`
- `/about`
- `/guide`
- `/pricing`
- `/faq`

Required change:

- landing nav와 app shell의 tone 차이를 줄인다
- marketing page도 같은 brand product처럼 보이게 한다

## Scope Recommendation

### Phase 1 — Shell First

우선순위 최고. 여기서 방향이 맞지 않으면 나머지 페이지 polish는 다시 흔들린다.

- bottom nav redesign
- mobile top header redesign
- landing nav alignment
- shared glass tokens and active-state rules refresh
- mobile shell background and depth recalibration

### Phase 2 — Page Templates

- home top zone redesign
- discovery/list page header template
- profile/settings template
- detail page hero/header template

### Phase 3 — Route Rollout

- `/home`, `/matches`, `/teams`, `/profile`, `/settings`, `/notifications`
- `/marketplace`, `/lessons`, `/mercenary`, `/team-matches`, `/venues`
- `my/*`, payments, reviews, badges, feed
- public landing family

### Phase 4 — Final Polish

- motion tuning
- dark mode balance
- badge/chip density tuning
- safe-area and keyboard overlap review

## Proposed Redesign Rules

### Bottom Nav

Preferred direction:

- inactive items: icon only
- active item: tinted pill + icon + short label
- profile tab: notification badge anchored more cleanly
- container: more obviously floating, but still restrained
- internal spacing: less evenly generic, more intentional

Rules:

- no full text labels on all tabs by default
- no flat white slab feel
- no hard separators
- no neon glow

### Header System

- only 3 variants:
  - `title-only`
  - `back + title`
  - `back + title + action`
- all mobile subpages share the same sticky offset, padding, blur, and shadow logic
- border-bottom-only utility headers should be phased out

### Home

- greeting, quick AI/banner, and quick actions should feel like one curated top zone
- 아래 추천 콘텐츠 리스트는 solid card system 유지
- 상단만 premium, 본문은 practical하게 유지

### List Pages

- page title + short state summary + primary action + filter rail
- chips are not all glass; use one hierarchy at a time
- map/list toggle, sport filter, and sort/filter CTA must each have distinct visual roles

### Profile / Settings

- utility screens도 "설정 앱"처럼 보이기보다 MatchUp product shell처럼 보여야 한다
- section cards, icon holders, and quick communication cards should share one spacing language
- top area should feel intentionally designed, not just functionally complete

## Design Guardrails

1. Glass는 floating chrome에만 쓴다.
2. Content card는 solid를 기본값으로 유지한다.
3. Blue accent는 여전히 하나의 메인 액센트로 제한한다.
4. motion은 적고 명확해야 한다.
5. shadow는 depth를 만들되 luxury-like하게 과해지지 않는다.
6. active state는 색 하나가 아니라 shape와 density로도 구분한다.
7. accessibility는 baseline을 유지하되, 이번 라운드의 판단 우선순위는 visual hierarchy와 brand polish다.

## Technical Plan

### Shared Architecture

- `globals.css`
  - glass/nav/header tokens 재조정
  - active/inactive chrome state 분리
  - shell depth/background scale 재정의
- `components/layout`
  - `BottomNav` redesign
  - `MobileGlassHeader` variant system
  - 필요 시 shared page-top wrapper 추가
- `components/landing`
  - `LandingNav`를 main shell tone과 align

### Template Abstractions To Introduce

- `MobilePageHeader`
- `MobilePageTopZone`
- `MobileFilterRail`
- `ActivePillBottomNav`
- `ProfileUtilitySection`

### Sequencing

1. shell token and nav/header contract
2. home + discovery page template
3. profile/settings/my template
4. detail page template
5. landing/public alignment

## Acceptance Criteria

- [ ] bottom nav가 Toss-like clarity와 floating chrome 느낌을 동시에 갖는다.
- [ ] inactive nav item은 정보 밀도를 줄이고, active item은 더 명확한 hierarchy를 가진다.
- [ ] `(main)` 모바일 header 패턴이 공용 contract로 정리된다.
- [ ] `/home` 상단 zone이 다른 discovery/list page templates의 reference가 된다.
- [ ] list/detail/form/profile/settings가 같은 제품군처럼 읽힌다.
- [ ] glass는 눈에 띄지만 과하지 않고, 본문 card readability를 해치지 않는다.
- [ ] public landing nav와 authenticated app shell 사이의 tone drift가 줄어든다.

## Risks

- bottom nav에서 label을 너무 과감히 제거하면 첫 인지성이 떨어질 수 있다.
- glass 강도를 올리면 신뢰감보다 장식감이 커질 수 있다.
- route rollout을 page 단위로 개별 처리하면 다시 drift가 생길 수 있다.
- dirty worktree 상에서 광범위한 UI refactor 충돌 가능성이 높다.

## Decision

이번 작업은 단일 컴포넌트 tweak가 아니라, `mobile chrome redesign`으로 다뤄야 한다.

우선순위는:

1. bottom nav
2. mobile header system
3. home/discovery page top zones
4. profile/settings/my utilities
5. detail and public landing alignment

## Execution Log

- 2026-04-11 — round 1 glass system introduced and partially rolled out
- 2026-04-11 — user feedback indicated bottom nav and overall mobile chrome still do not read as refined glass UI
- 2026-04-11 — task reopened and expanded from "mobile glass chrome system" to "mobile navigation and chrome redesign system"
- 2026-04-11 — code audit completed across shared chrome, representative discovery/list/detail/profile/settings/public surfaces

## Detailed Implementation Backlog

### Workstream A — Bottom Nav Rebuild

Goal:

- 하단 nav를 단순 탭바가 아니라 앱의 핵심 control bar로 재정의한다.

Tasks:

- [ ] `BottomNav`의 정보 구조 실험안 2개 준비
- [ ] 기본안은 `inactive = icon dominant`, `active = icon + short label + tinted pill`로 설계
- [ ] active item 높이/폭을 inactive와 다르게 가져가 hierarchy를 만든다
- [ ] nav container radius, inner padding, bottom safe-area spacing을 재조정한다
- [ ] active background를 단순 white overlay가 아니라 slightly denser chrome surface로 분리한다
- [ ] hover/pressed/active shadow를 단계적으로 구분한다
- [ ] unread badge의 크기, 위치, offset을 profile 아이콘 geometry에 맞게 재배치한다
- [ ] `/teams`가 `/team-matches`와 `/mercenary`를 품는 current IA를 유지할지 재검토한다

Validation:

- [ ] `/home` 첫 화면에서 nav가 독립된 floating layer로 읽히는가
- [ ] `/matches`, `/profile`에서 active state가 즉시 인지되는가
- [ ] white background 위에서도 nav 윤곽이 무너지지 않는가

### Workstream B — Mobile Header Unification

Goal:

- 흩어진 mobile header를 하나의 variant system으로 통합한다.

Tasks:

- [ ] `MobileGlassHeader`를 `variant` 기반 API로 확장한다
- [ ] variant 후보: `title`, `back`, `back-actions`, `utility-compact`
- [ ] sticky / non-sticky / divider / transparent-on-top 같은 옵션을 prop으로 고정한다
- [ ] settings/privacy, settings/terms의 one-off nav header 제거
- [ ] settings page의 `SettingsBackButton`를 새 header contract에 맞게 재배치한다
- [ ] detail pages의 개별 back button JSX를 shared slot pattern으로 정리한다

Validation:

- [ ] `/settings`, `/notifications`, `/reviews`, `/payments` 헤더 rhythm이 통일되는가
- [ ] `/matches/[id]`, `/teams/[id]`, `/venues/[id]`에서 header depth가 같은 family로 읽히는가

### Workstream C — Chrome Tokens and Surface Tiers

Goal:

- 지금의 단일 `glass-mobile-*` 묶음을 tiered chrome system으로 세분화한다.

Tasks:

- [ ] `nav`, `header`, `rail`, `chip`, `panel` tier를 분리한다
- [ ] 밝은 배경 위에서 glass가 단순 white card로 보이지 않도록 contrast gap을 키운다
- [ ] blur보다 border highlight와 shadow density로 레이어를 먼저 만든다
- [ ] dark mode token도 함께 재페어링한다
- [ ] fallback background는 지금보다 덜 탁하고 더 일관된 톤으로 맞춘다
- [ ] `bottom-nav-link.is-active`를 token-based state로 재작성한다

Validation:

- [ ] `globals.css`만 봐도 chrome tier가 구분되는가
- [ ] light mode에서 glass가 "opaque card"로 오해되지 않는가
- [ ] dark mode에서 muddy gray block처럼 보이지 않는가

### Workstream D — Home as Reference Surface

Goal:

- `/home`을 전체 리디자인의 기준 화면으로 만든다.

Tasks:

- [ ] greeting panel, AI banner, quick actions를 하나의 curated top zone으로 재구성한다
- [ ] 상단 1스크린 안에서 strongest accent surface는 1개만 남긴다
- [ ] quick actions / sports tabs / recommendation block 간 density 차이를 더 분명히 만든다
- [ ] glass는 hero top zone에만 집중하고, recommendation card body는 solid 유지한다
- [ ] bottom nav와 top zone 사이 spacing rhythm을 연결한다

Validation:

- [ ] 첫 화면만 봐도 앱의 visual thesis가 전달되는가
- [ ] 너무 화려하지 않으면서 premium한가

### Workstream E — Discovery Template System

Goal:

- 반복되는 탐색형 list page를 공통 shell로 정리한다.

Targets:

- `/matches`
- `/marketplace`
- `/mercenary`
- `/lessons`
- `/venues`
- `/teams` 일부

Tasks:

- [ ] `title + summary + primary action` 헤더 영역 기준선 정의
- [ ] search bar, filter chip row, segmented toggle, count line의 순서를 규정한다
- [ ] chip row 높이, radius, selected style, spacing을 표준화한다
- [ ] glass는 filter rail 또는 floating control row에만 제한한다
- [ ] list card간 vertical rhythm을 통일한다
- [ ] 스포츠 badge / 상태 badge / price/meta 정보의 text density 기준을 정한다

Validation:

- [ ] page마다 CTA 무게가 흔들리지 않는가
- [ ] scroll 시작 직후 top 정보가 한눈에 정리되어 보이는가

### Workstream F — Utility / Account Template System

Goal:

- utility 화면이 설정 앱처럼 분리되지 않고 MatchUp shell 안에 머물게 한다.

Targets:

- `/profile`
- `/settings/*`
- `/notifications`
- `/chat`
- `/payments`
- `/reviews`
- `/badges`
- `/feed`
- `/my/*`

Tasks:

- [ ] profile 상단 summary, quick link cards, grouped menu를 하나의 spacing system으로 맞춘다
- [ ] settings section, row, icon holder, chevron spacing을 공통 utility row로 정리한다
- [ ] notifications card, chat room cell, payments row의 utility hierarchy 공통점을 추출한다
- [ ] section title의 uppercase/size/color 사용 규칙을 통일한다
- [ ] utility surfaces의 얇은 divider와 card grouping 규칙을 재정의한다

Validation:

- [ ] `/profile`과 `/settings`가 서로 다른 앱처럼 보이지 않는가
- [ ] 기능 페이지인데도 bland하지 않고 제품성이 느껴지는가

### Workstream G — Detail / Form Polish

Goal:

- detail/form 페이지는 정보 신뢰도를 유지하면서 shell quality만 올린다.

Targets:

- detail: `matches/[id]`, `teams/[id]`, `mercenary/[id]`, `lessons/[id]`, `marketplace/[id]`, `venues/[id]`, `user/[id]`
- form: `new`, `edit`, `checkout`, `refund`, `score`, `arrival`, `evaluate`

Tasks:

- [ ] detail hero 상단 1~2개 block만 accent하고, 이후 본문은 solid section rhythm으로 통일한다
- [ ] sticky CTA/footer bar가 있다면 nav/header와 같은 chrome family로 흡수한다
- [ ] form save/submit area가 있다면 compact floating bar 패턴으로 검토한다
- [ ] modal/sheet 내부의 glass 사용은 shell 레벨에만 한정한다

Validation:

- [ ] 폼 가독성과 신뢰감이 떨어지지 않는가
- [ ] detail hero 이후 페이지가 너무 단조롭지 않은가

## Page Rollout Checklist

### Priority 0 — Reference Trio

- [ ] `/home`
- [ ] `/matches`
- [ ] `/profile`

Why:

- 홈, 탐색, 개인 허브를 먼저 잡아야 전체 앱의 방향성이 고정된다.

### Priority 1 — Shell Critical

- [ ] shared `BottomNav`
- [ ] shared `MobileGlassHeader`
- [ ] `LandingNav`
- [ ] `(main)/layout.tsx`

Why:

- page-by-page rollout 전에 shell drift를 먼저 막아야 한다.

### Priority 2 — Discovery Family

- [ ] `/teams`
- [ ] `/marketplace`
- [ ] `/mercenary`
- [ ] `/lessons`
- [ ] `/venues`
- [ ] `/team-matches`

### Priority 3 — Utility Family

- [ ] `/settings`
- [ ] `/notifications`
- [ ] `/chat`
- [ ] `/payments`
- [ ] `/reviews`
- [ ] `/badges`
- [ ] `/feed`
- [ ] `/my/*`

### Priority 4 — Detail / Form Family

- [ ] all `[id]` detail routes
- [ ] all `new/edit` routes
- [ ] payment/refund/evaluate/score/arrival transactional flows

### Priority 5 — Public Family

- [ ] `/landing`
- [ ] `/about`
- [ ] `/guide`
- [ ] `/pricing`
- [ ] `/faq`

## Concrete UI Decisions To Resolve Before Build

These should be fixed deliberately before code rollout starts.

1. bottom nav label policy
   - option A: active-only label
   - option B: all labels but inactive reduced more aggressively

2. header behavior policy
   - always sticky on mobile vs only detail/utility pages sticky

3. discovery page top zone policy
   - static solid header vs compact glass filter rail

4. home top zone emphasis
   - greeting-first vs AI-banner-first

5. utility grouping policy
   - section card grouping vs open list with soft dividers

## Success Heuristics

This redesign should be considered successful when:

- screenshot 한 장만 봐도 nav/header/top zone이 같은 제품 언어를 말한다
- `/home`과 `/matches`와 `/profile`의 톤이 자연스럽게 이어진다
- glass가 적용된 곳은 "오, 여기가 떠 있는 조작 레이어구나"라고 읽힌다
- 본문 card는 여전히 읽기 쉽고 실용적이다
- 예쁘지만 과하게 꾸민 서비스처럼 보이지 않는다
