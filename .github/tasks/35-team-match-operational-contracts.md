# Task 35 — Team Match Operational Contracts

Owner: tech-planner -> backend-dev + frontend-dev
Date drafted: 2026-04-11
Status: Implemented
Priority: P0

## Context

팀 매치 핵심 여정 중 운영 서브플로우(`arrival`, `score`, `evaluate`)는 아직 제품 계약이 완전히 닫히지 않았다. 특히 `arrival`, `score`는 route-local mock 데이터 의존이 남아 있고, 실제 팀 매치 엔티티와 동기화된 운영 화면이라고 보기 어렵다.

`TM-004`가 계속 pending인 이유는 단순 테스트 미작성보다 제품 계약이 아직 정직하게 고정되지 않았기 때문이다.

## Goal

- 팀 매치 운영 페이지가 실제 `team-match` 엔티티 기준으로 hydrate되게 만든다.
- 도착 인증, 점수 입력, 경기 후 평가가 새로고침 후에도 동일 상태를 보여주는 실제 플로우가 된다.
- 아직 지원되지 않는 단계는 진입점에서 정직하게 막고, route-local mock을 제거한다.

## Evidence

- `apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx`
- `docs/scenarios/05-team-match-flows.md`
- `docs/TEAM_MATCHING_SPEC.md`
- `docs/plans/2026-04-10-web-audit-remediation-plan.md`

## Owned Write Scope

- `apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx`
- `apps/api/src/team-matches/**`
- 필요 시 team-match 전용 e2e spec

## Must Not Touch

- 팀/멤버십 general WIP (`/teams/new`, `/my/teams`, `/teams/[id]/members`)
- 공개 brand/public shell

## Acceptance Criteria

- `arrival` 페이지는 실제 매치 제목, 날짜, 시간, 팀 정보, 상태를 route-local mock 없이 렌더링한다.
- `score` 페이지는 실제 quarter count와 team identity를 기준으로 동작한다.
- `evaluate` 페이지는 실제 완료 가능한 경기에서만 제출 가능하고, 중복 제출/잘못된 상태 제출이 차단된다.
- check-in/result/evaluation 이후 invalidate/refetch 경로가 있어 새로고침 후에도 같은 상태를 본다.
- 미지원 상태라면 사용자가 그 사실을 명확히 이해할 수 있는 empty/error/blocked UI를 본다.

## Validation

- `pnpm --filter api test -- team-matches`
- `pnpm --filter web exec tsc --noEmit`
- dedicated browser smoke or Playwright
  - team-match arrival
  - team-match score
  - team-match evaluate

## Out Of Scope

- 팀 생성/팀 선택 UX 전체 재설계
- team invitation/join model 변경
- scenario index write-back

## Risks

- 현재 `team` 관련 worktree 변경과 간접 충돌 가능성이 있으므로 branch 분리가 필요하다.

## Implementation Notes

- `arrival`, `score`, `evaluate`는 route-local mock을 제거하고 `useTeamMatch` detail 기준으로 hydrate되도록 재작성했다.
- `team-matches` backend는 `check-in/result/evaluate`에 대해 상태 gate, 참여 팀 검증, 중복 제출 차단을 강화했다.
- `arrival`은 최초 1회 저장만 허용하도록 바꿔, 이미 완료한 단계를 재제출하지 못하게 했다.
- 도착 인증 화면의 GPS 반경 판정, 현장 사진 업로드, 상대팀 지각/노쇼 판정은 아직 저장 계약이 닫히지 않아 fake control 대신 안내형 blocked/help UI로 전환했다.
- match detail CTA는 도착 인증을 직접 mutation하지 않고 운영 subpage 진입으로 바꿨다.
- detail/arrival는 공통 status helper를 사용해 같은 한국어 라벨과 badge tone으로 정렬했다.

## Validation Results

- `pnpm --filter api exec jest --runInBand --runTestsByPath src/team-matches/team-matches.service.spec.ts` ✅ (`49 passed`)
- `pnpm --filter web exec vitest run src/lib/__tests__/team-match-operations.test.ts` ✅ (`4 passed`)
- `pnpm --filter web exec tsc --noEmit --pretty false` ⚠️ current dirty dev workspace is missing expected `.next/types/**` artifacts, so typecheck fails before reaching task-35-specific files
- `curl http://localhost:8111/api/v1/health` ✅
- `curl -H 'Content-Type: application/json' -d '{"nickname":"시나리오E2E"}' http://localhost:8111/api/v1/auth/dev-login` ✅ (`201`)
- `apps/api/package.json` dev runtime smoke (`API_PORT=8112 pnpm run dev`) ✅ transpile-only 부팅으로 unrelated type error 없이 Nest가 기동한다. Redis 연결은 현재 host shell env 기준으로 degraded일 수 있으나 route bootstrap은 정상이다.
- `PW_SKIP_WEBSERVER=1 E2E_STORAGE_BOOTSTRAP_PATH=/team-matches E2E_AUTH_BOOTSTRAP_PATH=/team-matches pnpm exec playwright test e2e/tests/team-match-operations.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line` ⚠️ stale `submitResult` payload blocker는 해소됐다. preflight/global setup와 `dev-login`은 통과했지만, host Next dev runtime에서 `/team-matches` 계열이 간헐적으로 `ERR_CONNECTION_RESET` 또는 generic `Internal Server Error`를 반환해 browser green pass는 아직 닫히지 않았다.
