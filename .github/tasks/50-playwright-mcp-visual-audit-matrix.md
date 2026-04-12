# Task 50 — Playwright MCP Visual Audit Matrix

> Historical audit infrastructure task. Design rules live in `DESIGN.md`. Unified visual coverage rules now live in `.github/tasks/54-unified-visual-audit-coverage-master.md`. This file remains implementation evidence and process history only.

Owner: project-director -> tech-planner -> qa/ui/frontend
Date drafted: 2026-04-11
Status: Implemented foundation with hardened resolver + capture contracts, public/auth full rerun, and late-hydration ready fix
Priority: P0
Baseline commit: `9ba813a25a349f4d60a1b5412ed8c90a455beb68` (`2026-04-06 14:27:18 +0900`)

## Why This Task Exists

현재 디자인/레이아웃 논의는 일부 페이지 단위의 수동 캡처에 의존하고 있다.

사용자 요구는 더 크다.

- Playwright MCP를 사용한다.
- 모든 의미 있는 페이지를 본다.
- mobile 3종, tablet 3종, desktop 3종의 서로 다른 viewport로 본다.
- 단순 정적 화면뿐 아니라 hover, click, open, tab, menu, drawer, dialog 같은 interaction state도 함께 본다.
- 데이터가 완전히 로드된 뒤에만 캡처한다.
- 한 번 찍고 끝내지 않고, 이후 디자인/QA/remediation의 증거 체계로 재사용할 수 있어야 한다.

이 task는 새로운 UI 구현 task가 아니다.
1차 목표는 `Playwright MCP 기반 전수 시각 감사 체계`를 설계하고, route/state/evidence 계약을 고정하는 것이다.

## Execution Result

Executed on: 2026-04-11

Implemented files:

- `scripts/qa/visual-audit-config.mjs`
- `scripts/qa/run-visual-audit.mjs`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx`
- `apps/web/src/components/layout/mobile-glass-header.tsx`
- `package.json`
- `Makefile`
- `docs/PLAYWRIGHT_E2E_RUNBOOK.md`
- `AGENTS.md`

What changed:

- filesystem route inventory를 읽고 batch/family/persona/state를 분류하는 visual audit config를 추가했다.
- concrete URL manifest를 생성하고 dynamic route를 resolve/block으로 분류하는 runner를 추가했다.
- viewport/state별 screenshot, console, network, issue artifact를 남기는 capture command를 추가했다.
- long-run 운영을 위해 manifest/capture 진행 로그, incremental checkpoint flush, `run-metadata.json` 기록을 추가했다.
- family별 `checkpoints/<family>.json`과 `issues/<family>.md`를 항상 남기도록 해 rerun triage 근거를 고정했다.
- manifest route entry에 `warmupPath`를 포함해 persona bootstrap 맥락을 바로 추적할 수 있게 했다.
- route별 ready contract와 interaction state assertion contract를 config로 분리해 false positive를 줄였다.
- dynamic resolver를 visible anchor 우선 + API strategy error note 기록 방식으로 보강했다.
- long-run 안정성을 위해 atomic artifact write, viewport 단위 session cleanup, signal failure metadata를 추가했다.
- `.run.lock` 기반 run-id 동시 실행 차단을 추가해 같은 artifact directory를 두 프로세스가 동시에 쓰지 못하게 했다.
- bootstrap write는 `--allow-bootstrap-writes` opt-in + localhost guard로 제한했다.
- shared root header/top-zone에 generic `data-testid`를 추가해 ready selector 안정성을 높였다.
- `waitForVisibleSelector()`가 late-attached selector를 놓치지 않도록 polling 기반으로 보강했다.
- `/home`은 Suspense skeleton 체류 시간이 긴 페이지라 route-specific ready contract와 extended timeout을 추가했다.
- `Makefile`, runbook, AGENTS에 visual audit 명령/운영 규칙/`batch-8-rerun` 예외를 실제 코드와 맞췄다.

Validation:

- `node --check scripts/qa/visual-audit-config.mjs` ✅
- `node --check scripts/qa/run-visual-audit.mjs` ✅
- `pnpm --filter web exec tsc --noEmit` ✅
- sample manifest ✅
  - `node scripts/qa/run-visual-audit.mjs manifest --run-id visual-smoke --limit 5`
  - `4/5 resolved`, unresolved sample: `/chat/[id]`
- public/auth batch manifest ✅
  - `node scripts/qa/run-visual-audit.mjs manifest --run-id visual-full --batch batch-1-public-auth`
  - `6/6 resolved`
- account/utility batch manifest ✅
  - `node scripts/qa/run-visual-audit.mjs manifest --run-id task50-manifest-batch5 --batch batch-5-account-utility`
  - `21/21 resolved`
- full canonical manifest ✅
  - `node scripts/qa/run-visual-audit.mjs manifest --run-id task50-full-manifest-r6`
  - `92/92 resolved`, `0 blocked`
- route-specific degraded fallback ✅
  - `node scripts/qa/run-visual-audit.mjs manifest --run-id task50-check-payments-refund-r3 --route '/payments/[id]/refund'`
  - `1/1 resolved`
  - resolution note: `degraded candidate: refund UI may be blocked by payment mode or policy`
- sample capture partial evidence ✅
  - `output/playwright/visual-audit/visual-smoke/screenshots/auth/login/mobile-md/default.png`
  - `output/playwright/visual-audit/visual-smoke/screenshots/auth/login/mobile-md/focus-first-input.png`
  - `output/playwright/visual-audit/visual-smoke/screenshots/account/badges/mobile-md/default.png`
  - `output/playwright/visual-audit/visual-smoke/screenshots/account/badges/mobile-md/scrolled.png`
- capture checkpoint + metadata ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-capture-check --route /login --viewports mobile-md,desktop-md --states default,focus-first-input`
  - `4 captured`
  - `output/playwright/visual-audit/task50-capture-check/run-metadata.json`
- interaction state smoke ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-interaction-check --route /login --viewports mobile-md --states tab-switch,dialog-open,drawer-open`
  - `0 captured / 3 expected-na`
  - `output/playwright/visual-audit/task50-interaction-check/checkpoints/auth.json`
- interaction assertion smoke ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-matches-filter-r1 --route /matches --viewports mobile-md,desktop-md --states default,filter-open`
  - `4 captured / 0 blocked`
  - honest failure sample: `task50-landing-menu-r2` -> `/landing menu-open` blocked instead of false-positive
- make alias smoke ✅
  - `make qa-visual-audit-manifest RUN=task50-make-check BATCH=batch-1-public-auth LIMIT=2`
  - `2/2 resolved`
- make extra flag smoke ✅
  - `make qa-visual-audit-manifest RUN=task50-make-extra ROUTE=/login EXTRA='--allow-bootstrap-writes' LIMIT=1`
  - `1/1 resolved`
- make alias capture ✅
  - `make qa-visual-audit-capture RUN=task50-make-capture ROUTE=/login VIEWPORTS=mobile-md,desktop-md STATES=default,focus-first-input`
  - `4 captured`
- run-id lock smoke ✅
  - first process: `node scripts/qa/run-visual-audit.mjs capture --run-id task50-lock-smoke --route /matches --viewports mobile-md,desktop-md --states default,filter-open`
  - second process with same `run-id`: fails with `run-id "task50-lock-smoke" is already in use`
- public/auth 9-viewport batch checkpoint ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-batch1-all9-rerun2 --batch batch-1-public-auth --viewports mobile-sm,mobile-md,mobile-lg,tablet-sm,tablet-md,tablet-lg,desktop-sm,desktop-md,desktop-lg`
  - paused after checkpoint with `58 captured`, `19 expected-na`, `0 blocked`
- public/auth 9-viewport full rerun ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-batch1-all9-r3 --batch batch-1-public-auth --viewports mobile-sm,mobile-md,mobile-lg,tablet-sm,tablet-md,tablet-lg,desktop-sm,desktop-md,desktop-lg`
  - `138 captured`, `0 blocked`, `60 expected-na`
- `/home` late-hydration ready fix ✅
  - `node scripts/qa/run-visual-audit.mjs capture --run-id task50-home-ready-r2 --route /home --viewports mobile-sm --states default`
  - `1 captured`, `0 blocked`

Current caveats:

- full `92 route x 9 viewport x interaction state` 실행은 이번 턴에서 끝까지 돌리지 않았다.
- batch 2-6 full rerun은 아직 남아 있다. 다만 public/auth blocker와 `/home` ready false-negative는 제거했다.
- interaction executor는 `default`, `scrolled`, `focus-first-input`, `hover-primary-cta`, `hover-card-first`, `menu-open`, `filter-open`, `tab-switch`, `dialog-open`, `drawer-open`까지 지원한다. 다만 route별 state assertion recipe가 아직 없는 surface에서는 `expected-na`가 남을 수 있다.
- Playwright MCP browser transport는 이 턴에서 직접 샘플 검수 시 `Transport closed`로 불안정했다. 따라서 current runtime에서는 local headless Playwright runner artifact를 canonical fallback 검증 근거로 사용했다.
- `batch-8-rerun`은 기존 `capture-results.json`이 있는 동일 `run-id`에서만 동작한다.
- `batch-8-rerun` 예외를 제외하면 `RUN`은 항상 새 값으로 주는 운영 규칙을 유지한다.

## Scope Definition

### In Scope

- `apps/web/src/app/**/page.tsx` 기준 의미 있는 시각 route 전체
- public, auth, main, admin surface
- route별 기본 상태 + interaction 상태 캡처
- viewport 9종 고정
- persona/auth bootstrap 설계
- dynamic route concrete URL manifest 설계
- fully-loaded 판정 규칙 설계
- raw artifact 구조 설계
- batch 실행 순서와 실패 재시도 규칙 설계

### Out Of Scope

- 실제 UI remediation 구현
- pixel diff golden test 도입
- CI full matrix 자동화
- root redirect `/`의 별도 시각 캡처
- OAuth callback page의 시각 캡처
- error/global-error/not-found page를 1차 canonical visual inventory에 포함하는 일

## Route Inventory Baseline

### Raw inventory

- `apps/web/src/app/**/page.tsx`: `95`

### Excluded from first visual inventory

- `/` root redirect page
- `/callback/kakao`
- `/callback/naver`

### First-pass visual audit target

- canonical visual routes: `92`

### Family breakdown

- public marketing
  - `/landing`
  - `/about`
  - `/guide`
  - `/pricing`
  - `/faq`
- auth
  - `/login`
- main discovery root
  - `/home`
  - `/matches`
  - `/team-matches`
  - `/teams`
  - `/lessons`
  - `/marketplace`
  - `/mercenary`
  - `/venues`
  - `/tournaments`
- account / utility
  - `/profile`
  - `/settings`
  - `/settings/account`
  - `/settings/notifications`
  - `/settings/privacy`
  - `/settings/terms`
  - `/notifications`
  - `/chat`
  - `/reviews`
  - `/badges`
  - `/feed`
- my surfaces
  - `/my/matches`
  - `/my/team-matches`
  - `/my/team-match-applications`
  - `/my/teams`
  - `/my/mercenary`
  - `/my/lessons`
  - `/my/lesson-tickets`
  - `/my/listings`
  - `/my/reviews-received`
- detail / form / management
  - `/matches/[id]`
  - `/matches/new`
  - `/matches/[id]/edit`
  - `/team-matches/[id]`
  - `/team-matches/new`
  - `/team-matches/[id]/edit`
  - `/team-matches/[id]/arrival`
  - `/team-matches/[id]/score`
  - `/team-matches/[id]/evaluate`
  - `/teams/[id]`
  - `/teams/new`
  - `/teams/[id]/edit`
  - `/teams/[id]/matches`
  - `/teams/[id]/members`
  - `/teams/[id]/mercenary`
  - `/lessons/[id]`
  - `/lessons/new`
  - `/lessons/[id]/edit`
  - `/marketplace/[id]`
  - `/marketplace/new`
  - `/marketplace/[id]/edit`
  - `/mercenary/[id]`
  - `/mercenary/new`
  - `/mercenary/[id]/edit`
  - `/venues/[id]`
  - `/venues/[id]/edit`
  - `/tournaments/[id]`
  - `/tournaments/new`
  - `/payments`
  - `/payments/checkout`
  - `/payments/[id]`
  - `/payments/[id]/refund`
  - `/chat/[id]`
  - `/user/[id]`
- admin
  - `/admin/dashboard`
  - `/admin/disputes`
  - `/admin/disputes/[id]`
  - `/admin/lesson-tickets`
  - `/admin/lessons`
  - `/admin/lessons/[id]`
  - `/admin/matches`
  - `/admin/matches/[id]`
  - `/admin/mercenary`
  - `/admin/payments`
  - `/admin/reviews`
  - `/admin/settlements`
  - `/admin/statistics`
  - `/admin/team-matches`
  - `/admin/team-matches/[id]`
  - `/admin/teams`
  - `/admin/teams/[id]`
  - `/admin/users`
  - `/admin/users/[id]`
  - `/admin/venues`
  - `/admin/venues/new`
  - `/admin/venues/[id]`

## Core Design / QA Goal

이 task의 목적은 “모든 화면이 예쁜가”를 감으로 판단하는 것이 아니다.

아래를 evidence 기반으로 판정하는 체계를 만드는 것이다.

1. baseline commit 대비 현재 화면이 더 좋아졌는가, 아니면 drift가 생겼는가
2. viewport에 따라 spacing, hierarchy, chrome, content density가 무너지는가
3. interaction 상태에서 예상치 못한 visual defect가 생기는가
4. route family 내부에서 같은 control language를 유지하는가
5. 이후 remediation task로 연결할 수 있을 정도로 산출물이 구조화되어 있는가

## Source Of Truth

- route inventory: `apps/web/src/app/**/page.tsx`
- scenario hub: `docs/scenarios/index.md`
- Playwright runtime contract: `docs/PLAYWRIGHT_E2E_RUNBOOK.md`
- isolated runner background: `.github/tasks/46-isolated-playwright-runner-stacks.md`
- design baseline: commit `9ba813a`
- design rules: `.impeccable.md`, `AGENTS.md`

## Operating Principles

1. Playwright MCP를 preferred browser driver로 본다. 단, transport가 불안정한 현재 로컬 환경에서는 local headless Playwright runner를 canonical fallback execution path로 사용한다.
2. batch는 route family 단위로 끊는다. 모든 route를 단일 세션에서 끝내려 하지 않는다.
3. 각 family 종료 시 checkpoint를 남긴다.
4. hover와 tap은 같은 state로 취급하지 않는다.
5. dynamic route는 concrete URL resolver를 통해 실존 엔티티에 매핑한다.
6. 캡처는 `fully loaded` 판정 후에만 허용한다.
7. raw artifact와 review note는 함께 남긴다.
8. blocked route는 숨기지 않고 명시적으로 분류한다.

## Viewport Matrix

### Mobile

- `mobile-sm`: `360x780`
- `mobile-md`: `390x844`
- `mobile-lg`: `430x932`

### Tablet

- `tablet-sm`: `768x1024`
- `tablet-md`: `834x1112`
- `tablet-lg`: `1024x1366`

### Desktop

- `desktop-sm`: `1280x800`
- `desktop-md`: `1440x900`
- `desktop-lg`: `1920x1080`

## Persona Matrix

### Guest

Used for:

- public marketing routes
- login
- protected route auth-wall verification

### Regular user

Used for:

- `/home`
- `/matches*`
- `/lessons*`
- `/marketplace*`
- `/mercenary*`
- `/venues*`
- `/payments*`
- `/profile`
- `/settings*`
- `/notifications`
- `/chat*`
- `/reviews`

### Team owner / manager

Used for:

- `/teams/[id]*`
- `/team-matches*`
- `/my/teams`
- `/my/team-matches`
- `/my/team-match-applications`

### Seller / instructor / listing owner

Used for:

- `/marketplace/new`
- `/marketplace/[id]/edit`
- `/lessons/new`
- `/lessons/[id]/edit`
- `/my/listings`
- `/my/lessons`

### Admin

Used for:

- `/admin/**`

## Dynamic Route Manifest Contract

동적 라우트는 route template만으로는 시각 검수가 불가능하다.

반드시 실행 전에 concrete URL manifest를 만든다.

예:

- `/matches/[id]` -> 실제 존재하는 매치 id
- `/teams/[id]` -> owner가 접근 가능한 팀 id
- `/marketplace/[id]/edit` -> 본인 소유 listing id
- `/admin/users/[id]` -> 실제 사용자 id

Manifest requirements:

- route template
- concrete URL
- required persona
- warmup route
- ready selector
- supported states
- notes

## Fully Loaded Contract

화면은 아래 순서를 만족해야만 “캡처 가능” 상태로 본다.

1. `goto`
2. `domcontentloaded`
3. best-effort `networkidle`
4. route-specific warmup done
5. main content visible
6. known skeleton/shimmer/loader gone
7. blocking toast/dialog/spinner absence 확인
8. route-specific ready selector visible
9. 추가 settle wait `300~1000ms`

Route-specific ready selector examples:

- `/home`: first primary section header
- `/matches`: search input + first result or empty state
- `/profile`: header title + summary card
- `/chat/[id]`: room scaffold + message pane
- `/admin/dashboard`: stats cards or honest empty state

## Interaction State Taxonomy

### Executor-supported states

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

### Reserved / route-specific future states

- `active-nav`
- `hover-nav-item`
- `hover-menu-trigger`
- `sheet-open`
- `search-active`
- `bottom-nav-active`
- `dropdown-open`
- `popover-open`
- `calendar-open`
- `map-view`
- `list-view`
- `empty-state`
- `error-state` when reproducible without artificial mutation

## Route Family Interaction Recipes

### Public / marketing

- header default
- mobile menu open
- desktop nav hover
- CTA hover
- footer visibility

### Discovery root

- search focused
- filter row scrolled
- filter sheet open
- tab/category switched
- first card hover on desktop
- list/map toggle where supported

### Detail pages

- header scrolled
- image/gallery open when supported
- sticky CTA visible
- related section visible
- primary action hover or pressed

### Create / edit forms

- first invalid/empty default
- focused input
- select open
- date picker open
- image uploader idle
- image uploader populated when deterministic

### Utility / account

- header default
- section scrolled
- segmented/tab toggle
- notification action open
- chat room selected

### Admin

- table/list default
- filter open
- detail side panel or modal open when supported
- action dropdown open

## Artifact Contract

### Raw output root

- `output/playwright/visual-audit/<run-id>/`

### Required artifacts

- `route-manifest.json`
- `viewport-matrix.json`
- `persona-matrix.json`
- `screenshots/<family>/<route>/<viewport>/<state>.png`
- `console/<family>/<route_slug>__<viewport>__<state>.log`
- `network/<family>/<route_slug>__<viewport>__<state>.json`
- `checkpoints/<family>.json`
- `issues/<family>.md`
- `summary.md`

### Naming convention

Example:

- `screenshots/account/profile/mobile-md/default.png`
- `screenshots/matches/list/desktop-lg/filter-open.png`
- `screenshots/public/landing/mobile-sm/menu-open.png`

### Canonical docs promotion

- raw artifact는 일회성 실행 증거다.
- 문서 canonical screenshot은 raw artifact에서 선별 승인된 결과만 `docs/screenshots` 또는 관련 문서로 승격한다.

## Failure Classification

### Retryable

- 일시적 hydration race
- lazy section not yet visible
- transient websocket/fetch lag
- first navigation compile stall

### Blocked

- route 500
- auth dead-end
- unresolved data dependency
- deterministic transport close
- missing entity for dynamic route

### Expected N/A

- mobile hover
- desktop-only chrome state on mobile
- feature flag로 존재하지 않는 interaction

## Retry Policy

1. same route reload
2. same persona reauth
3. warmup route 진입 후 대상 route 재진입
4. family batch 재시작
5. shared dev 불안정 시 isolated runner 전환

## Batch Execution Plan

### Batch 1 — Public + Auth

Targets:

- `/landing`
- `/about`
- `/guide`
- `/pricing`
- `/faq`
- `/login`

Focus:

- shell
- navigation
- marketing CTA
- mobile menu
- desktop hover

### Batch 2 — Main Discovery Root

Targets:

- `/home`
- `/matches`
- `/team-matches`
- `/teams`
- `/lessons`
- `/marketplace`
- `/mercenary`
- `/venues`
- `/tournaments`

Focus:

- top section
- filters
- list/grid density
- bottom nav
- map/list toggle

### Batch 3 — Detail Pages

Targets:

- `*[id]` detail pages across match/team/lesson/listing/mercenary/venue/tournament/payment/user/chat/admin detail

Focus:

- header
- hero/media
- sticky CTA
- related sections
- scroll behavior

### Batch 4 — Create / Edit / Form Pages

Targets:

- `new`
- `edit`
- `checkout`
- `refund`
- `arrival`
- `score`
- `evaluate`

Focus:

- form layout
- validation-ready state
- picker/dropdown open
- upload/input affordance

### Batch 5 — Account / Utility / My

Targets:

- `/profile`
- `/settings*`
- `/notifications`
- `/chat`
- `/reviews`
- `/badges`
- `/feed`
- `/my/**`

Focus:

- utility density
- header rhythm
- menu grouping
- segmented or list affordance

### Batch 6 — Admin

Targets:

- `/admin/**`

Focus:

- table/list readability
- filters
- action dropdowns
- detail pages
- dashboard density

### Batch 7 — Interaction-Only Sweep

Purpose:

- 기본 상태 캡처 후, route family별 interaction recipe를 다시 적용

Focus:

- hover
- menu open
- filter open
- dialog open
- drawer open
- tab switched

### Batch 8 — Blocked / Fail Rerun

Purpose:

- blocked/retryable route만 재실행
- root cause triage 정리

## Evidence Review Questions

각 route/state마다 아래 질문을 본다.

1. baseline 대비 레이아웃이 더 명확해졌는가
2. viewport에 따라 spacing이 무너지는가
3. interaction 상태에서 surface가 겹치거나 잘리는가
4. hover/open state에서 glass/shadow/border가 과해지는가
5. family 내부 control language가 일관적인가
6. 실제 데이터가 로드되기 전에 빈 skeleton을 찍지는 않았는가
7. route가 blocked라면 원인이 product인지 runtime인지 분리되었는가

## Deliverables

1. detailed route manifest
2. viewport matrix
3. persona matrix
4. raw screenshot artifact set
5. route-family issue logs
6. final visual audit summary
7. remediation backlog candidates

## Acceptance Criteria

- 의미 있는 visual route `92`개가 family manifest에 포함된다.
- viewport `9`종이 문서와 실행 설정에서 동일하게 유지된다.
- 각 route는 최소 `default` 상태를 가진다.
- interaction state는 route family recipe로 선언된다.
- 캡처는 fully-loaded 계약 뒤에만 수행된다.
- blocked/retryable/expected-na 분류가 명시된다.
- 산출물 경로와 파일명 규칙이 재실행 가능하게 고정된다.
- batch 종료마다 checkpoint note를 남길 수 있다.

## Sequenced Execution Plan

1. Task 50 문서를 canonical source로 고정한다.
2. route template inventory를 concrete route manifest로 변환한다.
3. persona/auth bootstrap을 고정한다.
4. fully-loaded wait contract와 ready selector registry를 만든다.
5. viewport matrix를 실행 설정과 artifact naming에 반영한다.
6. Batch 1부터 Batch 6까지 기본 상태 캡처를 순차 실행한다.
7. Batch 7에서 interaction-only sweep을 수행한다.
8. Batch 8에서 blocked/fail rerun과 triage를 수행한다.
9. route family별 issue log를 정리한다.
10. visual audit summary와 remediation backlog를 만든다.

## Risks

1. MCP 장시간 세션에서 transport drift가 날 수 있다.
2. dynamic route용 concrete entity 확보가 실패하면 coverage가 깨진다.
3. shared dev stack의 compile instability가 long run을 오염시킬 수 있다.
4. 산출물이 과도하게 많아지면 review가 어려워질 수 있다.
5. hover와 mobile tap state를 혼동하면 잘못된 QA 기준이 된다.

## Risk Handling

- family 단위 브라우저 세션 분리
- concrete URL manifest 선행
- shared 불안정 시 isolated runner 전환
- raw artifact + issue summary 동시 기록
- viewport/state applicability를 명시적으로 분리

## Definition Of Done

아래 문장을 자연스럽게 말할 수 있으면 완료다.

“이제 MatchUp의 의미 있는 시각 route 전부를 9개 viewport와 주요 interaction state 기준으로 Playwright MCP에서 재현할 수 있고, 각 캡처는 fully-loaded 조건과 persona/context, 실패 분류, follow-up 근거까지 함께 남는다.”
