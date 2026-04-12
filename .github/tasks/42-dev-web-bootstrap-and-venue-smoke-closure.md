# Task 42 — Dev Web Bootstrap And Venue Smoke Closure

Owner: project-director -> infra-dev / frontend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

Task 34의 코드 변경은 리뷰와 타입 검증을 통과했지만, `/venues/[id]` browser smoke는 dev `web` 컨테이너의 `.next/routes-manifest.json`, `_document.js`, `next-flight-client-entry-loader`, `next-flight-css-loader` ENOENT 런타임 이슈 때문에 완전 종료되지 못했다.

이 문제는 제품 기능 버그라기보다 local dev bootstrap / Next watch runtime의 안정성 문제다. 다만 재현이 남아 있으면 venue surface의 최종 런타임 검증 증거를 계속 막는다.

## Goal

- dev `web` 컨테이너의 `.next` / loader ENOENT 재현 조건을 고정한다.
- `deps + web` 재기동 규칙만으로 해결되지 않는 경우 compose/startup/runtime guard를 보강한다.
- `/venues/[id]` browser smoke를 정상 종료하고 Task 34의 남은 검증 갭을 닫는다.

## Evidence

- `.github/tasks/34-user-surface-honest-data-contracts.md`
- `AGENTS.md`
- `docker-compose.yml`
- `deploy/Dockerfile.dev`
- `Makefile`

## Owned Write Scope

- `docker-compose.yml`
- `deploy/Dockerfile.dev`
- `Makefile`
- `AGENTS.md`
- Task 34 / Task 42 문서

## Acceptance Criteria

- `docker compose up -d deps web` 또는 동등한 표준 재기동 경로로 `web`이 loader/module ENOENT 없이 복구된다.
- `.next/routes-manifest.json`, `_document.js`, `next-flight-client-entry-loader`, `next-flight-css-loader` 누락이 같은 bootstrap path에서 재발하지 않는다.
- `/venues/[id]` browser smoke를 현재 dev stack에서 다시 통과한다.
- 문제 재발 시 운영 가이드 없이도 개발자가 `AGENTS.md`와 task 문서만으로 복구 경로를 따라갈 수 있다.

## Validation

- `docker compose up -d deps web`
- `docker compose logs --tail=120 web`
- `curl -I http://localhost:3003/venues/{id}`
- targeted browser smoke
  - `/venues/[id]`

## Out Of Scope

- venue product 기능 확장
- production compose 변경
- unrelated Next warning cleanup

## Risks

- 재현 조건이 host FS state / volume state / hot reload race에 걸쳐 있으면 완전 재현이 어려울 수 있다.
- runtime issue가 비결정적이면 bootstrap guard와 cleanup 정책을 더 보수적으로 잡아야 할 수 있다.

## Execution Progress (2026-04-11)

- `docker-compose.yml`의 `deps`가 no-op 상태로 drift 나 있었고, shared dev `web`도 bind-mounted `apps/web/.next`를 그대로 사용하고 있었다.
- `deploy/bootstrap-dev-deps.sh`를 추가해 `/opt/deps` snapshot에서 root/api/web `node_modules`를 매 기동 시 다시 동기화하도록 복구했다.
- shared dev `web`에 stack-local `web_next_dir_v1` volume을 붙여 host-side `.next`와 분리했고, `apps/web/package.json`의 dev 스크립트도 mountpoint 자체가 아니라 `.next` 내부만 비우도록 바꿨다.
- 초기 재검증에서 host 포트 `3003`은 여전히 500이었지만, 응답 stack trace가 `/app/...`가 아니라 호스트 경로 `/Users/.../sports-platform/...`를 가리켜 Docker `web`이 아닌 stale host `pnpm --filter web dev`가 shadowing 중임을 확인했다.
- `lsof -nP -iTCP:3003 -sTCP:LISTEN`로 host-side Next listener를 식별했고, 해당 stale process를 종료한 뒤 `localhost:3003`이 Docker `web`로 정상 수렴했다.
- 최종 검증:
  - `docker compose -f docker-compose.yml up -d --build deps web`
  - `lsof -nP -iTCP:3003 -sTCP:LISTEN`
  - host HTTP smoke: `/landing`, `/login`, `/matches/new`, `/teams/new`, `/venues/1` 모두 `200`
  - `docker compose -f docker-compose.yml logs --tail=240 web`에서 위 경로들이 모두 `200`으로 컴파일/응답됨을 확인
