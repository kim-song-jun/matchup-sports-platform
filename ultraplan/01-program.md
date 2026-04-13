# UI/UX Audit Program

## Mission

현재 저장소에 이미 있는 visual audit와 design-system 자산을 재활용해, 아래 5개를 실제로 끝까지 닫는 실행 프로그램을 만든다.

1. design system 구축
2. 현재 상태 분석
3. 전체 스크린샷 촬영
4. page/module별 평가와 개편안 도출
5. broken flow 발견 시 stop -> bug report -> fix loop 운영

## Key Decisions

### 1. 새 master contract는 만들지 않는다

- visual coverage truth는 Task 54
- remediation truth는 Task 58
- `ultraplan/`은 execution workspace만 담당

### 2. 전면 재파운데이션은 하지 않는다

- 현재 인프라는 이미 충분히 존재한다.
- 필요한 일은 `artifact truth 정리 -> 부족한 evidence 보강 -> evidence 기반 remediation`이다.

### 3. primitive default fix를 adoption보다 먼저 한다

- `Card`와 `Button` 기본값이 DESIGN.md와 완전히 맞지 않은 상태에서 adoption을 넓히면 debt만 커진다.
- discovery/detail/form family 전개 전에 primitive baseline을 먼저 안전화한다.

### 4. route-sourced capture를 먼저 쓴다

- Storybook은 아직 없다.
- 현재는 `run-visual-audit.mjs`, `capture-component-catalog.mjs`, `capture-asset-inventory.mjs`가 이미 있으므로, 첫 라운드는 route-sourced evidence를 최대한 활용한다.
- dedicated `__catalog` route는 primitive/overlay state 증거가 부족할 때만 후속 도입한다.

### 5. 병렬성은 lane 단위로만 준다

- shared stack 병렬 broad capture는 금지
- isolated runner를 lane별로 나눠서 병렬 운영
- lane 내부는 mobile -> tablet -> desktop 순차 유지

### 6. 수정 페이지는 반드시 재촬영한다

- remediation으로 수정된 page/component는 관련 route screenshot을 다시 찍어 개선 여부를 직접 확인한다.
- 최소 `default` 재캡처는 필수다.
- layout hierarchy, scroll rhythm, interaction feedback이 달라졌으면 `scrolled` 또는 관련 interaction state도 함께 재캡처한다.

## Current State

- design-system compliance: 약 `55%`
- visual route inventory: `92`
- viewport matrix: `9`
- component catalog helper: `12` entries, `mobile-md` / `desktop-md` only
- asset render helper: representative render target `4`개
- historical artifact는 일부 재사용 가능

현재의 핵심 gap:

- verified coverage가 full matrix 수준으로 닫히지 않음
- component coverage가 route evidence와 isolated coverage 사이에서 애매함
- QC, bug triage, remediation handoff가 한 프로그램으로 엮여 있지 않음
- primitive adoption 확대 전략과 screenshot evidence 수집 순서가 아직 분리되지 않음

## Stages

### Stage 0 — Truth Reconciliation

목표:

- 기존 output artifact의 usable 범위를 확정
- 다시 찍을 범위만 남기기

산출물:

- `ultraplan/coverage-ledger.md`
- reusable run 목록
- recapture target 목록

exit gate:

- batch별 현재 usable/partial/discard 상태가 숫자로 정리됨
- baseline으로 재사용할 run-id가 명시됨

### Stage 1 — Route Completeness

우선순위:

1. `batch-2-main-discovery`
2. `batch-3-detail-pages`
3. `batch-4-create-edit-forms`
4. `batch-5-account-utility`
5. `batch-1-public-auth` polish
6. `batch-6-admin`

목표:

- default + scrolled evidence 확보
- data-ready full-page capture 확보
- unresolved dynamic route를 manifest 단계에서 즉시 분리

exit gate:

- `92/92 manifest resolved`
- 각 batch에 필요한 default/scrolled evidence가 존재

### Stage 2 — Interaction Completeness

대상:

- `batch-7-interactions`
- route별 `filter-open`, `dialog-open`, `drawer-open`, `hover-card-first`, `focus-first-input`, `tab-switch`

원칙:

- capture와 interaction verdict를 분리
- unsupported state는 `expected-na`로 남긴다
- 거짓 성공을 만들지 않는다

exit gate:

- route family별 interaction verdict가 정직하게 남음

### Stage 3 — Component / Asset Completeness

component:

- shell
- list cards
- detail sections
- form controls
- overlay
- transaction

asset:

- public/mock
- photoreal
- sport icons
- avatar/thumb/fallback

원칙:

- component catalog와 asset inventory를 page coverage와 섞지 않는다
- domain card는 실제 route evidence를 우선 사용
- primitive/overlay는 후속 `__catalog` 도입 후보로 분류

exit gate:

- component family inventory가 완성됨
- asset inventory + representative render + fallback evidence가 존재함

### Stage 4 — QC / Bug Triage

QC 항목:

- layout
- hierarchy
- spacing
- token drift
- interaction feedback
- asset quality
- viewport fit

분류:

- `runtime-blocker`
- `selector-drift`
- `data-gap`
- `design-drift`
- `expected-na`
- `degraded`

stop rule:

- 같은 원인의 blocker가 3 route 이상
- unresolved/blocked가 batch의 10% 초과

exit gate:

- stop된 lane은 bug report가 작성됨
- 계속 진행된 lane은 QC report가 작성됨

### Stage 5 — Evaluation And Remediation Handoff

평가 family:

- public
- discovery
- detail
- forms
- account
- admin

평가 축:

- consistency
- readability
- action clarity
- state quality
- trust/media
- DS adoption

handoff 태그:

- `token`
- `primitive`
- `overlay`
- `layout`
- `density`
- `motion`
- `media`
- `trust`
- `admin`

exit gate:

- Task 58 wave로 바로 넘길 수 있는 backlog가 정리됨
- remediation이 반영된 페이지는 post-fix screenshot evidence가 존재함

## Staffing

- planning: `project-director`, `tech-planner`
- capture pod A: public/auth + discovery
- capture pod B: detail + forms
- capture pod C: account/my + admin
- QC: design-main, ux-manager, ui-manager
- remediation: frontend-ui-dev + frontend-review
- context 절약이 중요한 큰 회차에서는 capture/QC/remediation을 agent lane으로 적극 분리

## Quality Gates

1. `92/92 manifest resolved`
2. data-ready capture only
3. batch별 9 viewport evidence 또는 honest `expected-na / blocked / degraded`
4. broken flow는 bug report로 분기
5. primitive default fix 없이 adoption 확대 금지
6. 최종 보고는 `page findings / component findings / asset findings`를 분리

## Immediate Next Actions

1. `coverage-ledger.md`에 기존 batch artifact 재사용 범위를 채운다.
2. lane별 run-id naming convention을 `run-ledger.md`에 고정한다.
3. isolated runner 기반 manifest/capture 실행 템플릿을 확정한다.
4. batch-2, batch-3, batch-4를 1차 완주 우선순위로 잡는다.
5. primitive default hardening 후보를 Task 58과 연결한다.
