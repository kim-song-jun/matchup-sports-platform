# Task 52 — Current Design Drift Audit And Remediation Plan

> **Superseded by `.github/tasks/58-design-system-audit.md`** (2026-04-12). This file remains as evidence/history. The Evidence Snapshot section below is referenced by Task 58.

Owner: project-director -> frontend-dev -> frontend-review -> design/qa/docs
Date drafted: 2026-04-11
Status: Superseded (by Task 58)
Priority: --

## Planning Report

### Project Director: Approved

- `DESIGN.md`로 canonical 규칙은 정리됐지만, 현재 사용자 인상은 아직 그 규칙만큼 일관되지 않다.
- 가장 큰 문제는 "새 기준이 없다"가 아니라 "공용 abstraction과 실제 route가 아직 수렴하지 않았다"는 점이다.
- 우선순위는 `shared abstraction drift -> discovery/list family normalization -> content overlay cleanup -> public marketing shadow reduction -> form/edit border cleanup` 순서가 맞다.
- 사용자 신뢰 관점에서 가장 먼저 줄여야 하는 것은 과한 shadow/border 자체보다, 화면마다 다른 control language와 card decoration intensity다.

### Tech Planner

- 현재 구조에서 가장 유지보수 가능한 접근은 route를 하나씩 미세 조정하는 것이 아니라, 공용 레이어를 먼저 바로잡고 route family를 그 위로 다시 정렬하는 방식이다.
- 특히 `MobilePageTopZone`, `Card`, `Button`이 아직 새 기준과 완전히 합치지 않아 downstream route가 계속 page-local class를 복제하고 있다.
- 문서와 구현의 drift를 줄이려면 task 범위를 shared abstraction과 route family로 나누고, route별 cosmetic TODO 나열이 아니라 "어떤 문법을 제거/강제할지"를 명시해야 한다.

## Context

`DESIGN.md`는 다음 규칙을 canonical contract로 고정했다.

- 과한 shadow 금지
- 과한 border 금지
- Toss-like clean layout
- glass는 `navbar / sticky header / bottom nav / overlay / button / panel-like chrome`에만 허용

하지만 현재 코드베이스는 이 규칙과 완전히 수렴하지 않았다.

2026-04-11 기준 quick audit:

- `MobilePageTopZone` 사용 파일 수: `10`
- `backdrop-blur-sm` 사용 파일 수: `8`
- `shadow-lg` 사용 파일 수: `13`
- `shadow-xl` 사용 파일 수: `6`
- `border-2` 사용 파일 수: `20`
- `Button` primitive 사용 파일 수: `10`
- `Card` primitive 사용 파일 수: `8`

즉, 문제의 본질은 "규칙 부재"가 아니라 `shared abstraction adoption deficit + page-local styling drift`다.

## Goal

- 현재 코드베이스에서 새 디자인 기준과 어긋나는 주요 개선 포인트를 문서화한다.
- 구현 우선순위를 shared abstraction 중심으로 다시 묶는다.
- 다음 `@build` 단계가 route별 감으로 수정하지 않고, 명확한 wave와 검증 기준에 따라 작업할 수 있게 한다.

## Original Conditions

- [x] 현재 코드베이스를 직접 읽고 개선 포인트를 찾는다.
- [x] 기존 audit 문서만 재요약하지 않고 현재 구현 근거를 포함한다.
- [x] 이번 턴은 planning/documentation만 수행한다.
- [x] canonical rule은 `DESIGN.md`를 따른다.
- [x] 개선 포인트는 shared abstraction first 관점으로 묶는다.
- [x] 다음 구현 단계에 바로 넘길 수 있는 task contract 형태로 남긴다.

## Evidence Snapshot

### Shared Abstraction Drift

- `apps/web/src/components/layout/mobile-page-top-zone.tsx:29`
  - `surface="panel"` 경로가 여전히 `glass-mobile-panel`과 panel eyebrow border/shadow를 포함한다.
- `apps/web/src/components/ui/card.tsx:5`
  - `Card.default`가 기본값으로 `shadow-sm`를 가진다.
- `apps/web/src/components/ui/card.tsx:7`
  - `Card.surface`가 `shadow-[0_16px_30px_rgba(15,23,42,0.05)]`를 사용한다.
- `apps/web/src/components/ui/button.tsx:6`
  - `Button.primary`가 blue shadow를 기본값으로 가진다.
- `apps/web/src/components/ui/button.tsx:40`
  - focus ring이 `ring-4` 기준으로 유지된다.

### Representative Route Drift

- `apps/web/src/app/(main)/home/home-client.tsx:92`
  - top zone action과 quick chips가 아직 page-local CTA/shadow 문법을 직접 가진다.
- `apps/web/src/app/(main)/matches/matches-client.tsx:107`
  - match hero image 내부 상태 칩이 `backdrop-blur-sm` 기반 frosted badge를 반복 사용한다.
- `apps/web/src/app/(main)/matches/matches-client.tsx:295`
  - top zone 내부 clear filter / view toggle이 separate micro-pattern으로 존재한다.
- `apps/web/src/app/(main)/lessons/page.tsx:80`
  - lesson card overlay chip이 `backdrop-blur-sm` 기반이다.
- `apps/web/src/app/(main)/lessons/page.tsx:201`
  - lesson list shell이 CTA/input/filter 모두 page-local class 조합을 사용한다.
- `apps/web/src/app/(main)/venues/page.tsx:64`
  - venues도 CTA/input/filter/list row가 page-local 문법으로 유지된다.
- `apps/web/src/app/(main)/teams/team-list.tsx:26`
  - team card는 floating logo capsule + blur/shadow를 content media 안에 사용한다.
- `apps/web/src/app/(main)/teams/[id]/page.tsx:173`
  - team detail hero logo capsule이 heavier shadow를 사용한다.
- `apps/web/src/app/pricing/page.tsx:56`
  - recommended CTA가 `shadow-lg`/`hover:shadow-xl` 중심이다.
- `apps/web/src/app/pricing/page.tsx:155`
  - pricing plan card가 hover lift + heavy blue emphasis를 사용한다.
- `apps/web/src/app/(main)/settings/account/page.tsx:36`
  - account page가 `Card.surface`를 반복 사용한다.
- `apps/web/src/app/(main)/settings/account/page.tsx:140`
  - destructive CTA에 `border-2`를 추가한다.
- `apps/web/src/app/(main)/settings/account/page.tsx:210`
  - delete modal이 `shadow-xl`을 사용한다.

### Screenshot Artifact Coverage — 2026-04-11

Reviewed runs:

- `output/playwright/visual-audit/task50-batch1-all9-rerun2`
  - `59` captured / `9` blocked / `20` expected N/A
  - covered routes: `/landing`, `/about`, `/guide`, `/pricing`, `/faq`, `/login`
  - actual captured viewport coverage: `mobile-sm`, `mobile-md`, `mobile-lg`, `tablet-sm`
- `output/playwright/visual-audit/visual-smoke`
  - `13` captured / `2` blocked / `5` expected N/A
  - covered routes: `/login`, `/feed`, `/badges`, `/chat`
  - actual captured viewport coverage: `mobile-md`, `desktop-md`

Current capture coverage against visual audit catalog (`92` route templates total):

- `batch-1-public-auth`: `6 / 6` routes captured
- `batch-5-account-utility`: `3 / 21` routes captured
- `batch-2-main-discovery`: `0 / 10` routes captured
- `batch-3-detail-pages`: `0 / 14` routes captured
- `batch-4-create-edit-forms`: `0 / 19` routes captured
- `batch-6-admin`: `0 / 22` routes captured

Important constraint:

- run id에 `all9`가 포함돼도, 2026-04-11 현재 실제 artifact는 public/auth에서 `tablet-sm`까지만 남아 있다.
- 따라서 이번 screenshot-backed audit은 `full 9-viewport verdict`가 아니라 `public/auth complete enough for first-pass + account utility partial`로 해석해야 한다.

## Findings

### 1. Shared Abstraction이 새 기준을 충분히 강제하지 못한다

핵심 문제:

- `MobilePageTopZone`이 plain title row와 panel hero 역할을 동시에 가진다.
- `Card` 기본값이 아직 light shadow 중심이다.
- `Button.primary`가 기본적으로 blue shadow를 동반한다.

영향:

- route가 공용 primitive를 사용해도 여전히 "조용한 solid-first"보다 "살짝 떠 있는 UI"로 읽힌다.
- page-local class가 남는 이유도 primitive가 기준을 완전히 대표하지 못하기 때문이다.

대상 파일:

- `apps/web/src/components/layout/mobile-page-top-zone.tsx`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/app/globals.css`

### 2. Discovery/List Family가 동일한 control language를 공유하지 않는다

핵심 문제:

- `home`, `matches`, `lessons`, `venues`, `teams`, `marketplace`, `mercenary`, `team-matches`, `tournaments`가 모두 discovery 계열인데도 CTA/button/chip/input grammar가 route마다 다르다.
- top zone은 공용인데 그 아래 filter/search/action strip은 여전히 page-local utility 조합이다.

영향:

- Toss-like clean layout의 핵심인 "같은 종류의 화면은 같은 문법으로 읽힘"이 약해진다.
- 새 route가 늘수록 같은 패턴이 다시 복제될 가능성이 높다.

우선 근거 파일:

- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`
- `apps/web/src/app/(main)/venues/page.tsx`
- `apps/web/src/app/(main)/teams/teams-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`

### 3. Content Surface 내부에 frosted badge / floating media capsule이 남아 있다

핵심 문제:

- main content card 자체는 solid여도, media 위 상태 chip과 logo capsule이 frosted blur/shadow를 반복 사용한다.
- 이는 `glass as chrome, solid as content` 규칙과 가장 자주 충돌하는 잔여 패턴이다.

영향:

- card 자체보다 badge/overlay가 먼저 보이면서 정보 구조보다 스타일이 먼저 읽힌다.
- 디테일/카드별 one-off style 예외가 계속 생긴다.

우선 근거 파일:

- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`
- `apps/web/src/app/(main)/teams/team-list.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`

### 4. Public Marketing Surface는 현재 기준보다 shadow/lift가 강하다

핵심 문제:

- `pricing`, `landing`, `about`, `guide`, `faq`는 product marketing 특성상 예외가 허용될 수 있지만, 현재는 "깔끔한 설득 화면"보다 "hover-lift showcase"에 더 가깝다.
- 특히 pricing은 blue shadow와 plan lift가 강하다.

영향:

- public brand와 main app tone 사이의 거리가 벌어진다.
- Toss-like clean layout보다 template-like promotional polish로 읽힐 위험이 있다.

우선 근거 파일:

- `apps/web/src/app/pricing/page.tsx`
- `apps/web/src/app/landing/page.tsx`
- `apps/web/src/app/about/page.tsx`
- `apps/web/src/app/guide/page.tsx`
- `apps/web/src/app/faq/page.tsx`

### 5. Form/Edit/Destructive Flow는 border-heavy pattern이 많이 남아 있다

핵심 문제:

- `border-2`가 form selector, destructive CTA, segmented choice에서 넓게 남아 있다.
- lesson/team-match/mercenary/marketplace create-edit flow는 primitive layer 도입 이후에도 thick-border 선택 패턴을 계속 사용한다.

영향:

- 현재 디자인 기준의 `subtle full border 또는 borderless separation` 원칙과 충돌한다.
- dense form이 card showcase처럼 보이고, destructive emphasis가 border 두께에 과도하게 의존한다.

우선 근거 파일:

- `apps/web/src/app/(main)/settings/account/page.tsx`
- `apps/web/src/app/(main)/lessons/new/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/team-matches/new/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/mercenary/new/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/marketplace/new/page.tsx`

## Screenshot-Backed Visual Audit

### 1. Public surface는 생각보다 새 기준에 가까워졌지만, CTA와 featured card elevation은 아직 과하다

`DESIGN.md`의 shadow rule은 "기본 카드에는 none 또는 hairline-level shadow만 허용"하고, stronger shadow는 chrome/overlay 같은 truly floating surface에만 허용한다.

현재 screenshot 기준 판단:

- `/landing`, `/pricing`, `/faq`의 mobile captures는 전체 레이아웃 방향 자체는 clean하고 solid-first에 가깝다.
- 반면 primary CTA와 featured card는 여전히 `shadow-lg` / `hover:shadow-xl` / hover lift에 기대는 비중이 높다.
- 즉 "레이아웃은 맞는데 강조 방식이 아직 이전 문법"에 가깝다.

Code evidence:

- `apps/web/src/app/landing/page.tsx:97`
- `apps/web/src/app/landing/page.tsx:116`
- `apps/web/src/app/landing/page.tsx:174`
- `apps/web/src/app/landing/page.tsx:217`
- `apps/web/src/app/pricing/page.tsx:56`
- `apps/web/src/app/pricing/page.tsx:155`
- `apps/web/src/app/pricing/page.tsx:164`
- `apps/web/src/app/faq/page.tsx:247`
- `apps/web/src/app/faq/page.tsx:291`
- `apps/web/src/app/faq/page.tsx:304`

Interpretation:

- public 마케팅 예외는 허용되지만, 현재 강조는 "clean persuasion"보다 "template-like showcase polish"로 더 읽힌다.
- public tone을 맞추는 핵심은 색을 바꾸는 것이 아니라 shadow/lift를 줄이고 hierarchy만 남기는 것이다.

### 2. Public mobile은 hero 이후 section rhythm이 아직 느슨하다

`DESIGN.md`의 layout rule은 `text-first`, `section-clear`, `action-obvious`를 요구한다.

현재 screenshot 기준 판단:

- `/landing`, `/about`, `/guide`, `/pricing` mobile captures에서 상단 메시지 이후 긴 white gap과 긴 scroll 구간이 반복된다.
- 화면 자체는 깨끗하지만, 핵심 proof block이 조금 늦게 등장해 mobile first-scan에서 action/copy 리듬이 느슨해진다.
- 특히 landing/about/guide는 "정돈됨"은 충족하지만, "빨리 읽힘"은 아직 최적화 여지가 있다.

Interpretation:

- 이 이슈는 shadow/border 문제가 아니라 spacing rhythm 문제다.
- 다음 public pass에서는 section padding을 줄이고, hero 다음 첫 proof block의 도달 시점을 앞당겨야 한다.

### 3. FAQ는 현재 public family에서 가장 `DESIGN.md`와 잘 맞는 reference surface다

현재 screenshot 기준 판단:

- `/faq`는 top section, category tab, accordion 본문이 모두 solid-first로 읽힌다.
- 첫 스캔에서 레이아웃과 action이 장식보다 먼저 읽힌다.
- scrolled/menu-open state에서도 정보 구조가 잘 유지된다.

Code evidence:

- `apps/web/src/app/faq/page.tsx:240`
- `apps/web/src/app/faq/page.tsx:263`

Interpretation:

- FAQ는 public informational page의 기준 예시로 삼기 좋다.
- 다만 active tab/CTA/icon block의 shadow intensity는 한 단계 더 줄일 수 있다.

### 4. Login은 mobile 기준 가장 안정적으로 새 테마에 수렴한 surface다. 다만 desktop density는 약하다

현재 screenshot 기준 판단:

- `/login` mobile default/focus state는 solid field, 명확한 CTA, 조용한 hierarchy가 잘 맞는다.
- glass가 content에 번지지 않고, border/shadow도 전체적으로 절제돼 있다.
- 반면 `desktop-md` capture는 실제 콘텐츠 폭이 너무 좁고 하단 빈 공간이 커서, desktop auth shell이 under-scaled하게 보인다.

Code evidence:

- `apps/web/src/app/(auth)/login/page.tsx:175`
- `apps/web/src/app/(auth)/login/page.tsx:191`
- `apps/web/src/app/(auth)/login/page.tsx:199`
- `apps/web/src/app/(auth)/login/page.tsx:200`

Interpretation:

- mobile auth language는 유지하는 것이 맞다.
- desktop만 별도로 density와 vertical composition을 조정하는 편이 좋다.

### 5. Account utility mobile은 `glass as chrome, solid as content` 원칙을 대체로 잘 지키고 있다

현재 screenshot 기준 판단:

- `/feed`, `/badges`, `/chat` mobile captures에서는 header/bottom nav만 floating chrome으로 읽히고, 본문은 mostly solid surface다.
- 특히 `/feed`는 utility page가 hero/showcase처럼 보이지 않고 compact list rhythm으로 읽힌다.
- `/chat` empty state도 decorative hero 없이 utilitarian하게 정리돼 있다.

Code evidence:

- `apps/web/src/app/(main)/feed/page.tsx:108`
- `apps/web/src/app/(main)/feed/page.tsx:135`
- `apps/web/src/app/(main)/chat/page.tsx:180`
- `apps/web/src/app/(main)/chat/page.tsx:182`

Interpretation:

- utility family는 오히려 public/discovery보다 새 design theme에 더 잘 맞는 구간이다.
- 이후 discovery/list family normalization 시 utility family를 깨지 않도록 별도 baseline으로 취급하는 편이 맞다.

### 6. Badges는 utility family 안에서도 content-glass 예외가 남아 있다

현재 screenshot 기준 판단:

- `/badges`는 전체 구조는 solid-first지만, 파란 summary card 안의 small icon chip이 glass/frosted material로 읽힌다.
- 이 부분은 content panel 내부의 decorative blur로 보여 `glass as chrome, solid as content` 원칙과 충돌한다.

Code evidence:

- `apps/web/src/app/(main)/badges/page.tsx:193`
- `apps/web/src/app/(main)/badges/page.tsx:205`

Interpretation:

- badges는 전체 페이지를 다시 설계할 필요는 없다.
- summary 내부 icon capsule만 solid tint 또는 plain white chip으로 바꿔도 theme alignment가 바로 좋아질 가능성이 높다.

### 7. Desktop utility는 시각 규칙보다 density와 width usage가 더 큰 문제다

현재 screenshot 기준 판단:

- `/feed` desktop은 안정적이지만 좌측 navigation과 본문 밀도가 다소 벌어져 있다.
- `/badges` desktop과 `/chat` desktop은 큰 white canvas 대비 실제 정보 밀도가 낮아, desktop layout이 제품 화면보다 placeholder처럼 보인다.
- 즉 desktop utility의 주된 drift는 shadow/border가 아니라 "너무 비어 보이는 composition"이다.

Code evidence:

- `apps/web/src/app/(main)/chat/page.tsx:143`
- `apps/web/src/app/(main)/chat/page.tsx:161`
- `apps/web/src/app/(main)/chat/page.tsx:165`

Interpretation:

- desktop utility 개선은 shadow cleanup보다 layout compression과 content anchoring이 우선이다.
- empty state 자체를 더 화려하게 만들기보다, column balance와 panel width를 먼저 다듬는 것이 맞다.

### 8. 다음 visual audit wave의 우선순위는 screenshot completeness 자체다

현재 가장 큰 제한:

- public/auth는 first-pass evidence가 충분하지만 아직 true 9-viewport completion이 아니다.
- discovery, detail, create/edit, admin은 아직 screenshot-backed verdict를 내릴 수 없다.

따라서 다음 capture 우선순위는:

1. `batch-2-main-discovery`
2. `batch-3-detail-pages`
3. `batch-4-create-edit-forms`
4. `batch-6-admin`
5. public/auth의 `tablet-md`, `tablet-lg`, `desktop-sm`, `desktop-md`, `desktop-lg` missing rerun

## User Scenarios

### Scenario 1 — Discovery Flow Consistency

Given 사용자가 `home -> matches -> lessons -> venues`로 이동한다  
When 각 화면의 검색/필터/CTA를 본다  
Then 같은 종류의 action과 control은 같은 visual grammar로 읽힌다

### Scenario 2 — Content Surface Restraint

Given 사용자가 매치/레슨/팀 카드와 상세 상단 media를 본다  
When 상태 chip과 badge를 읽는다  
Then glass/frosted effect는 chrome exception처럼 보이지, 카드 본문 문법을 지배하지 않는다

### Scenario 3 — Trustworthy Utility/Form Experience

Given 사용자가 settings/account나 create/edit form을 사용한다  
When destructive CTA와 선택형 입력을 본다  
Then border 두께가 아니라 hierarchy, spacing, tone으로 상태를 이해한다

### Scenario 4 — Public To Product Continuity

Given 사용자가 `landing/pricing`에서 시작해 로그인 후 main app으로 들어온다  
When 브랜드 톤을 체감한다  
Then marketing과 product가 다른 제품처럼 보이지 않는다

## Test Scenarios

### Happy Path

- shared abstraction 변경 후 discovery/list/detail/form representative routes가 같은 규칙을 따른다.
- `Button` / `Card` / top-zone 계열을 읽었을 때 새 기준이 그대로 드러난다.
- public marketing과 main app이 tone은 다르지만 shadow/border discipline은 공유한다.

### Edge Cases

- dark mode에서도 shadow 제거 후 hierarchy가 무너지지 않는다.
- media overlay에서 blur 제거 또는 약화 후에도 text contrast가 유지된다.
- destructive CTA를 border thickness 없이도 명확히 구분할 수 있다.
- utility page 상단을 단순화해도 정보 손실 없이 스캔 가능하다.

### Error Cases

- primitive 정리 중 route가 다시 page-local class를 복제하지 않는다.
- design cleanup이 false-affordance 또는 data honesty 문제를 가리지 않는다.

## Parallel Work Breakdown

### Shared / Sequential First

1. `frontend-dev`
   - `MobilePageTopZone`, `Card`, `Button`, 필요 시 filter/segmented control primitive 설계
   - token과 component default가 `DESIGN.md`와 직접 합치도록 정렬

### Wave 1 — Discovery Family

2. `frontend-dev`
   - `home`, `matches`, `lessons`, `venues`, `teams`, `marketplace`, `mercenary`, `team-matches`, `tournaments`
   - top zone 아래 search/filter/CTA strip을 공용 문법으로 수렴

### Wave 2 — Media / Detail Cleanup

3. `frontend-dev`
   - match/lesson/team/venue detail 및 list card의 overlay badge, logo capsule, media chip 정리

### Wave 3 — Public Marketing

4. `frontend-dev`
   - `landing`, `about`, `guide`, `pricing`, `faq`
   - hover-lift / heavy shadow / badge glow를 줄이고 clean persuasion tone로 조정

### Wave 4 — Utility / Form / Destructive

5. `frontend-dev`
   - `settings/account` + create/edit flows
   - `border-2` 기반 선택/강조 패턴 축소

### Review / QA / Docs

6. `frontend-review`
   - bucket별로 shared rule 위반이 재발하지 않았는지 확인
7. `design`
   - route family 간 tone continuity 검수
8. `qa-uiux`
   - breakpoint별 visual smoke 및 interaction readability 확인
9. `docs`
   - relevant task/report/scenario 문서에 결과 write-back

## Recommended Sequence

1. `MobilePageTopZone`, `Card`, `Button`을 먼저 정리한다.
2. 그 위에 discovery/list family를 한 묶음으로 정리한다.
3. content media overlay와 detail hero를 정리한다.
4. public marketing shadow/lift를 낮춘다.
5. form/edit/destructive flow의 `border-2` 패턴을 걷는다.
6. visual audit과 representative route validation을 다시 돈다.

## Validation Strategy

### Static Checks

- `rg`로 아래 패턴 카운트를 before/after 비교한다.
  - `MobilePageTopZone`
  - `backdrop-blur-sm`
  - `shadow-lg`
  - `shadow-xl`
  - `border-2`
  - primitive 사용 수 (`<Button`, `buttonStyles`, `<Card`)

### Route Review Set

- main app
  - `/home`
  - `/matches`
  - `/lessons`
  - `/venues`
  - `/teams`
  - `/marketplace`
  - `/settings/account`
- detail
  - `/teams/:id`
  - `/lessons/:id`
  - `/venues/:id`
- public
  - `/landing`
  - `/pricing`
  - `/guide`
  - `/faq`

### Visual Criteria

- shadow가 빠져도 hierarchy가 유지된다.
- border를 약화해도 interaction affordance가 유지된다.
- glass는 chrome에만 남고 content에 번지지 않는다.
- top zone과 filter/action strip이 같은 family 안에서 같은 문법을 쓴다.
- screenshot verdict를 낼 때는 실제 captured viewport/state 범위를 함께 기록한다.

## Acceptance Criteria

- current codebase 기준 디자인 drift가 shared abstraction first로 정리돼 있다.
- 각 improvement bucket에 representative file evidence가 연결돼 있다.
- 다음 build 단계가 route family 단위로 구현할 수 있는 순서가 문서에 명시돼 있다.
- validation 방식이 screenshot 감상 수준이 아니라 grep + representative route audit까지 포함한다.
- 현재 screenshot coverage의 범위와 미완료 batch가 문서에 명시돼 있다.

## Tech Debt Resolved

- 문서 차원에서 "디자인 개선점을 어디서부터 손대야 하는지 모호한 상태"를 해소한다.
- route별 산발 TODO 대신 shared abstraction 중심의 구조적 remediation 순서를 고정한다.

## Security Notes

- 이번 task는 문서 계획 단계다. 직접적인 auth/data/security contract 변경은 포함하지 않는다.
- 단, design cleanup 중 unsupported action이나 fallback data가 실제 기능처럼 보이는 문제는 별도 task로 분리하지 않고 review에서 함께 경계한다.

## Risks & Dependencies

- 현재 worktree가 이미 넓게 변경돼 있으므로, 구현 단계에서는 shared abstraction 파일 충돌 가능성이 높다.
- public marketing은 main app보다 약간 더 expressive할 수 있으나, 그 예외 범위를 문서 없이 감으로 풀면 drift가 재발한다.
- `backdrop-blur-sm` 제거가 readability 문제를 만들 수 있으므로 media overlay는 contrast 재설계와 같이 가야 한다.
- form 선택 패턴에서 `border-2`를 급하게 없애면 selected state 인지가 약해질 수 있어 background/icon/check grammar를 함께 설계해야 한다.

## Ambiguity Log

- public marketing page에 허용할 shadow 강도는 main app와 동일선으로 볼지, 약한 브랜드 예외를 둘지 구현 전 한 번 더 고정할 필요가 있다.
- media overlay chip의 blur를 전면 금지할지, contrast 확보용 최소 예외를 둘지는 design review에서 최종 확인이 필요하다.
- `MobilePageTopZone`를 유지할지, `PageHeader`/`PageIntro`로 역할 분리할지는 shared abstraction 설계 단계에서 결정한다.

## Next Action

- `@build`에서 shared abstraction cleanup부터 시작한다.
- 첫 구현 wave 전, 이 task를 기준으로 `shared component ownership`을 먼저 고정한다.
- 병렬로 visual audit capture는 `batch-2 -> batch-3 -> batch-4 -> batch-6` 순으로 이어가고, public/auth missing viewport rerun을 따로 마감한다.
