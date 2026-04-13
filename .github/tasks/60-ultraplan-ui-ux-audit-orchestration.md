# Task 60 — Ultraplan UI/UX Audit Orchestration

> Planning/orchestration task. This task does not replace existing source-of-truth documents. Visual coverage truth remains in `.github/tasks/54-unified-visual-audit-coverage-master.md`, and design-system remediation truth remains in `.github/tasks/58-design-system-audit.md`.

Owner: project-director + tech-planner -> qa/ui/frontend/design/docs
Date drafted: 2026-04-12
Status: Planned
Priority: P0

## Planning Report

### Project Director: Conditional

- 이 작업은 "처음부터 디자인 시스템을 새로 만드는 프로젝트"가 아니라, 이미 있는 audit/remediation/capture 인프라를 하나의 운영 프로그램으로 묶는 작업으로 정의한다.
- 현재 기준점은 이미 존재한다.
  - `docs/DESIGN_SYSTEM_REFERENCE.md`: current design-system state, compliance 약 `55%`
  - `.github/tasks/54-unified-visual-audit-coverage-master.md`: `92` canonical route, `9` viewport, interaction/component/asset coverage contract
  - `.github/tasks/58-design-system-audit.md`: current remediation contract
  - `scripts/qa/run-visual-audit.mjs`: manifest/capture runner
- 가장 큰 리스크는 세 가지다.
  - existing truth docs와 실제 output artifact의 드리프트
  - shared dev stack 병렬 오용으로 인한 runtime instability
  - primitive default가 완전히 고정되기 전에 adoption을 넓혀 debt를 확산시키는 일

### Tech Planner

- 새 master contract를 또 만들지 않는다. `ultraplan/`은 execution workspace로만 사용한다.
- raw screenshot, console, network, checkpoint artifact는 기존 규칙대로 `output/playwright/visual-audit/<run-id>/`에 계속 둔다.
- `ultraplan/`에는 아래만 남긴다.
  - coverage ledger
  - run ledger
  - QC report
  - bug report
  - page/module review
  - remediation handoff
- 병렬 실행은 shared stack이 아니라 isolated runner 기준으로만 허용한다. broad capture는 runner 내부에서 `mobile -> tablet -> desktop` 순차를 유지한다.

## Context

사용자 요청 범위:

1. design system 구축
2. 현재 상태 분석
3. 전체 스크린샷 촬영
4. page/module별 UI/UX 평가 및 개선안 수집
5. broken flow 발견 시 stop -> bug report -> fix 가능하도록 운영

이미 존재하는 근거:

- `92` canonical visual routes
- `9` canonical viewports
- component catalog helper: `12` entries, currently `mobile-md` / `desktop-md`만 지원
- asset inventory helper: representative render target `4`개 + filesystem inventory
- 일부 batch artifact는 이미 존재하며 재사용 가치가 있다

이 task의 목적은 "중복 문서 작성"이 아니라, 위 자산들을 실제 프로그램처럼 끝까지 돌릴 수 있게 실행 구조를 고정하는 것이다.

## Goal

- `ultraplan/`을 repo-wide UI/UX audit workspace로 만든다.
- 기존 capture/remediation contract와 충돌하지 않는 execution plan을 고정한다.
- route, component, asset, QC, bug triage, remediation handoff를 하나의 흐름으로 연결한다.

## Original Conditions

- [x] `ultraplan/` 폴더를 새로 만든다.
- [x] `ultraplan/`은 운영 문서와 리포트 전용 workspace로 사용한다.
- [x] visual coverage truth는 Task 54를 유지한다.
- [x] remediation truth는 Task 58을 유지한다.
- [x] raw screenshot artifact는 `output/playwright/visual-audit/`에 둔다.
- [x] 병렬 capture는 isolated runner 기준으로만 허용한다.
- [x] broad capture는 lane 내부에서 `mobile -> tablet -> desktop` 순차를 유지한다.
- [x] page/component/asset/QC/bug/remediation 산출물을 분리한다.
- [x] broken flow는 디자인 이슈로 덮지 않고 bug report로 승격한다.
- [x] design-system adoption 확대 전 primitive default hardening을 선행한다.

## Scope

### In Scope

- `ultraplan/` workspace structure
- coverage reconciliation
- batch/lane execution plan
- screenshot QC contract
- bug-stop/report/fix gate
- page/module review structure
- Task 58 handoff structure

### Out Of Scope

- 이번 task 자체에서 full screenshot run 완료
- 이번 task 자체에서 Storybook 도입
- 이번 task 자체에서 all-page UI remediation 구현
- design rule 자체 변경

## Execution Stages

### Stage 0 — Truth Reconciliation

- 기존 run artifact를 `usable / partial / discard`로 재분류한다.
- batch별 current evidence와 gap을 `ultraplan/coverage-ledger.md`에 고정한다.
- baseline 재사용 우선순위:
  - batch-1 public/auth full 9 viewport evidence
  - batch-5 / batch-6 partial band evidence

### Stage 1 — Route Completeness

- 우선순위:
  1. `batch-2-main-discovery`
  2. `batch-3-detail-pages`
  3. `batch-4-create-edit-forms`
  4. `batch-5-account-utility`
  5. `batch-1-public-auth` polish
  6. `batch-6-admin`
- 목표:
  - `92/92 manifest resolved`
  - default + scrolled evidence 확보
  - data-ready capture only

### Stage 2 — Interaction Completeness

- `batch-7-interactions`를 별도 sweep으로 운영한다.
- route별 supported state를 honest하게 `captured / expected-na / blocked / degraded`로 분류한다.

### Stage 3 — Component And Asset Completeness

- component는 route-sourced capture를 먼저 채운다.
- dedicated catalog는 route evidence가 부족한 primitive/overlay에만 후속 도입한다.
- asset inventory는 page capture와 분리해 별도 ledger와 representative render로 닫는다.

### Stage 4 — QC And Bug Triage

- batch/band run이 끝날 때마다 QC report를 즉시 작성한다.
- stop rule:
  - 같은 원인의 blocker가 3 route 이상
  - unresolved/blocked가 해당 batch의 10% 초과
- stop 시 `ultraplan/templates/bug-report.md`를 기준으로 bug report를 작성한다.

### Stage 5 — Remediation Handoff

- findings는 Task 58 wave로 흡수한다.
- priority order:
  - primitive default hardening
  - shell/chrome
  - discovery/detail card family
  - form/transaction/account
  - admin

## Parallelization Model

### Capture Lanes

- Lane A: `public/auth + discovery`
- Lane B: `detail + forms`
- Lane C: `account/my + admin`

### Rules

- lane별로 별도 isolated runner를 사용한다.
- 같은 lane 안에서는 `mobile -> tablet -> desktop` 순차만 허용한다.
- shared `make dev` stack에서는 full visual audit 병렬 실행 금지다.

## Deliverables

- `ultraplan/README.md`
- `ultraplan/01-program.md`
- `ultraplan/02-screenshot-matrix.md`
- `ultraplan/coverage-ledger.md`
- `ultraplan/run-ledger.md`
- `ultraplan/templates/bug-report.md`
- `ultraplan/templates/page-review.md`

## Done Definition

- `ultraplan/` execution workspace가 생성되어 있다.
- 기존 source-of-truth와 충돌하지 않는 orchestration contract가 문서화되어 있다.
- lane, batch, QC, bug, remediation handoff 방식이 모두 고정되어 있다.
- 다음 단계에서 `@build`로 바로 실행 가능한 수준의 plan이 남아 있다.
