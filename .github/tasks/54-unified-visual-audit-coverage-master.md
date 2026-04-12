# Task 54 — Unified Visual Audit Coverage Master

> Active master contract. This file unifies route inventory, interaction matrix, component catalog capture, asset inventory, execution order, and artifact expectations. Runtime commands remain in `docs/PLAYWRIGHT_E2E_RUNBOOK.md`. Condensed operator steps remain in `.github/tasks/53-visual-audit-operations-one-pager.md`. Task 50 remains implementation history only.

Owner: project-director -> tech-planner -> qa/ui/frontend  
Date drafted: 2026-04-12  
Status: Active  
Priority: P0  
Baseline commit: `9ba813a25a349f4d60a1b5412ed8c90a455beb68` (`2026-04-06 14:27:18 +0900`)

## 1. Why This Document Exists

현재 visual audit 체계는 `페이지 screenshot runner`까지는 구축되어 있다.  
하지만 실제로 디자인 품질을 닫으려면 아래 4개가 하나의 계약으로 묶여 있어야 한다.

1. 페이지 전수 캡처
2. 페이지별 인터랙션 매트릭스
3. 공용 컴포넌트 카탈로그 캡처
4. 이미지/아이콘/썸네일 등 에셋 인벤토리 캡처

지금까지는 Task 50이 infrastructure history, Task 53이 operator one-pager, runbook이 명령 사용법 역할로 나뉘어 있다.  
이 문서는 그 위에 서는 `coverage master`다.

즉, 이 문서는 다음 질문에 답해야 한다.

- 우리는 무엇을 전수 캡처해야 하는가
- 어떤 상태까지 캡처해야 하는가
- 페이지와 컴포넌트와 에셋을 어떻게 한 체계로 엮는가
- 무엇이 끝나야 "전수 audit complete"라고 부를 수 있는가

## 2. Role Split With Existing Documents

- `DESIGN.md`
  - 유일한 시각 규칙 source of truth
- `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`
  - 현재 디자인 remediation 작업 계약
- `.github/tasks/54-unified-visual-audit-coverage-master.md`
  - visual coverage와 capture completeness의 master contract
- `.github/tasks/53-visual-audit-operations-one-pager.md`
  - 실행자용 1페이지 운영 문서
- `docs/PLAYWRIGHT_E2E_RUNBOOK.md`
  - 실제 명령, 플래그, artifact, troubleshooting
- `.github/tasks/50-playwright-mcp-visual-audit-matrix.md`
  - runner 구축과 hardening의 역사 문서

규칙 우선순위는 아래로 고정한다.

1. `DESIGN.md`
2. Task 54
3. Task 53
4. `docs/PLAYWRIGHT_E2E_RUNBOOK.md`
5. Task 50

## 3. Target Outcome

최종 목표는 단순 screenshot 수집이 아니다.  
`디자인 회귀 감지 + UX audit evidence + remediation backlog`를 동시에 만들 수 있는 완성된 시각 조사 체계를 만드는 것이다.

완료 상태는 아래를 만족해야 한다.

- `92` canonical visual route template가 전부 manifest에 resolve된다.
- 각 route는 viewport 9종 기준으로 최소 default state가 존재한다.
- 각 route family는 정의된 interaction state를 최소 1회 이상 캡처한다.
- 공용 컴포넌트 family는 isolated capture가 가능하다.
- 이미지/아이콘/썸네일/fallback 등 visual asset family는 inventory와 representative render가 존재한다.
- blocked, expected-na, degraded candidate가 이유와 함께 기록된다.

## 4. Scope

### In Scope

- `apps/web/src/app/**/page.tsx` 기반 canonical route coverage
- public, auth, main, my, account, admin surface
- viewport 9종
- guest, user, teamOwner, seller, instructor, admin persona warmup
- page default state + interaction state
- component-level isolated capture contract
- asset inventory and asset-level representative capture contract
- artifact naming, storage, triage, rerun rules

### Out Of Scope

- pixel diff golden test의 CI 강제 도입
- 모든 transient animation frame의 frame-by-frame 비교
- backend API contract 설명 자체
- native app screen capture
- design rule 정의 변경

## 5. Coverage Model

이 문서는 coverage를 4계층으로 본다.

### Layer A. Route Coverage

실제 사용자 여정을 기준으로 page-level surface를 전수 캡처한다.

### Layer B. Interaction Coverage

정적 default 화면만이 아니라 버튼, hover, drawer, dialog, tab, filter, focused form 같은 상태를 캡처한다.

### Layer C. Component Coverage

페이지 안에서 여러 번 반복되는 shell, card, form, feedback component를 isolated 상태로 캡처한다.

### Layer D. Asset Coverage

이미지, 썸네일, 아이콘, badge, empty illustration, fallback media를 개별 inventory와 representative render로 캡처한다.

이 4계층은 서로 대체 관계가 아니다.  
페이지가 있어도 컴포넌트 감사가 끝난 것이 아니고, 컴포넌트가 있어도 에셋 감사가 끝난 것이 아니다.

## 6. Canonical Viewport Matrix

현재 canonical viewport는 runner와 동일하게 아래 9종으로 고정한다.

- Mobile
  - `mobile-sm` `360x780`
  - `mobile-md` `390x844`
  - `mobile-lg` `430x932`
- Tablet
  - `tablet-sm` `768x1024`
  - `tablet-md` `834x1112`
  - `tablet-lg` `1024x1366`
- Desktop
  - `desktop-sm` `1280x800`
  - `desktop-md` `1440x900`
  - `desktop-lg` `1920x1080`

기본 원칙은 아래와 같다.

- mobile, tablet은 touch-first interaction을 본다.
- desktop만 pointer hover를 canonical로 본다.
- 동일 route라도 viewport band에 따라 interaction 기대값이 달라질 수 있다.
- `expected-na`는 실패가 아니라 platform-appropriate absence다.

## 7. Canonical Persona Matrix

현재 runner persona는 아래 6개를 기본으로 한다.

- `guest`
  - warmup: `/landing`
- `user`
  - warmup: `/matches`
- `teamOwner`
  - warmup: `/teams`
- `seller`
  - warmup: `/marketplace`
- `instructor`
  - warmup: `/lessons`
- `admin`
  - warmup: `/admin/dashboard`

운영 원칙:

- public/auth route는 `guest`
- 일반 user route는 `user`
- team/team-match/my-team surface는 `teamOwner`
- listing manage surface는 `seller`
- lesson host/manage surface는 `instructor`
- admin surface는 `admin`

## 8. Route Inventory Contract

### Raw Inventory Rule

- source: `apps/web/src/app/**/page.tsx`
- excluded first-pass templates:
  - `/`
  - `/callback/kakao`
  - `/callback/naver`
- first-pass canonical visual routes: `92`

### Route Families

- `public`
  - `/landing`, `/about`, `/guide`, `/pricing`, `/faq`
- `auth`
  - `/login`
- `matches`
  - `/matches`, `/matches/[id]`, `/matches/new`, `/matches/[id]/edit`
- `team-matches`
  - `/team-matches`, `/team-matches/[id]`, `/team-matches/new`, `/team-matches/[id]/edit`, `/team-matches/[id]/arrival`, `/team-matches/[id]/score`, `/team-matches/[id]/evaluate`
- `teams`
  - `/teams`, `/teams/[id]`, `/teams/new`, `/teams/[id]/edit`, `/teams/[id]/matches`, `/teams/[id]/members`, `/teams/[id]/mercenary`
- `lessons`
  - `/lessons`, `/lessons/[id]`, `/lessons/new`, `/lessons/[id]/edit`
- `marketplace`
  - `/marketplace`, `/marketplace/[id]`, `/marketplace/new`, `/marketplace/[id]/edit`
- `mercenary`
  - `/mercenary`, `/mercenary/[id]`, `/mercenary/new`, `/mercenary/[id]/edit`
- `venues`
  - `/venues`, `/venues/[id]`, `/venues/[id]/edit`
- `tournaments`
  - `/tournaments`, `/tournaments/[id]`, `/tournaments/new`
- `payments`
  - `/payments`, `/payments/checkout`, `/payments/[id]`, `/payments/[id]/refund`
- `account`
  - `/profile`, `/settings`, `/settings/account`, `/settings/notifications`, `/settings/privacy`, `/settings/terms`, `/notifications`, `/chat`, `/chat/[id]`, `/reviews`, `/badges`, `/feed`
- `my`
  - `/my/matches`, `/my/team-matches`, `/my/team-match-applications`, `/my/teams`, `/my/mercenary`, `/my/lessons`, `/my/lesson-tickets`, `/my/listings`, `/my/reviews-received`
- `user`
  - `/user/[id]`
- `admin`
  - `/admin/dashboard`, `/admin/disputes`, `/admin/disputes/[id]`, `/admin/lesson-tickets`, `/admin/lessons`, `/admin/lessons/[id]`, `/admin/matches`, `/admin/matches/[id]`, `/admin/mercenary`, `/admin/payments`, `/admin/reviews`, `/admin/settlements`, `/admin/statistics`, `/admin/team-matches`, `/admin/team-matches/[id]`

### Batch Contract

- `batch-1-public-auth`
- `batch-2-main-discovery`
- `batch-3-detail-pages`
- `batch-4-create-edit-forms`
- `batch-5-account-utility`
- `batch-6-admin`
- `batch-7-interactions`
- `batch-8-rerun`

## 9. Page Interaction Matrix Contract

페이지별 interaction matrix는 "모든 버튼을 무조건 다 누른다"가 아니라, 시각적으로 의미 있는 상태를 계약으로 고정하는 방식으로 관리한다.

### Canonical State IDs

- `default`
- `scrolled`
- `focus-first-input`
- `hover-primary-cta`
- `hover-card-first`
- `menu-open`
- `filter-open`
- `tab-switch`
- `dialog-open`
- `drawer-open`

### Interaction Rules By Platform

- mobile
  - `default`, `scrolled`, `focus-first-input`, `menu-open`, `filter-open`, `tab-switch`, `dialog-open`, `drawer-open`
- tablet
  - mobile과 동일하되 split layout이나 side panel이 있으면 그 차이를 별도 증거로 남긴다
- desktop
  - mobile/tablet 상태 + `hover-primary-cta`, `hover-card-first`

### Interaction Rules By Route Type

- marketing pages
  - `default`
  - `scrolled`
  - `menu-open`
  - `hover-primary-cta` on desktop
- login/auth
  - `default`
  - `focus-first-input`
- discovery list pages
  - `default`
  - `scrolled`
  - `focus-first-input` when search exists
  - `filter-open` when filter sheet or panel exists
  - `hover-card-first` on desktop
- detail pages
  - `default`
  - `scrolled`
  - `dialog-open` when media/lightbox/contact modal exists
  - `drawer-open` when bottom sheet exists
- create/edit forms
  - `default`
  - `focus-first-input`
  - `scrolled`
  - `dialog-open` when picker/uploader modal exists
- account/utility pages
  - `default`
  - `scrolled`
  - `hover-primary-cta` only where CTA density is meaningful
- chat/notifications/feed
  - `default`
  - `scrolled`
  - `drawer-open` or `dialog-open` when auxiliary actions exist
- admin tables and ops detail
  - `default`
  - `scrolled`
  - `filter-open`
  - `dialog-open` for approval/refund/detail drawer if present

### What Must Be Documented Per Route

각 route template는 최소 아래 항목을 가져야 한다.

- canonical persona
- ready selector contract
- supported states
- viewport exceptions
- expected-na states
- degraded candidate 가능 여부
- blocking dependencies

## 10. Component Catalog Capture Contract

현재 저장소에는 Storybook이나 dedicated catalog route가 없다.  
따라서 component capture는 두 단계로 나눈다.

### Phase 1. Route-Sourced Component Capture

페이지에서 실제 렌더되는 공용 컴포넌트를 crop 또는 dedicated route state로 수집한다.

### Phase 2. Dedicated Catalog

추후 Storybook 또는 `/__catalog/*` 전용 route를 도입해 isolated component capture를 canonical로 승격한다.

### Canonical Component Families

- Shell / Chrome
  - landing nav
  - mobile glass header
  - bottom nav
  - desktop top nav
  - filter bar
  - tab strip
- Discovery Content
  - match card
  - team match card
  - lesson card
  - marketplace listing card
  - mercenary card
  - venue card
  - tournament card
- Identity / Profile
  - profile summary block
  - stats strip
  - badge row
  - account menu row
- Form / Input
  - text input
  - textarea
  - select
  - segmented toggle
  - chip filter
  - date/time picker trigger
  - image uploader
- Feedback / Overlay
  - dialog
  - drawer
  - toast
  - empty state
  - loading state
  - error state
- Transaction / Trust
  - payment summary card
  - refund status card
  - review card
  - participant status row
  - admin action panel

### Required States Per Component Family

- button-like
  - `default`
  - `hover` desktop only
  - `pressed` optional
  - `disabled`
  - `loading` when supported
- card-like
  - `default`
  - `hover` desktop only
  - `selected` when selectable
  - `empty/media-fallback` when applicable
- input-like
  - `default`
  - `focus`
  - `filled`
  - `error`
  - `disabled`
- overlay-like
  - `open`
  - `scroll-inside`
  - `close affordance visible`
- list/item-like
  - `default`
  - `dense`
  - `long-text`
  - `empty`
- media-like
  - `cover`
  - `contain`
  - `fallback`
  - `multi-image` when gallery exists

### Component Catalog Deliverables

- component inventory list
- representative source route or dedicated story id
- required states
- target viewports
- screenshot evidence path
- known variants and exceptions

## 11. Asset Inventory Capture Contract

페이지 screenshot 안에 자산이 우연히 보인다고 해서 asset audit가 끝난 것은 아니다.  
asset inventory는 별도 계층으로 본다.

### Canonical Asset Families

- Brand
  - logo mark
  - wordmark
  - favicon/app icon derived surfaces
- Icons
  - nav icons
  - status icons
  - category icons
  - badge icons
- Identity Media
  - avatar
  - team emblem
  - user profile image
- Content Thumbnails
  - match thumbnail
  - lesson hero/thumbnail
  - marketplace item image
  - mercenary cover
  - venue image
  - tournament poster
- System Illustrations
  - empty state illustration
  - onboarding illustration
  - placeholder/fallback artwork
- Transaction / Trust Assets
  - payment method marks
  - settlement/refund visual badges
- Uploaded Media
  - gallery images
  - attachment previews
  - review photos if present

### Source Of Truth Candidates

- `apps/web/public/mock/`
- `apps/web/public/mock/photoreal/`
- `apps/api/prisma/mock-image-catalog.ts`
- code-level icon sources rendered through component tree

### Required Asset Evidence

각 asset family는 최소 2종의 증거를 가져야 한다.

1. inventory entry
   - source path or generator
   - owner surface
   - fallback relation
2. representative render capture
   - 실제 페이지 또는 catalog에서 보이는 상태

필요 시 3번째 증거를 추가한다.

3. isolated asset preview
   - crop, dedicated asset route, 또는 inventory report thumbnail

### Asset-Specific Questions To Answer

- fallback이 존재하는가
- fallback이 실제 렌더링에서 깨지지 않는가
- dense list crop에서 내용이 읽히는가
- detail hero에서 과하게 확대되거나 잘리지 않는가
- light/dark or tinted surface 위에서 브랜드 충돌이 없는가

## 12. Data-Ready And Loading Contract

모든 캡처는 "데이터가 다 로딩된 뒤"라는 전제가 있어야 의미가 있다.

### Required Readiness Per Capture

- route-specific ready selector 또는 shared layout ready selector가 먼저 만족되어야 한다
- suspense skeleton, spinners, optimistic placeholder가 사라졌는지 확인해야 한다
- 네트워크가 길게 흔들리는 route는 route-specific extended timeout을 둘 수 있다
- empty state도 valid capture다. 다만 `empty by design`과 `broken load`는 구분 기록해야 한다

### Bootstrap Rules

- dynamic route fixture가 없을 때만 `--allow-bootstrap-writes` 사용
- localhost API에서만 허용
- bootstrap이 create한 데이터는 resolution note에 남긴다
- bootstrap dependency가 강한 route는 batch 도중 broad run보다 targeted run이 우선이다

## 13. Artifact Contract

root:

- `output/playwright/visual-audit/<run-id>/`

required files:

- `route-manifest.json`
- `run-metadata.json`
- `viewport-matrix.json`
- `persona-matrix.json`
- `summary.md`

required directories:

- `screenshots/`
- `console/`
- `network/`
- `checkpoints/`
- `issues/`

current screenshot contract:

- `screenshots/<family>/<route>/<viewport>/<state>.png`

future expansion contract:

- `components/<family>/<component>/<viewport>/<state>.png`
- `assets/<family>/<asset>/<variant>.png`

## 14. Execution Order

### Wave 1. Route Completeness

- manifest `92/92 resolved`
- batch 1-6 default capture completeness
- route-level blockers 분류

### Wave 2. Interaction Completeness

- batch 7 interaction sweep
- route family별 required state 충족
- expected-na와 real blocker 구분

### Wave 3. Component Completeness

- component inventory 정리
- route-sourced component capture 우선 실행
- 부족한 경우 dedicated catalog route 설계

### Wave 4. Asset Completeness

- asset inventory 추출
- representative render capture
- fallback audit

### Wave 5. Design Review Output

- good patterns
- drift patterns
- remediation backlog
- canonical screenshot 승격 후보

## 15. Triage Model

### Result Buckets

- `captured`
  - 정상 캡처 완료
- `expected-na`
  - viewport/platform 특성상 상태가 없어서 정상 제외
- `degraded candidate`
  - route는 열리지만 policy/data 상태로 제한된 UI 가능
- `blocked`
  - selector drift, runtime failure, navigation timeout, auth mismatch, dev server instability 등으로 캡처 실패

### Common Failure Interpretation

- `ready selector not found`
  - selector drift 또는 loading contract 누락
- `page.goto timeout`
  - first compile, unstable route, data dependency 의심
- `ERR_CONNECTION_RESET` / `ERR_EMPTY_RESPONSE`
  - shared Next dev 과부하 가능성이 높음
- `auth wall false negative`
  - warmup/auth hydration drift 의심

## 16. Documentation Maintenance Rules

- route inventory 변경 시 Task 54를 갱신한다.
- 새 canonical state를 추가하면 Task 54, Task 53, runbook, config를 같은 변경에서 sync한다.
- component catalog가 도입되면 Task 54의 Phase 2 섹션을 actual contract로 승격한다.
- asset inventory 스크립트나 리포트가 생기면 Task 54에 source 경로와 artifact contract를 추가한다.
- Task 50은 history만 유지하고, 새 실행 규칙은 Task 54 또는 Task 53에만 적는다.

## 17. Immediate Follow-Up Backlog

1. route별 interaction coverage 표를 실제 config와 1:1로 정리한다.
2. component inventory를 `shell`, `list`, `detail`, `form`, `overlay`, `transaction` 축으로 실제 코드 기준 추출한다.
3. asset inventory script 또는 manual manifest를 추가한다.
4. component isolated capture를 위한 Storybook 또는 `__catalog` route 전략을 고정한다.
5. final audit summary에서 `page`, `component`, `asset` finding을 분리 보고한다.

## 18. Done Definition

아래가 모두 충족되면 이 문서 기준의 visual audit program이 complete다.

- route layer complete
  - `92/92` manifest resolved
  - batch 1-6 default captures exist across 9 viewports
- interaction layer complete
  - batch 7 sweep exists
  - required interaction states are either captured or honestly classified as expected-na
- component layer complete
  - component inventory exists
  - representative isolated evidence exists
- asset layer complete
  - asset inventory exists
  - representative render and fallback evidence exists
- documentation complete
  - Task 54, Task 53, runbook, relevant config are in sync
