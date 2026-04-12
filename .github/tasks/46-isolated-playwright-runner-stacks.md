# Task 46 — Isolated Playwright Runner Stacks

Owner: project-director -> infra-dev / frontend-dev / backend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

현재 로컬 Playwright는 shared dev stack(`docker-compose.yml`, `localhost:3003`, `localhost:8111`)과 shared auth artifact(`e2e/.auth`)를 전제로 한다.

이 계약은 single active runner에는 맞지만, 서로 다른 Playwright runner를 동시에 띄우면 아래 충돌이 난다.

- fixed host port `3003/8111`
- shared `e2e/.auth/*.json` / `seed-data.json`
- root `docker compose exec postgres`를 전제로 한 E2E DB runtime helper
- 일부 spec의 hardcoded `localhost:3003` / `../.auth/*`

이 task는 shared dev stack을 concurrent-safe하게 만드는 것이 아니라, **Playwright 전용 isolated stack을 additive path로 추가**하는 작업이다.

## Goal

- runner id별로 독립된 compose project / web port / api port / auth artifact dir를 갖는 Playwright 전용 실행 경로를 추가한다.
- shared `make dev` 흐름은 그대로 유지하고, concurrent E2E는 별도 isolated stack으로만 지원한다.
- E2E harness와 대표 spec에서 hardcoded shared runtime 의존을 제거한다.

## Evidence

- `docker-compose.yml`
- `deploy/Dockerfile.dev`
- `Makefile`
- `e2e/playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/global-teardown.ts`
- `e2e/fixtures/db-runtime.ts`
- `e2e/tests/notification-center.spec.ts`
- `e2e/tests/chat-realtime.spec.ts`
- `e2e/tests/admin-honest-data.spec.ts`
- `AGENTS.md`
- `docs/scenarios/index.md`

## Owned Write Scope

- `docker-compose.e2e.yml`
- `scripts/qa/run-e2e-isolated.mjs`
- `Makefile`
- `e2e/playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/global-teardown.ts`
- `e2e/fixtures/db-runtime.ts`
- `e2e/fixtures/preflight.ts`
- `e2e/fixtures/sessions.ts`
- `e2e/fixtures/runtime.ts`
- representative E2E specs with shared `.auth` / `localhost` hardcoding
- `apps/api/src/realtime/realtime.gateway.ts`
- `AGENTS.md`
- `README.md`
- `docs/scenarios/index.md`
- `.codex/agents/workflow.md`
- `.claude/agents/workflow.md`

## Acceptance Criteria

- Given runner A/B have different compose project names, web/api ports, and auth dirs
  When both isolated stacks are up
  Then there is no host-port or container-name collision.
- Given runner A runs `global-setup` / `global-teardown`
  When runner B is still alive
  Then A only touches A's auth artifacts and A's docker compose postgres runtime.
- Given the shared dev stack is already running via `make dev`
  When isolated E2E support is added
  Then the shared workflow remains unchanged and still assumes a single active runner.
- Given isolated mode is used
  When Playwright starts
  Then it attaches to the externally managed isolated stack with `PW_SKIP_WEBSERVER=1`.
- Given a developer reads only repository docs
  When they need two concurrent Playwright runners
  Then they can follow an explicit up/run/down workflow without diff archaeology.

## Validation

- `docker compose -f docker-compose.e2e.yml config`
- `node scripts/qa/run-e2e-isolated.mjs up r1`
- `node scripts/qa/run-e2e-isolated.mjs up r2`
- `node scripts/qa/run-e2e-isolated.mjs run r1 -- e2e/tests/auth-session-matrix.spec.ts --project=Desktop Chrome`
- `node scripts/qa/run-e2e-isolated.mjs run r2 -- e2e/tests/admin-honest-data.spec.ts --project=Desktop Chrome`
- targeted realtime smoke in isolated mode
- `node scripts/qa/run-e2e-isolated.mjs down r1`
- `node scripts/qa/run-e2e-isolated.mjs down r2`

## Out Of Scope

- 기존 `docker-compose.yml`를 범용 multi-project compose로 전면 리팩터링
- shared dev stack 자체를 concurrent-safe하게 만들기
- Playwright browser를 별도 container에서 실행하기
- CI matrix orchestration 또는 worker-level DB snapshot/restore
- local default `workers=1` 정책 변경

## Risks

- isolated stack 수만큼 CPU/RAM과 Next/Nest cold-start 비용이 증가한다.
- bind mount는 공유하므로 code snapshot까지 완전 격리되지는 않는다.
- isolated compose에서 `apps/web/.next`까지 host bind mount로 공유하면 Next dev artifact가 섞여 `Cannot find module './*.js'`와 `/landing` 500이 난다. 이 task에서는 stack-local `.next` volume으로 차단했다.
- 남은 hardcoded `localhost` / `.auth` 참조가 하나라도 빠지면 isolation contract가 깨진다.
- websocket origin이 isolated web port를 따라가지 않으면 realtime spec가 실패한다.

## Validation Notes

- canonical usage/runbook doc
  - `docs/PLAYWRIGHT_E2E_RUNBOOK.md`
- `node scripts/qa/run-e2e-isolated.mjs env NotifSmoke`
  - upper-case `RUN` 입력이 `notifsmoke` compose project preview로 정규화되는 것을 확인
- explicit same-port claim smoke
  - `PLAYWRIGHT_WEB_PORT=14077 PLAYWRIGHT_API_PORT=19077 node scripts/qa/run-e2e-isolated.mjs up AlphaRun` 성공
  - 동일 포트로 `BetaRun` 동시 실행 시 `Requested ports are already claimed by another isolated run`으로 차단
- concurrent isolated stacks
  - `node scripts/qa/run-e2e-isolated.mjs up IsoA`
  - `node scripts/qa/run-e2e-isolated.mjs up IsoB`
  - `.next`를 stack-local volume으로 분리한 뒤 두 stack 모두 readiness 통과
- isolated spec rerun
  - `node scripts/qa/run-e2e-isolated.mjs run IsoA -- e2e/tests/auth-session-matrix.spec.ts --project='Desktop Chrome'`
  - `7 passed`
  - `node scripts/qa/run-e2e-isolated.mjs run IsoB -- e2e/tests/notification-center.spec.ts --project='Desktop Chrome' -g 'same user tabs receive match-created notification and open its deep link'`
  - `1 passed`
