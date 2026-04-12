# Task 53 — Visual Audit Operations One Pager

> Active operations task. Use this as the condensed execution contract for screenshot capture runs. The detailed master coverage contract lives in `.github/tasks/54-unified-visual-audit-coverage-master.md`. Runtime details remain in `docs/PLAYWRIGHT_E2E_RUNBOOK.md`. Task 50 remains infrastructure history only.

Owner: qa/ui/frontend
Date drafted: 2026-04-12
Status: Active
Priority: P0

## Goal

- `92` canonical visual routes를 `9` viewport와 주요 interaction state 기준으로 안정적으로 캡처한다.
- raw artifact를 `output/playwright/visual-audit/<run-id>/` 아래에 남긴다.
- broad run은 `batch + viewport band` 단위로 순차 실행하고, blocked만 rerun으로 닫는다.

## Preconditions

- web: `http://localhost:3003`
- api: `http://localhost:8111`
- shared Next dev가 응답 중이어야 한다.
- dynamic route fixture가 필요한 run만 `--allow-bootstrap-writes`를 켠다.
- broad capture는 병렬 band 실행 금지. `mobile -> tablet -> desktop` 순차 실행만 허용한다.

## Viewport Bands

- mobile: `mobile-sm,mobile-md,mobile-lg`
- tablet: `tablet-sm,tablet-md,tablet-lg`
- desktop: `desktop-sm,desktop-md,desktop-lg`

## Canonical Batch Order

1. `batch-1-public-auth`
2. `batch-2-main-discovery`
3. `batch-3-detail-pages`
4. `batch-4-create-edit-forms`
5. `batch-5-account-utility`
6. `batch-6-admin`
7. `batch-7-interactions`
8. `batch-8-rerun`

## Run Template

### 1. Manifest

```bash
make qa-visual-audit-manifest RUN=<run-id> BATCH=<batch-id>
```

### 2. Capture By Band

```bash
make qa-visual-audit-capture RUN=<run-id> BATCH=<batch-id> VIEWPORTS=mobile-sm,mobile-md,mobile-lg EXTRA='<optional flags>'
make qa-visual-audit-capture RUN=<run-id> BATCH=<batch-id> VIEWPORTS=tablet-sm,tablet-md,tablet-lg EXTRA='<optional flags>'
make qa-visual-audit-capture RUN=<run-id> BATCH=<batch-id> VIEWPORTS=desktop-sm,desktop-md,desktop-lg EXTRA='<optional flags>'
```

### 3. Blocked Rerun

```bash
make qa-visual-audit-rerun RUN=<same-run-id> VIEWPORTS=<band or targeted viewport list> EXTRA='<optional flags>'
```

## Flags

- `HEADED=1`: 로컬 수동 디버그가 필요할 때만
- `STATES=default,scrolled,...`: targeted state run
- `FAMILY=<family>`: family 단위 제한
- `ROUTE=/path`: single route targeted run
- `LIMIT=<n>`: smoke/debug
- `EXTRA='--allow-bootstrap-writes'`: local dynamic fixture bootstrap이 꼭 필요할 때만

## Success Criteria Per Run

- `route-manifest.json` 생성
- `run-metadata.json` 생성
- `summary.md` 생성
- `screenshots/`, `console/`, `network/`, `checkpoints/`, `issues/` 생성
- broad band run은 process crash 없이 종료
- blocked가 남으면 원인을 `issues/<family>.md`로 바로 확인 가능

## Triage Rules

- `ready selector not found`
  - route-specific ready contract 또는 selector drift 확인
- `degraded candidate`
  - URL은 유효하지만 empty/restricted UI 가능
- `ERR_CONNECTION_RESET` / `ERR_EMPTY_RESPONSE`
  - shared Next dev 과부하
  - parallel band 금지 유지
  - 현재 band 종료 후 blocked만 rerun
- `page.goto timeout`
  - first compile 또는 unstable route 가능
  - single-route targeted rerun으로 route-level 재확인

## Artifact Contract

- root: `output/playwright/visual-audit/<run-id>/`
- screenshots: `screenshots/<family>/<route>/<viewport>/<state>.png`
- logs: `console/<family>/...`, `network/<family>/...`
- checkpoints: `checkpoints/<family>.json`
- issues: `issues/<family>.md`

## Done Definition

- batch 1-7이 모두 최소 1회 실행됐다.
- batch별 mobile/tablet/desktop band artifact가 존재한다.
- blocked는 rerun 또는 route-level note로 분류됐다.
- canonical screenshot 승격 전 raw artifact completeness를 먼저 확보했다.
