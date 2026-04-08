# 2026-04-07 Tech Planner QA Remediation Report

## Scope

이번 계획서는 실제 QA 실행에서 확인된 다섯 가지 블로커를 기술 관점에서 정리한다.

- Docker dev runtime instability
- API health failure
- E2E DB topology mismatch
- Playwright dependency drift
- brittle auth/UI selectors

기준 파일은 `docker-compose.yml`, `deploy/Dockerfile.dev`, `Makefile`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/playwright.config.ts`, `e2e/fixtures/sessions.ts`, `e2e/tests/home.spec.ts`, `e2e/tests/chat-realtime.spec.ts`, `apps/api/src/main.ts`, `docs/scenarios/index.md`, `.github/tasks/06-fix-make-dev-runtime.md`다.

## 1) Architecture Impact

### A. Docker dev runtime instability

현재 dev stack은 bind mount된 workspace 위에 named volume으로 `node_modules`를 얹고, `deps` 서비스가 `/opt/deps` snapshot을 복사하는 구조다. 이 구조 자체는 맞지만, 실제 compose에는 container-local pnpm store 보장이 없고, runtime bootstrap이 `pnpm` 메타데이터와 native addon ABI 정합성을 검증하지 않는다.

영향:

- `api`와 `web`가 같은 workspace dependency graph를 공유하므로 한쪽 volume drift가 전체 dev stack 불안정으로 번진다.
- `bcrypt`, Prisma client, Nest core 해상 같은 container ABI 민감 의존성이 깨지면 `api`가 기동 직후 죽고, 이후 모든 API 기반 E2E가 연쇄 실패한다.
- `make dev`가 성공하더라도 실제 서비스 health는 보장되지 않는 상태가 된다.

### B. API health failure

`apps/api/src/main.ts` 기준으로 API는 `/api/v1` prefix와 별도 Nest runtime을 사용한다. `apps/web`은 Next rewrite와 `INTERNAL_API_ORIGIN`으로 이 API에 의존한다. 따라서 `http://localhost:8111/api/v1/health` 실패는 단순 백엔드 문제를 넘어 웹 인증, seed, 실시간 연결, 관리자 경로, 채팅/알림까지 모두 막는다.

영향:

- `e2e/fixtures/auth.ts`의 API login이 실패한다.
- `global-setup`의 persona seed와 admin 승격이 실패한다.
- `chat`, `match`, `team`, `notification` 계열 시나리오가 기능 버그와 무관하게 false negative로 무너진다.

### C. E2E DB topology mismatch

`docker-compose.yml`은 Postgres를 Docker 내부 네트워크로만 노출하고, host 포트를 publish하지 않는다. 반면 `e2e/global-setup.ts`와 `e2e/global-teardown.ts`는 host에서 `PrismaClient`를 직접 띄워 `localhost:5433` 가정으로 DB를 건드린다.

영향:

- 현재 E2E harness는 dev topology의 source of truth와 충돌한다.
- admin role promotion, teardown cleanup, shared fixture seed가 매번 비결정적으로 실패한다.
- 기능 테스트 이전에 test harness 자체가 broken state가 된다.

### D. Playwright dependency drift

`e2e/playwright.config.ts`는 host 실행을 전제로 하면서 reporter를 `html` 단일 설정으로 둔다. 실제 QA 실행에서는 host 쪽 `@playwright/test`와 `playwright-core` 해상이 흔들렸고, worker와 reporter가 서로 다른 dependency state를 보는 정황이 있다.

영향:

- 일부 실패는 앱이 아니라 host toolchain 문제다.
- 결과 수집 단계에서 reporter가 다시 죽어 실패 원인 분리가 어려워진다.
- 환경 문제와 제품 문제를 같은 bucket으로 오판하게 된다.

### E. Brittle auth/UI selectors

현재 일부 스펙은 visible state 대신 broad CSS/text selector에 기대고 있다. `e2e/fixtures/sessions.ts`와 `e2e/tests/chat-realtime.spec.ts`는 hidden login link 중복에 취약하고, `e2e/tests/home.spec.ts`는 `main`, `button`, `aside` 전역 매칭으로 strict-mode violation을 일으킨다.

영향:

- 실제 UI가 정상이어도 DOM 중복 또는 반응형 중첩 때문에 실패한다.
- regression signal이 아니라 selector noise가 누적된다.
- 향후 multi-tab, multi-browser 시나리오 확대 시 flaky rate가 더 커진다.

## Root Cause Summary

1. dev runtime의 dependency bootstrap이 "container 내부에서 재현 가능한 설치 상태"를 보장하지 못한다.
2. E2E harness가 현재 compose topology가 아니라 과거 host-port 전제를 계속 사용한다.
3. Playwright host environment와 reporter strategy가 불안정한데도 preflight가 이를 hard-fail로 분리하지 않는다.
4. 우선순위 시나리오용 selector contract가 아직 UI 구조와 분리되어 있지 않다.

## 2) Recommended Implementation Sequence

### Phase 0. Runtime Source Of Truth 고정

먼저 dev topology를 문서와 스크립트에서 하나로 맞춘다. 이 단계에서 `docker-compose.yml`, `deploy/Dockerfile.dev`, `Makefile`, `.github/tasks/06-fix-make-dev-runtime.md`, `docs/scenarios/index.md`가 같은 사실을 말하게 해야 한다.

목표:

- DB/Redis는 internal-only
- host에서 보장되는 포트는 web `3003`, api `8111`, studio `5555`
- dependency bootstrap의 단일 진입점 정의

### Phase 1. Docker dependency bootstrap 안정화

`deploy/Dockerfile.dev`와 `docker-compose.yml`부터 손본다. 여기서 container-local pnpm store, deterministic bootstrap, stale volume 재동기화가 먼저 해결되어야 한다. 이 단계가 끝나기 전에는 selector 수정이나 QA 재실행을 해도 의미가 낮다.

권장 작업:

- `PNPM_STORE_DIR=/pnpm/store` 고정
- `pnpm_store` named volume 추가
- bootstrap 스크립트 추가 후 `api`, `web` 모두 그 스크립트를 거치게 전환
- `.modules.yaml` 또는 marker file 기반으로 host-path leakage / ABI mismatch 감지

완료 조건:

- `docker compose up` 직후 `api` 컨테이너가 dependency error 없이 유지
- `curl http://localhost:8111/api/v1/health` 성공

### Phase 2. API health recovery

runtime이 안정된 뒤 바로 API health를 복구한다. 이 단계는 단순 compose 수정이 아니라, container 내부에서 Nest app이 실제로 watch compile을 통과하는지 확인하는 단계다.

권장 작업:

- `api` startup command를 bootstrap 이후 `db:generate -> dev` 순으로 재구성
- Nest runtime missing module 원인 제거
- health endpoint smoke command를 task 문서와 QA 허브에 명시

완료 조건:

- `loginViaApi()` 성공
- Swagger 또는 health endpoint가 최소 3회 연속 안정 응답

### Phase 3. E2E DB topology 정렬

그 다음 `global-setup` / `global-teardown`을 현재 dev topology에 맞춘다. host Prisma direct connection을 유지할지, container exec로 바꿀지, API-only seeding으로 바꿀지 결정해야 한다. 현재 구조상 가장 안전한 방향은 "host Prisma 제거, API-first seed + containerized fallback"이다.

권장 작업:

- `e2e/global-setup.ts`에서 host `PrismaClient` 제거
- admin role promotion은 API/admin seed endpoint 또는 container exec script로 이동
- cleanup도 host direct DB access 대신 containerized cleanup으로 전환
- API preflight 실패 시 setup이 경고 후 진행하지 말고 hard-fail 처리

완료 조건:

- `global-setup`이 persona seed와 admin 준비를 재현 가능하게 수행
- `global-teardown`이 host DB port 없이 성공

### Phase 4. Playwright host dependency와 reporter 안정화

이 단계에서 host toolchain을 정리한다. 앱이 살아도 Playwright 자체가 흔들리면 QA signal이 다시 오염된다.

권장 작업:

- root / workspace에서 `@playwright/test`, `playwright-core` 해상 경로 재검증
- 필요 시 lockfile과 install 절차 정리
- `e2e/playwright.config.ts`의 reporter를 stabilization 동안 `line` 또는 복수 reporter fallback으로 조정
- optional preflight로 module resolution을 먼저 확인

완료 조건:

- `npx playwright test --list` 안정 성공
- reporter 단계 crash 없음

### Phase 5. Auth/UI selector contract 정리

마지막으로 brittle spec을 고친다. 여기서는 테스트를 DOM 구조 추측에서 분리하고, 우선순위 시나리오에 필요한 최소 contract만 추가한다.

권장 작업:

- 로그인 진입, auth wall, 홈 sport filter, desktop sidebar, mobile nav에 명시적 test id 또는 role contract 부여
- `sessions.ts`, `chat-realtime.spec.ts`, `home.spec.ts`의 broad selector 제거
- project/viewport별 describe 범위를 다시 정리해 desktop과 mobile 가정을 분리

완료 조건:

- AUTH / HOME / CHAT smoke가 selector 이유로 실패하지 않음

### Phase 6. 우선순위 시나리오 재실행과 문서 동기화

복구 후에는 전체가 아니라 우선순위 묶음을 단계적으로 다시 돌린다.

권장 순서:

1. `auth-session-matrix`
2. `home`
3. `match-join-flow`
4. `team-owner-flow`
5. `chat-realtime`

각 단계마다 `docs/scenarios/index.md` findings log와 remediation 문서를 즉시 갱신한다.

## 3) Concrete Files Likely To Change

### Infra / Runtime

- `docker-compose.yml`
- `deploy/Dockerfile.dev`
- `Makefile`
- `scripts/docker/bootstrap-workspace.sh` 신규 가능
- `.github/tasks/06-fix-make-dev-runtime.md`

### E2E Harness

- `e2e/global-setup.ts`
- `e2e/global-teardown.ts`
- `e2e/playwright.config.ts`
- `e2e/fixtures/auth.ts`
- `e2e/fixtures/api-helpers.ts`
- `e2e/fixtures/sessions.ts`

### Frontend selector contract

- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(main)/home/page.tsx`
- `apps/web/src/app/admin/layout.tsx`
- navigation/sidebar 관련 shared component files

### Spec stabilization

- `e2e/tests/auth-session-matrix.spec.ts`
- `e2e/tests/home.spec.ts`
- `e2e/tests/chat-realtime.spec.ts`
- 필요 시 `e2e/tests/match-join-flow.spec.ts`
- 필요 시 `e2e/tests/team-owner-flow.spec.ts`

### Docs

- `docs/scenarios/index.md`
- `docs/plans/2026-04-07-agent-all-qa-remediation-plan.md`
- `docs/plans/2026-04-07-qa-remediation-plan.md`
- `AGENTS.md`
- `.claude/agents/workflow.md`

## 4) Technical Risks During Execution

### R1. Volume reset로 인한 cold start 확대

`node_modules`와 pnpm store 정리를 잘못하면 첫 기동 시간이 크게 늘어나고, 팀이 "고장"으로 오해할 수 있다. bootstrap 스크립트는 destructive reset 조건을 명확히 로그로 남겨야 한다.

### R2. Runtime fix 이후 숨겨진 TypeScript / package drift 노출

지금까지는 native module failure가 먼저 터졌기 때문에, 그 아래의 package boundary 문제나 TS config 문제가 가려졌을 수 있다. API health 복구 단계에서 추가 오류가 연속적으로 드러날 가능성이 높다.

### R3. E2E seeding 전략 변경이 권한/데이터 lifecycle을 흔들 수 있음

host Prisma direct access를 없애면 admin 승격, seed cleanup, test persona lifecycle이 새 진입점으로 옮겨간다. 이때 실제 권한 정책과 테스트 편의용 backdoor가 섞이지 않도록 별도 경계를 잡아야 한다.

### R4. Reporter fallback이 결과물 가시성을 일시적으로 낮출 수 있음

stabilization 동안 `html` reporter를 내리면 CI/로컬에서 가독성은 떨어질 수 있다. 대신 crash-free execution을 우선하고, 안정화 후 reporter를 복원하는 2단계 전략이 필요하다.

### R5. Selector 계약 추가가 UI 구현과 결합될 수 있음

무분별한 `data-testid` 추가는 유지보수 비용을 높인다. 우선순위 시나리오에서 필요한 contract만 두고, 가능한 경우 semantic role과 visible name을 먼저 사용해야 한다.

### R6. Runtime 미복구 상태에서 spec 수정이 다시 낭비될 수 있음

현재 가장 큰 리스크는 순서를 거꾸로 잡는 것이다. selector를 먼저 고치면 실패율은 잠시 줄어도 runtime과 DB harness가 그대로라 QA 신뢰도는 회복되지 않는다.

## Recommended Order Summary

1. dev topology 사실관계 고정
2. Docker dependency bootstrap 안정화
3. API health 복구
4. E2E DB topology 정렬
5. Playwright dependency / reporter 안정화
6. selector contract 정리
7. 우선순위 시나리오 재실행
8. findings와 remediation docs 동기화

이 라운드의 핵심은 기능 구현이 아니라 "QA가 믿을 수 있는 런타임과 harness 복구"다. 이 기준이 회복되기 전까지 개별 기능 실패는 제품 결함으로 분류하지 않는 것이 맞다.
