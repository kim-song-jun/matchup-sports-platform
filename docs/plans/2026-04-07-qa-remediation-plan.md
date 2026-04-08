# MatchUp QA Remediation Plan

**Date:** 2026-04-07  
**Scope:** Real-flow QA 실행 결과 기반 테스트/런타임/제품 개선 계획  
**Source Inputs:**
- `docs/scenarios/index.md`
- `docs/plans/2026-04-07-real-flow-qa-scenarios.md`
- Playwright execution on:
  - `e2e/tests/auth-session-matrix.spec.ts`
  - `e2e/tests/home.spec.ts`
  - `e2e/tests/match-join-flow.spec.ts`
  - `e2e/tests/team-owner-flow.spec.ts`
  - `e2e/tests/chat-realtime.spec.ts`

---

## 1. Execution Summary

이 문서는 초기 실패 기록과 복구 결과를 함께 유지한다.

- 초기 광범위 실행: 총 `96` 테스트, `3 passed / 93 failed`
- 초기 priority desktop run: 총 `48` 테스트, `11 passed / 37 failed`
- 복구 후 priority desktop bundle: 총 `48` 테스트, `48 passed / 0 failed`
- 추가 확인: `auth-session-matrix + chat-realtime` 총 `14` 테스트, `14 passed / 0 failed`
- 추가 확인: `auth-session-matrix + home` Mobile Chrome 총 `21` 테스트, `21 passed / 0 failed`
- 백엔드 auth unit 재검증: `242/242 passed`

초기 실패의 대부분은 개별 기능 결함이라기보다, 아래 세 층위가 동시에 깨진 결과였다.

1. **Dev runtime / Docker 문제**
2. **E2E harness / preflight 문제**
3. **일부 UI locator / 보호 라우트 시나리오 문제**

복구 결론은 명확하다. 실제 제품 회귀보다 먼저 `dev runtime`, `E2E harness`, `Playwright local execution strategy`를 바로잡아야 했고, 그 조정 후 priority bundle은 모두 녹색으로 돌아왔다.

### Recovery Update

- API health 복구: `http://localhost:8111/api/v1/health` 안정화
- E2E DB setup/teardown: host Prisma 제거, `docker compose exec postgres` 기반 정렬
- Frontend runtime fix: `/home` hydration mismatch 제거, chat room response shape 보정
- Selector stabilization: visible selector + canonical auth wall + bottom nav test id 도입
- Local Playwright strategy: `fullyParallel=false`, `workers=1`, `reporter=line`, `navigationTimeout=60000`
- Backend regression lock: `auth.service.spec.ts`에 soft-delete 사용자 `dev-login` 복구 케이스를 추가해 재발을 막았다
- Match create fix: `/matches/new`가 DTO에 없는 UI 필드(`customVenue`, `rules`)를 그대로 POST하던 버그를 수정하고, E2E auth helper가 보호 경로 진입 전에 홈 인증 hydration을 기다리도록 보강했다
- Stress result: 동일 48건을 local 6-worker로 돌리면 `36/48`까지 떨어졌고, 주원인은 Next dev route compile saturation이었다

### Match Deep-Flow Update — 2026-04-08

- `e2e/tests/match-join-flow.spec.ts`에 `MATCH-001`, `MATCH-002`를 실제 사용자 시나리오 기준으로 확장했다.
- 검증 결과:
  - Desktop Chrome full file: `13/13 passed`
  - Mobile Chrome deep-flow subset: `2/2 passed`
- 새로 확인한 follow-up:
- `MATCH-003`는 단순 미자동화가 아니라 backend `PATCH /matches/:id` 부재로 blocked
- host detail의 참가 인원 변화는 현재 reload-based persistence까지 검증했고, 새로고침 없는 realtime sync는 후속 범위
  - `customVenue` 직접 입력은 backend schema 부재로 현재 UI에서 등록된 시설 선택을 강제한다

---

## 2. Findings By Severity

## P0 — Runtime Blockers

### P0-1. API dev container is not actually healthy

**Symptoms**
- `curl http://localhost:8111/api/v1/health` returns `ECONNRESET`
- `global-setup` cannot call `/auth/dev-login`
- all authenticated E2E flows collapse immediately

**Observed evidence**
- `docker compose logs api` showed:
  - `bcrypt_lib.node: Exec format error`
  - later `Cannot find module '@nestjs/core'`
  - TypeScript watch mode with `Found 1520 errors`

**Likely root cause**
- dev container uses bind-mounted workspace + named `node_modules` volumes, but `pnpm` linkage is inconsistent
- `/app/node_modules/.modules.yaml` points to host store path `/Users/kimsungjun/Library/pnpm/store/v3`
- container is `aarch64`, but `bcrypt` binary and dependency graph are not reliably container-native

**Impact**
- Nest API is not stably booting
- all login/API-backed Playwright scenarios are blocked

**Fix direction**
1. Make Docker dev dependency installation deterministic and container-local
2. Eliminate host `pnpm` store path leakage inside container
3. Rebuild native dependencies inside container consistently
4. Add a real API health gate before web/E2E startup

**Candidate implementation**
- set persistent container store dir, e.g. `/pnpm/store`
- add dedicated volume for pnpm store
- add startup check script that validates `.modules.yaml` storeDir and reinstalls when mismatched
- optionally replace `bcrypt` with `bcryptjs` in dev if native rebuild remains flaky

---

### P0-2. E2E DB cleanup/setup assumes unreachable host DB port

**Symptoms**
- `global-setup` and `global-teardown` Prisma calls fail with:
  - `Can't reach database server at localhost:5433`
- current `docker-compose.yml` exposes Postgres only internally, not to host

**Impact**
- persona promotion, seed creation, teardown cleanup all fail partially
- test state becomes unreliable

**Fix direction**
Choose one, then standardize:
1. Expose host DB port explicitly for host-side Prisma access
2. Move Prisma setup/teardown into Docker container execution
3. Stop using host-side Prisma in global hooks and seed via API only

**Recommendation**
- Prefer containerized DB access for E2E hooks to match current compose model

---

### P0-3. Local Playwright dependency graph is unstable

**Symptoms**
- multiple desktop workers crashed with:
  - `Cannot find module 'playwright-core/lib/utils'`
- worker process exited unexpectedly

**Impact**
- even non-auth smoke tests become noisy and unreliable

**Likely root cause**
- host-side root `node_modules` / playwright package graph drifted during dependency reinstall attempts
- Node version during execution is `v21.7.3`, while repo expects Node 20+

**Fix direction**
1. Reinstall host dependencies under the repo's supported Node version
2. Enforce Node 20 in local dev and CI
3. Add preflight check in E2E docs/scripts that prints active Node version

---

## P1 — Test Harness Issues

### P1-1. Auth guard helper assumes first `/login` link is visible

**Symptoms**
- `expectLoginRedirectOrLink()` failed because the first `a[href="/login"]` existed but was hidden
- same issue appears in `chat-realtime.spec.ts`

**Impact**
- unauthenticated guard tests report false negatives

**Fix direction**
- update helper/specs to use visible locator or role-based targeting
- prefer:
  - `page.locator('a[href="/login"]:visible').first()`
  - or a dedicated `data-testid`

---

### P1-2. Current Playwright preflight is too weak for API-backed specs

**Symptoms**
- `global-setup` retries health 20 times, then proceeds anyway
- the suite continues into auth-dependent tests after API health timeout

**Impact**
- noise explodes and failures become less actionable

**Fix direction**
- split preflight into:
  - hard fail for auth/API suites
  - soft warning only for pure public/UI smoke suites
- tag suites by runtime dependency

---

### P1-3. Scenario/spec mapping exists, but no pass/fail write-back yet

**Symptoms**
- `docs/scenarios/index.md` maps files to specs
- actual execution result is not yet reflected back into scenario docs

**Fix direction**
- after each suite run, update:
  - `docs/scenarios/index.md` Findings Log
  - relevant scenario file notes

---

## P2 — Product / UI / Selector Issues Found

### P2-1. Home sport chip test found hidden duplicate button state

**Symptoms**
- `/home` test found a sport chip button but Playwright could not click because it was hidden

**Interpretation**
- either the selector is too broad
- or the page renders duplicate hidden chip structures

**Fix direction**
1. inspect the chip container DOM
2. scope tests to visible filter bar only
3. if hidden duplicates are accidental UI leftovers, clean them up

---

### P2-2. Unauthenticated chat/login wall assertions need explicit contract

**Symptoms**
- chat unauth case has login links in DOM, but visibility/placement is inconsistent for tests

**Fix direction**
- define one canonical auth wall pattern with stable test id and consistent visibility behavior

---

## 3. Recommended Fix Order

### Phase 1 — Repair runtime

**Goal:** make API and Playwright boot deterministically before touching feature tests

1. Fix Docker dev dependency installation and container-local pnpm store
2. Fix API boot health (`/api/v1/health` must return 200 reliably)
3. Align E2E Prisma setup/teardown with actual DB connectivity model
4. Reinstall host dependencies on supported Node version and verify Playwright worker startup

### Phase 2 — Repair test harness

**Goal:** reduce false negatives and make failures actionable

1. Harden auth guard helper to use visible/test-id based locators
2. Split API-required suites from public smoke suites
3. Fail fast when API-dependent preflight is broken
4. Write back suite status to scenario docs

### Phase 3 — Re-run priority suites

**Goal:** get real product failures after harness is trustworthy

Run in this order:
1. `auth-session-matrix.spec.ts`
2. `home.spec.ts`
3. `match-join-flow.spec.ts`
4. `team-owner-flow.spec.ts`
5. `chat-realtime.spec.ts`

### Phase 4 — Product fixes from real failures

**Goal:** only after runtime and harness are clean

1. Auth wall / redirect consistency
2. Home filter chip visibility
3. Team/Match/My page flows
4. Realtime chat/notification gaps

---

## 4. Concrete Task Breakdown

## Task A — Docker dev runtime stabilization

**Owner:** infra-dev  
**Files likely involved:**
- `docker-compose.yml`
- `deploy/Dockerfile.dev`
- `Makefile`
- optional new dev bootstrap script

**Acceptance criteria**
- `docker compose up -d api web` after clean startup yields healthy API
- `curl http://localhost:8111/api/v1/health` returns 200
- no `bcrypt` exec format error
- no host `pnpm` store path in container `.modules.yaml`

## Task B — E2E data access alignment

**Owner:** backend-dev + infra-dev  
**Files likely involved:**
- `e2e/global-setup.ts`
- `e2e/global-teardown.ts`
- possibly compose/Makefile for DB access

**Acceptance criteria**
- admin persona promotion succeeds
- seed data creation succeeds
- teardown cleanup succeeds

## Task C — E2E harness hardening

**Owner:** frontend-dev  
**Files likely involved:**
- `e2e/fixtures/sessions.ts`
- `e2e/tests/chat-realtime.spec.ts`
- `e2e/tests/auth-session-matrix.spec.ts`
- UI files adding stable auth wall identifiers if needed

**Acceptance criteria**
- unauthenticated route tests do not fail due to hidden duplicate links
- helper behavior is deterministic across mobile/desktop

## Task D — Priority suite rerun and triage

**Owner:** qa-beginner + qa-regular + qa-uiux  
**Files likely involved:**
- `docs/scenarios/index.md`
- relevant `docs/scenarios/*.md`

**Acceptance criteria**
- each priority suite is re-run after runtime fixes
- scenario docs record pass/fail state and real findings

---

## 5. Proposed Documentation Updates After Fixes

- update `docs/scenarios/index.md` Findings Log after each rerun
- add runtime prerequisites to `README.md` if Docker dev remains mandatory for E2E
- update `AGENTS.md` if the official rule becomes:
  - "E2E requires Docker API + Web healthy before execution"

---

## 6. Exit Criteria For “Real QA Ready”

이 저장소를 실제 시나리오 QA 가능 상태라고 부르려면 아래가 충족되어야 한다.

- API health is stable in dev
- global setup/teardown complete without connection errors
- Playwright workers launch without missing-module crashes
- auth/session suite passes
- at least one API-backed flow suite (`match` or `team match`) passes enough to expose product-level failures instead of runtime failures
