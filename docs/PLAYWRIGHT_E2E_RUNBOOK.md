# Playwright E2E Runbook

이 문서는 MatchUp 저장소의 Playwright 실행 계약과 병렬 실행 방법의 canonical runbook이다.

## 목적

- shared dev stack과 isolated Playwright stack의 역할을 분리한다.
- local concurrent runner를 안전하게 실행하는 절차를 문서화한다.
- `RUN`, 포트, auth artifact, `.next` 산출물 계약을 한 문서에서 설명한다.

## Runtime Modes

| Mode | 언제 쓰는가 | 런타임 | 병렬성 | 기본 명령 |
|------|-------------|--------|--------|-----------|
| Shared dev stack | 일반적인 로컬 개발, 빠른 smoke, 단일 runner | `make dev`, `localhost:3003/8111` | single active runner only | `make dev` -> `make test-e2e` |
| Isolated Playwright stack | 두 개 이상의 local runner, spec 분리 실행, concurrent smoke | run별 compose project / web port / api port / auth dir | runner 간 병렬 가능 | `make e2e-isolated-up`, `make test-e2e-isolated*`, `make e2e-isolated-down` |

## 핵심 계약

- shared `make dev` stack은 full Playwright 기준 single active runner only다.
- concurrent local runner가 필요하면 shared stack을 병렬로 때리지 말고 isolated stack만 사용한다.
- isolated stack은 run별로 아래를 분리한다.
  - compose project name
  - web/api host port
  - auth artifact dir
  - Playwright output dir
  - `apps/web/.next` volume
- active command마다 `RUN`은 유일해야 한다. 같은 `RUN`을 동시에 재사용하면 run lock이 실패한다.
- `RUN`은 lowercase compose-safe id로 정규화된다.
  - 예: `NotifSmoke` -> `notifsmoke`
- `node scripts/qa/run-e2e-isolated.mjs env <RUN>`은 preview-only다.
  - 포트 claim, metadata 디렉터리, compose stack을 만들지 않는다.

## Quick Start

### 1. Shared single-run smoke

```bash
make dev
make test-e2e
```

### 2. Isolated targeted spec

```bash
make e2e-isolated-up RUN=notif-a
make test-e2e-isolated-spec RUN=notif-a SPEC=e2e/tests/notification-center.spec.ts PROJECT="Desktop Chrome"
make e2e-isolated-down RUN=notif-a
```

### 3. Isolated full suite

```bash
make e2e-isolated-up RUN=full-a
make test-e2e-isolated RUN=full-a
make e2e-isolated-down RUN=full-a
```

### 4. Visual audit manifest

```bash
make qa-visual-audit-manifest RUN=visual-b1 BATCH=batch-1-public-auth
```

### 5. Visual audit capture

```bash
make qa-visual-audit-capture RUN=visual-b1 BATCH=batch-1-public-auth VIEWPORTS=mobile-md,desktop-md
```

### 6. Visual audit manifest + capture

Task 50의 전수 시각 감사는 별도 runner를 사용한다.

```bash
make qa-visual-audit-manifest RUN=task50-a
make qa-visual-audit-capture RUN=task50-a BATCH=batch-1-public-auth VIEWPORTS=mobile-md,desktop-md
```

raw artifact는 아래로 저장된다.

- `output/playwright/visual-audit/<run-id>/route-manifest.json`
- `output/playwright/visual-audit/<run-id>/run-metadata.json`
- `output/playwright/visual-audit/<run-id>/screenshots/...`
- `output/playwright/visual-audit/<run-id>/console/...`
- `output/playwright/visual-audit/<run-id>/network/...`
- `output/playwright/visual-audit/<run-id>/checkpoints/...`
- `output/playwright/visual-audit/<run-id>/summary.md`

## 병렬 실행 패턴

### 패턴 A. 서로 다른 spec을 서로 다른 runner로 분리

두 개의 터미널에서 다른 `RUN`을 쓴다.

```bash
# Terminal 1
make e2e-isolated-up RUN=auth-a
make test-e2e-isolated-spec RUN=auth-a SPEC=e2e/tests/auth-session-matrix.spec.ts PROJECT="Desktop Chrome"

# Terminal 2
make e2e-isolated-up RUN=notif-b
make test-e2e-isolated-spec RUN=notif-b SPEC=e2e/tests/notification-center.spec.ts PROJECT="Desktop Chrome" GREP="same user tabs receive match-created notification and open its deep link"
```

끝나면 각 stack을 정리한다.

```bash
make e2e-isolated-down RUN=auth-a
make e2e-isolated-down RUN=notif-b
```

### 패턴 B. 같은 사용자 multi-tab/multi-context 검증은 한 runner 안에서 처리

실시간, read-sync, same-user tab broadcast처럼 같은 런타임과 같은 DB 상태를 검증해야 하는 경우에는 runner를 두 개로 나누지 말고 한 Playwright invocation 내부에서 여러 context/tab을 연다.

- 권장: `notification-center.spec.ts`, `chat-realtime.spec.ts` 같은 multi-context spec
- 비권장: 같은 시나리오를 runner 둘로 나눠 shared state를 맞추려는 방식

### 패턴 C. 도메인 단위 병렬 smoke

다음처럼 도메인별로 분리하면 local QA가 가장 단순하다.

- `auth-*`: 인증/세션/권한
- `notif-*`: notification/chat realtime
- `admin-*`: 관리자/감사 로그

예:

```bash
make e2e-isolated-up RUN=auth-a
make e2e-isolated-up RUN=admin-b

make test-e2e-isolated-spec RUN=auth-a SPEC=e2e/tests/auth-session-matrix.spec.ts PROJECT="Desktop Chrome"
make test-e2e-isolated-spec RUN=admin-b SPEC=e2e/tests/admin-honest-data.spec.ts PROJECT="Desktop Chrome"
```

## Command Reference

### Preview

```bash
node scripts/qa/run-e2e-isolated.mjs env NotifSmoke
```

예상 출력:

```json
{
  "initialized": false,
  "runId": "notifsmoke",
  "composeProjectName": "matchup-e2e-notifsmoke",
  "authDir": ".../tmp/e2e-runs/notifsmoke/auth",
  "outputDir": ".../tmp/e2e-runs/notifsmoke/artifacts/test-results"
}
```

### Isolated up

```bash
make e2e-isolated-up RUN=notif-a
```

또는 raw script:

```bash
node scripts/qa/run-e2e-isolated.mjs up notif-a
```

### Isolated full suite

```bash
make test-e2e-isolated RUN=notif-a
```

### Isolated targeted spec

```bash
make test-e2e-isolated-spec \
  RUN=notif-a \
  SPEC=e2e/tests/notification-center.spec.ts \
  PROJECT="Desktop Chrome" \
  GREP="same user tabs receive match-created notification and open its deep link"
```

### Isolated down

```bash
make e2e-isolated-down RUN=notif-a
```

### Visual audit manifest

```bash
make qa-visual-audit-manifest RUN=visual-all
```

Optional filters:

- `BATCH=batch-1-public-auth`
- `FAMILY=account`
- `ROUTE=/profile`
- `LIMIT=10`

### Visual audit capture

```bash
make qa-visual-audit-capture \
  RUN=visual-all \
  BATCH=batch-5-account-utility \
  VIEWPORTS=mobile-md,tablet-md,desktop-md \
  STATES=default,scrolled
```

### Visual audit rerun

```bash
make qa-visual-audit-rerun \
  RUN=visual-all \
  VIEWPORTS=mobile-md,tablet-md,desktop-md
```

Optional flags:

- `HEADED=1`
- `INCLUDE_BLOCKED=1`
- `EXTRA='--allow-bootstrap-writes'`

Operational rules:

- visual audit `RUN`은 기본적으로 항상 새 값으로 명시한다. 예외는 `batch-8-rerun`뿐이며, 이때만 같은 `run-id`의 기존 `capture-results.json`을 재사용한다.
- `--allow-bootstrap-writes`는 local `localhost` API에만 허용한다. clean local DB에서 dynamic route fixture가 정말 필요할 때만 명시적으로 켠다.
- broad capture는 `batch + viewport band` 단위로 나눈다. 예: `mobile-sm,mobile-md,mobile-lg` -> `tablet-*` -> `desktop-*`.
- runner는 `.run.lock`으로 같은 `run-id`의 동시 실행을 막는다. 이미 실행 중이면 `run-id "<id>" is already in use`로 실패한다.

### Visual audit artifact layout

- root: `output/playwright/visual-audit/<run-id>/`
- manifest: `route-manifest.json`
- metadata: `run-metadata.json`
- matrix: `viewport-matrix.json`, `persona-matrix.json`
- screenshots: `screenshots/<family>/<route>/<viewport>/<state>.png`
- logs: `console/<family>/<route_slug>__<viewport>__<state>.log`, `network/<family>/<route_slug>__<viewport>__<state>.json`
- checkpoints: `checkpoints/<family>.json`
- issues: `issues/<family>.md`
- summary: `summary.md`

### Visual audit canonical batch ids

- `batch-1-public-auth`
- `batch-2-main-discovery`
- `batch-3-detail-pages`
- `batch-4-create-edit-forms`
- `batch-5-account-utility`
- `batch-6-admin`
- `batch-7-interactions`
- `batch-8-rerun`

Notes:

- `batch-7-interactions`는 state-focused sweep용 라벨이다. 보통 `STATES=...`와 함께 사용한다.
- `batch-8-rerun`은 같은 `RUN`의 기존 `capture-results.json`이 있어야만 동작한다. fresh run에서 바로 실행하면 실패하도록 고정했다.
- `qa-visual-audit-rerun` target은 이 same-run 예외를 안전하게 감싼 alias다.
- route manifest의 resolution note에 `degraded candidate`가 보이면 URL 자체는 확보했지만, 실제 UI는 정책/상태에 따라 empty state나 제한 상태로 열릴 수 있다는 뜻이다.

### Visual audit canonical state ids

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

### Visual audit examples

```bash
make qa-visual-audit-manifest RUN=task50-a
make qa-visual-audit-manifest RUN=task50-a BATCH=batch-2-main-discovery
make qa-visual-audit-manifest RUN=task50-a FAMILY=matches LIMIT=10
make qa-visual-audit-manifest RUN=task50-a EXTRA='--allow-bootstrap-writes'

make qa-visual-audit-capture RUN=task50-a BATCH=batch-1-public-auth
make qa-visual-audit-capture RUN=task50-a BATCH=batch-5-account-utility VIEWPORTS=mobile-md,tablet-md,desktop-md
make qa-visual-audit-capture RUN=task50-a FAMILY=matches STATES=default,filter-open,hover-card-first
make qa-visual-audit-capture RUN=task50-a BATCH=batch-6-admin HEADED=1
make qa-visual-audit-capture RUN=task50-a BATCH=batch-1-public-auth VIEWPORTS=mobile-sm,mobile-md,mobile-lg
make qa-visual-audit-rerun RUN=task50-a VIEWPORTS=mobile-md,tablet-md,desktop-md
```

### Recommended first run

```bash
make qa-visual-audit-manifest RUN=va-public
make qa-visual-audit-capture RUN=va-public BATCH=batch-1-public-auth VIEWPORTS=mobile-sm,mobile-md,mobile-lg

make qa-visual-audit-capture RUN=va-discovery BATCH=batch-2-main-discovery ROUTE=/matches VIEWPORTS=mobile-md,desktop-md STATES=default,filter-open
make qa-visual-audit-capture RUN=va-account ROUTE=/profile VIEWPORTS=mobile-md,tablet-md,desktop-md STATES=default,scrolled
make qa-visual-audit-capture RUN=va-account ROUTE=/settings VIEWPORTS=mobile-md,tablet-md,desktop-md STATES=default,scrolled
```

## Admin / Docker DB Contract

- shared attach 경로에서는 docker-postgres mutation을 best-effort로 본다.
- isolated run은 run 전용 docker-postgres runtime을 직접 관리하므로 strict preflight를 사용한다.
- admin 승격이 꼭 필요한 shared run만 별도로 hard-fail시키고 싶으면 아래 env를 명시한다.

```bash
E2E_REQUIRE_ADMIN_PROMOTION=1 pnpm exec playwright test --config=e2e/playwright.config.ts e2e/tests/admin-honest-data.spec.ts
```

## Troubleshooting

### `run-id "...\" is already in use`

- 같은 `RUN`으로 다른 명령이 이미 실행 중이다.
- 기존 명령이 끝날 때까지 기다리거나 다른 `RUN`을 사용한다.

### `/landing` 500 + `Cannot find module './*.js'`

- isolated web이 stack-local `.next`를 쓰지 못하고 shared artifact를 보고 있을 때 나는 전형적인 증상이다.
- 반드시 `docker-compose.e2e.yml` 경로로 띄우고, stack을 내렸다가 다시 올린다.

### shared stack을 두 터미널에서 동시에 돌리고 싶다

- 지원하지 않는다.
- shared stack은 single active runner only다.
- runner를 둘 이상 띄우려면 isolated stack으로 옮긴다.

### targeted spec에 공백이 들어간 `PROJECT`나 `GREP`를 넘겨야 한다

- `test-e2e-isolated-spec` target을 사용한다.
- `PROJECT="Desktop Chrome"`처럼 값 전체를 따옴표로 감싼다.

### 이전 runner가 crash 후 port claim이 남아 있는가

- `tryClaimPort`는 stale claim을 자동 회수한다.
- claim 파일이 존재하지만 해당 포트에 실제로 리스닝 중인 프로세스가 없으면, 이전 crash의 잔여물로 판단하고 제거 후 재시도한다.
- `[run-e2e-isolated] reclaimed stale port NNN (was xxx)` 로그가 출력된다.
- `tmp/e2e-runs/port-claims/`를 수동으로 정리할 필요는 없다.

### `env`로 확인만 했는데 리소스가 잡혀 있는가

- 현재 `env`는 preview-only다.
- metadata, port claim, compose stack을 만들지 않는다.
- `env` 결과에 `initialized: false`가 나오면 아직 stack이 생성되지 않은 상태다.

## 어떤 방식을 먼저 선택할까

1. 단일 smoke나 기능 확인이면 shared `make dev` + `make test-e2e`
2. broad visual screenshot audit이면 `qa-visual-audit-manifest` -> `qa-visual-audit-capture`
3. 두 개 이상의 local runner가 필요하면 isolated stack
4. 같은 시나리오 안의 multi-user/multi-tab이면 한 runner 내부 multi-context

## References

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [.github/tasks/54-unified-visual-audit-coverage-master.md](../.github/tasks/54-unified-visual-audit-coverage-master.md)
- [.github/tasks/53-visual-audit-operations-one-pager.md](../.github/tasks/53-visual-audit-operations-one-pager.md)
- [docs/scenarios/index.md](./scenarios/index.md)
- [.github/tasks/46-isolated-playwright-runner-stacks.md](../.github/tasks/46-isolated-playwright-runner-stacks.md)
