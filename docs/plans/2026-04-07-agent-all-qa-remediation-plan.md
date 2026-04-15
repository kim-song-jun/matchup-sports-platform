# Teameet Agent-All QA Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 실제 사용자 시나리오 기반 QA 실행에서 드러난 환경 블로커, 테스트 인프라 드리프트, brittle E2E 스펙 문제를 정리하고, 우선순위 순으로 복구 계획을 고정한다.

**Architecture:** 이번 라운드는 기능 수정보다 "테스트 가능한 상태 회복"이 우선이다. 따라서 `Infra/Test Runtime 안정화 -> Playwright dependency 복구 -> E2E preflight 정합성 -> spec selector 정리 -> 기능별 시나리오 확장` 순으로 진행한다.

**Tech Stack:** Docker Compose, NestJS 11, Next.js 15, Prisma 6, PostgreSQL 16, Playwright 1.58, pnpm 9

---

## Pipeline Report: Real-Flow QA

### Stages Completed

1. ✅ Plan — 시나리오 허브와 기능별 체크 문서 기준으로 테스트 범위를 고정
2. ✅ Build — 테스트 준비 개선 적용
   - 멀티탭 인증 동기화 보강
   - Playwright 세션 헬퍼 추가
   - 로그인/관리자 auth wall selector 안정화
3. ✅ Review — 실행 로그 기반으로 코드/환경 위험요인 식별
4. ✅ Design — UI 테스트가 실제 구조를 과도하게 추정하고 있음을 확인
5. ✅ QA — 데스크톱 스모크 48건 실행, 11 통과 / 37 실패
6. ✅ Docs — 시나리오 허브 findings 갱신, remediation plan 작성

## Execution Update — 2026-04-07

- Runtime recovery completed:
  - host Playwright dependency resolution restored
  - API health on `http://localhost:8111/api/v1/health` restored
  - E2E DB setup/teardown moved off host Prisma to Docker `psql` exec
  - home/chat/auth selector and auth-storage assumptions stabilized
  - local Playwright default changed to `workers=1`, `fullyParallel=false`, `navigationTimeout=60_000`, `line` reporter
- Verification after recovery:
  - `pnpm --filter web test -- src/stores/__tests__/auth-store.test.ts` -> `6/6` passed
  - `pnpm --filter api test -- auth.service.spec.ts` -> `242/242` passed
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line` -> `20/20` passed
  - `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts e2e/tests/chat-realtime.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome'` -> `48/48` passed
  - `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome'` -> `21/21` passed
- Reclassification:
  - the earlier `11/48` and `36/48` outcomes are no longer treated as product-level regressions
  - the dominant false-negative source was local Next dev compile saturation under multi-worker Playwright, plus brittle selectors and stale auth assumptions
  - the remaining work is scenario expansion, not runtime recovery

## Execution Update — 2026-04-08

- Match deep-flow expansion completed:
  - `MATCH-001` create -> list/detail/my matches/new tab/reload
  - `MATCH-002` host/participant/overflow-user contexts with capacity guard
- Product/test fixes applied during execution:
  - `/matches/new` submit payload sanitized to backend DTO contract
  - protected-route E2E auth helper now waits for authenticated home hydration before proceeding
  - match flow selectors normalized to `:visible` contracts for mixed desktop/mobile DOM
- Verification:
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line` -> `13/13` passed
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line --grep 'Deep match flows'` -> `2/2` passed
- Remaining gap:
  - `MATCH-003` is blocked by missing backend `PATCH /matches/:id`
  - realtime host-detail sync without reload is not yet asserted

### Files Changed In This QA Prep Round

- Frontend
  - `apps/web/src/stores/auth-store.ts`
  - `apps/web/src/stores/__tests__/auth-store.test.ts`
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/admin/layout.tsx`
- Test
  - `e2e/fixtures/sessions.ts`
  - `e2e/tests/auth-session-matrix.spec.ts`
- Docs
  - `docs/scenarios/index.md`
  - `docs/scenarios/*.md`
  - `docs/plans/2026-04-07-real-flow-qa-scenarios.md`

## Commands Run

```bash
make up
npx playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts e2e/tests/chat-realtime.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome'
pnpm --filter web test -- src/stores/__tests__/auth-store.test.ts
pnpm --filter api test -- auth.service.spec.ts
pnpm exec playwright test e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line
pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts e2e/tests/chat-realtime.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome'
pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome'
pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome'
pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line
pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line --grep 'Deep match flows'
```

## Observed Results

- `apps/web` auth store unit test: passed (`6/6`)
- `apps/api` auth service unit test: passed (`242/242`)
- Playwright smoke run:
  - initial: `48 total / 11 passed / 37 failed`
  - after runtime recovery + local serial default: `48 total / 48 passed / 0 failed`
  - diagnostic serial rerun for match/team subset: `20/20`
  - mobile auth/home rerun: `21/21`
  - mobile auth/session cross-check: `7/7`
  - match flow desktop full file: `13/13`
  - match flow mobile deep subset: `2/2`

## Failure Buckets

## Bucket A — Infra / Runtime Blockers

### A1. API host endpoint is not stable on `localhost:8111`

- Evidence:
  - `curl -i http://localhost:8111/api/v1/health` -> `Recv failure: Connection reset by peer`
  - `loginViaApi()` in E2E repeatedly failed with `fetch failed` / `ECONNRESET`
- Impact:
  - 인증 기반 모든 E2E가 연쇄적으로 실패
  - 채팅, 매치, 팀, 관리자 시나리오 대부분 blocked

### A2. API container is up but app is not healthy

- Evidence from `docker compose logs api`:
  - `Cannot find module '@nestjs/core'`
  - TypeScript global lib resolution failures
  - watch compile reported `Found 1520 errors`
- Inference:
  - 컨테이너 내부 `node_modules` 또는 build/runtime resolution이 깨져 있음
  - dev Dockerfile / volume mount / package install 흐름 점검이 필요

### A3. E2E Prisma setup/teardown points at wrong DB port

- Evidence:
  - `PrismaClientInitializationError`
  - `Can't reach database server at localhost:5433`
- Repo reality:
  - `docker-compose.yml`은 Postgres를 host에 publish하지 않음
  - dev compose 내부 포트는 `5432`, host 직접 접속 설계가 아님
  - Makefile/문서에는 `5433` 가정이 남아 있음
- Impact:
  - admin role promotion
  - teardown cleanup
  - any direct Prisma E2E setup

## Bucket B — Tooling / Dependency Blockers

### B1. Host Playwright package resolution is broken

- Evidence:
  - `node -p "require.resolve('@playwright/test')"` 실패
  - worker에서 `Cannot find module '@playwright/test'`
  - reporter 종료 시 `Cannot find module ... playwright-core/index.js`
- Impact:
  - 테스트가 중간부터 환경 문제로 붕괴
  - 일부 케이스는 앱 문제가 아니라 tooling 문제로 false negative

### B2. HTML reporter dependency chain also breaks

- Evidence:
  - final reporter error in `playwright/lib/reporters/html.js`
- Impact:
  - 테스트 결과 수집이 불완전해질 수 있음
  - 단기적으로 `line` or `list` reporter fallback 검토 필요

## Bucket C — Test Spec Quality Issues

### C1. `home.spec.ts` has strict-mode brittle locators

- Examples:
  - `page.locator('main')` -> multiple `main` elements로 strict mode violation
  - `sidebar.getByText(/매칭|Matching/i)` -> 여러 요소 매칭
- Impact:
  - 정상 UI도 실패로 표시됨

### C2. Desktop navigation assumptions are stale

- Evidence:
  - locale switcher 탐색 실패
  - `aside a[href="/matches"]` 클릭 후 URL unchanged
- Interpretation:
  - 현재 UI 구조, hydration, 혹은 actual nav target이 기존 테스트 가정과 다름

### C3. Mobile tests are mixed into desktop-only execution context

- Evidence:
  - `home.spec.ts` 내부에 desktop project 실행에서도 mobile viewport describe block이 함께 돌아감
- Impact:
  - 의도와 실제 실행 범위가 엇갈림

## Priority Plan

## Phase 0 — Test Runtime Recovery

### Task 0.1 Fix Playwright package resolution on host

**Files:**
- Inspect: `package.json`
- Inspect: `pnpm-lock.yaml`
- Inspect: `node_modules/.pnpm/`

**Actions:**
- `@infra-dev` 기준으로 host dependency graph 점검
- `@playwright/test` 및 `playwright-core` resolution 복구
- 필요하면 clean install 절차 문서화

**Done when:**
- `node -p "require.resolve('@playwright/test')"` 성공
- `npx playwright test --list` 와 `--reporter=line` 실행 가능

### Task 0.2 Make API actually healthy on host `:8111`

**Files:**
- Inspect: `docker-compose.yml`
- Inspect: `deploy/Dockerfile.dev`
- Inspect: `apps/api/package.json`
- Inspect: `apps/api/tsconfig*.json`

**Actions:**
- API container 내부 dependency resolution 실패 원인 제거
- health endpoint가 host에서 안정적으로 응답하게 수정

**Done when:**
- `curl http://localhost:8111/api/v1/health` 성공
- `loginViaApi()` 가 stable

### Task 0.3 Align E2E setup/teardown DB access with current dev topology

**Files:**
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/global-teardown.ts`
- Inspect: `Makefile`
- Inspect: `docker-compose.yml`

**Actions:**
- Prisma direct connect를 current dev DB topology와 맞춘다
- host port published를 쓰지 않을 거면 container exec 또는 API-only seeding으로 전환
- stale `5433` assumption 제거

**Done when:**
- admin promotion / teardown cleanup이 실패하지 않는다

## Phase 1 — E2E Preflight Hardening

### Task 1.1 Add explicit preflight for API, auth, Playwright resolution

**Files:**
- Create or modify: `e2e/fixtures/preflight.ts` or `e2e/global-setup.ts`
- Update: `docs/scenarios/index.md`

**Actions:**
- API health
- dev-login success
- `@playwright/test` resolution
- optional reporter fallback check

**Done when:**
- 환경 실패와 기능 실패가 명확히 분리된다

### Task 1.2 Change reporter during stabilization

**Files:**
- Modify: `e2e/playwright.config.ts`

**Actions:**
- HTML reporter only로 인한 crash를 피하기 위해 `['line']` 또는 fallback multiplexer 구성 검토

## Phase 2 — Spec Stabilization

### Task 2.1 Fix brittle selectors in `home.spec.ts`

**Files:**
- Modify: `e2e/tests/home.spec.ts`

**Actions:**
- broad text/`main` selector 제거
- `data-testid` 또는 role/name based exact selector 사용
- desktop/mobile describe 분리 또는 project gating 정리

### Task 2.2 Fix auth-dependent specs to fail fast on env issues

**Files:**
- Modify: `e2e/fixtures/auth.ts`
- Modify: `e2e/fixtures/sessions.ts`

**Actions:**
- dev-login failure 시 더 설명적인 에러
- environment blocked / app failed 구분

### Task 2.3 Rebaseline route assumptions

**Files:**
- Modify: `e2e/tests/home.spec.ts`
- Modify: `e2e/tests/match-join-flow.spec.ts`
- Modify: `e2e/tests/team-owner-flow.spec.ts`

**Actions:**
- 실제 nav structure 기준으로 assertion 갱신
- stale copy assumptions 제거

## Phase 3 — Scenario Expansion After Recovery

### Task 3.1 Re-run priority bundle

Bundle:
- `auth-session-matrix.spec.ts`
- `home.spec.ts`
- `match-join-flow.spec.ts`
- `team-owner-flow.spec.ts`
- `chat-realtime.spec.ts`

---

## Project-Director Verdict

**Verdict:** Conditional

이번 라운드는 계속 진행해도 된다. 다만 `기능 QA 확장`이 아니라 `테스트 가능한 상태 회복`을 먼저 끝내는 조건부 승인이다. 현재 문서와 실행 결과를 기준으로 보면, 실패의 주원인은 제품 기능 자체보다 아래 세 가지 실행 게이트 미통과다.

1. API 런타임이 host `:8111`에서 안정적으로 살아 있지 않다.
2. E2E setup/teardown이 현재 dev DB topology와 맞지 않는다.
3. Playwright host dependency 및 일부 spec locator가 불안정하다.

따라서 이번 라운드의 성공 기준은 "더 많은 시나리오 추가"가 아니라, `우선순위 시나리오를 신뢰 가능한 환경에서 다시 실행할 수 있는 상태`를 만드는 것이다.

## Execution Order

1. **Runtime gate 복구**
   - API health 복구
   - container-local dependency/pnpm store 정렬
   - `curl http://localhost:8111/api/v1/health` 안정화
2. **DB topology gate 정렬**
   - `e2e/global-setup.ts`, `e2e/global-teardown.ts`의 `localhost:5433` 가정 제거
   - container exec 또는 현재 compose topology에 맞는 접근 방식으로 통일
3. **Playwright/tooling gate 복구**
   - host `@playwright/test`, `playwright-core` resolution 복구
   - stabilization 동안 reporter를 `line` 중심으로 고정
4. **Harness fail-fast 정리**
   - API-dependent suite는 preflight 실패 시 즉시 중단
   - env failure와 product failure를 로그에서 분리
5. **Priority spec stabilization**
   - `auth-session-matrix.spec.ts`
   - `home.spec.ts`
   - `match-join-flow.spec.ts`
   - `team-owner-flow.spec.ts`
   - `chat-realtime.spec.ts`
6. **Priority bundle rerun and classify**
   - 환경 실패
   - selector/spec 실패
   - 실제 제품 기능 실패
7. **Docs write-back**
   - `docs/scenarios/index.md` findings/decision 갱신
   - relevant scenario files 상태 메모 갱신
   - remediation plan에 round outcome 누적

## Execution Gates

다음 단계로 넘어가기 위한 최소 게이트는 아래와 같다.

- **Gate A: API**
  - `/api/v1/health`가 반복 호출에서 200을 반환한다.
  - `/auth/dev-login`이 Playwright에서 안정적으로 동작한다.
- **Gate B: DB/E2E Setup**
  - global setup의 admin promotion 또는 동등한 준비 절차가 실패하지 않는다.
  - global teardown cleanup이 current compose topology에서 실패하지 않는다.
- **Gate C: Playwright Runtime**
  - `npx playwright test --list`가 정상 동작한다.
  - priority spec가 worker crash 없이 시작된다.
- **Gate D: Harness Clarity**
  - preflight 실패 시 suite가 계속 흘러가지 않는다.
  - env failure와 app failure가 로그에서 구분된다.

## Minimal Acceptance Criteria For Ending This Round

이번 파이프라인 라운드는 아래 조건을 만족하면 종료 가능하다.

1. Runtime/DB/Playwright gate 4개가 모두 통과한다.
2. priority bundle을 최소 1개 desktop project 기준으로 다시 실행할 수 있다.
3. rerun 결과가 `환경 블로커`, `테스트 스펙 문제`, `실제 기능 문제`로 재분류되어 문서에 남아 있다.
4. 적어도 `AUTH` 영역은 flaky env failure 없이 pass/fail을 신뢰할 수 있는 상태가 된다.
5. `docs/scenarios/index.md`와 remediation plan 문서가 이번 라운드의 상태를 반영한다.

## Success Definition

이번 라운드의 성공은 "모든 핵심 기능을 통과시키는 것"이 아니다. 성공은 아래와 같이 정의한다.

- 우선순위 시나리오가 더 이상 깨진 실행 환경 때문에 무더기로 실패하지 않는다.
- 실패가 발생해도 어떤 계층의 문제인지 바로 분류할 수 있다.
- 다음 라운드에서 실제 기능 결함 수정으로 바로 들어갈 수 있을 만큼 QA 기반이 안정화된다.

### Task 3.2 Mark scenario checklists with pass/fail evidence

**Files:**
- `docs/scenarios/index.md`
- affected `docs/scenarios/*.md`

## Ownership

- Infra blockers: `infra-dev`, `infra-review`
- Host dependency / Playwright runtime: `infra-dev`
- Auth/session and selector hardening: `frontend-dev`, `frontend-review`
- API health and dev-login stability: `backend-dev`, `backend-review`
- Scenario evidence update: `docs-writer`

## Frontend-Dev Progress (2026-04-07)

- Added strict preflight module: `e2e/fixtures/preflight.ts`
- Switched `global-setup` to fail-fast by default, with `E2E_ALLOW_OFFLINE=1` escape hatch
- Hardened `expectLoginRedirectOrLink` to require visible canonical auth wall/login CTA
- Migrated unauth specs (`auth-flow`, `chat-realtime`, `teams`, `matches`, `match-join-flow`) to the shared auth-gate helper
- Added canonical auth wall test IDs in shared/frontend surfaces (`EmptyState`, `/profile`, `/matches/new`)

## Recommended Next Execution

1. Recover host Playwright module resolution
2. Recover API container health on `8111`
3. Remove E2E `5433` DB assumption
4. Re-run priority Playwright bundle
5. Only after that, expand to mobile and payment/review flows

## Commit Sequence Suggestion

1. `chore: fix playwright runtime resolution`
2. `infra: align e2e runtime with docker dev stack`
3. `test: harden auth and home e2e selectors`
4. `docs: record qa remediation plan`
