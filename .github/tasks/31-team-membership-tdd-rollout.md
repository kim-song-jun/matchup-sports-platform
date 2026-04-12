# Task 31 — Team Membership TDD Rollout

Owner: codex
Date drafted: 2026-04-10
Status: Completed (scoped follow-ups remain)

## Context

사용자는 `agent-all` 방식으로 유저 시나리오와 테스트 케이스를 먼저 촘촘하게 쓰고, 그 문서를 기준으로 TDD처럼 Playwright E2E를 확장하고자 한다. 현재 저장소에는 `docs/scenarios/`와 `e2e/tests/`가 이미 존재하지만, 밀도가 영역별로 다르다. 특히 `docs/scenarios/04-team-and-membership.md`는 고수준 체크리스트에 머물러 있고, 대응 E2E인 `e2e/tests/team-owner-flow.spec.ts`, `e2e/tests/team-manager-membership.spec.ts`도 다수 케이스가 “페이지가 깨지지 않는다” 수준의 smoke 검증에 그친다.

동시에 팀 관련 사용자 표면에는 false affordance가 남아 있다. `useMyTeams()`는 owner/manager/member 전체를 반환하는데, `/my/teams`는 이를 “운영 중인 팀”처럼 렌더링하며 edit/delete 같은 미지원 관리 CTA까지 노출한다. `/teams/[id]` 상세도 지원되지 않는 팀 수정 진입점을 노출한다. 이 상태에서는 테스트를 늘려도 제품 계약이 흔들려 TDD 기준선이 되지 못한다.

## Goal

- 팀/멤버십 영역에 대해 TDD용 시나리오 문서와 테스트 케이스 매트릭스를 만든다.
- 팀 관련 관리 CTA를 실제 권한/지원 범위에 맞게 정리해 false affordance를 제거한다.
- Playwright가 owner/manager/member 역할 차이와 팀 생성 플로우를 행동 계약 수준으로 검증하게 만든다.
- 실행 결과를 task 문서와 scenario index에 다시 기록해 다음 도메인 확장의 기준선으로 삼는다.

## Original Conditions

- [x] 사용자 시나리오를 면밀하고 꼼꼼하게 정리한다.
- [x] 현재 부족한 테스트 케이스부터 먼저 보강한다.
- [x] 문서 기반으로 TDD처럼 다음 구현/검증 라운드를 진행할 수 있어야 한다.
- [x] 이후 Playwright E2E로 이어질 수 있게 자동화 매핑을 만든다.

## User Scenarios

- **TEAM-001**: owner가 팀을 생성하고, 목록/상세/내 팀에서 동일 팀을 확인하며 owner 전용 지원 CTA만 본다.
- **TEAM-002**: 동일 팀에서 owner/manager/member가 서로 다른 권한 표면을 본다. owner만 멤버 role 변경/강퇴 메뉴를 보고, 비-owner는 leave만 가능하다.
- **TEAM-003**: 팀 카드/상세의 logo slot과 photo slot fallback이 섞이지 않는다.

## Test Scenarios

### Docs

- `docs/scenarios/04-team-and-membership.md`를 Given/When/Then + case matrix 구조로 재작성한다.
- `docs/scenarios/index.md`에 해당 영역의 automation mapping과 현재 verdict를 반영한다.
- `docs/scenarios/TEMPLATE.md`를 새 케이스 작성 규칙에 맞게 보강한다.

### Frontend

- `/my/teams`는 “운영 중인 팀”이 아니라 “소속 팀” 계약으로 정렬한다.
- `/my/teams`와 `/teams/[id]`에서 미지원 edit/delete CTA를 제거하고 지원되는 팀 액션만 남긴다.
- 역할 배지와 action test id를 추가해 Playwright가 안정적으로 검증할 수 있게 한다.
- `/teams/[id]/members`에서 멤버 메뉴/탈퇴 액션을 사용자별로 식별 가능한 selector로 노출한다.

### Playwright

- `TEAM-001`: owner가 UI로 팀 생성 후 `/teams`, `/teams/[id]`, `/my/teams`에서 동일 팀과 role/action 상태를 검증한다.
- `TEAM-002-A`: owner가 멤버 관리 화면에서 manager/member row의 role과 owner-only menu를 본다.
- `TEAM-002-B`: manager는 owner-only menu를 보지 못하고 본인 leave CTA만 본다.
- `TEAM-002-C`: member는 owner/manager 운영 CTA를 보지 못하고 읽기/탈퇴 수준 표면만 본다.

### Blockers To Encode

- 팀 수정/삭제 happy path는 backend route 부재로 out of scope. 테스트는 “진입점 비노출”을 현재 계약으로 고정한다.
- 팀 초대 UI는 backend nickname-search 미지원으로 hidden 상태 유지. 이번 라운드에서 자동화하지 않는다.

## Parallel Work Breakdown

### Sequential

- task 문서 작성
- 시나리오 문서 구조 보강

### Frontend

- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/app/(main)/my/teams/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/members/page.tsx`

### Infra / E2E

- `e2e/tests/team-owner-flow.spec.ts`
- `e2e/tests/team-manager-membership.spec.ts`
- 필요 시 `e2e/fixtures/*` helper 보강

### Backend

- 이번 라운드 기본 가정: 기능 추가 없음
- 단, 테스트를 안정화하기 위한 contract helper 보강만 허용

## Acceptance Criteria

- `docs/scenarios/04-team-and-membership.md`가 시나리오별 case id, preconditions, happy/negative assertions, automation mapping, blocker notes를 가진다.
- `/my/teams`는 role을 명시하고, 미지원 edit/delete CTA를 노출하지 않는다.
- `/teams/[id]`는 현재 지원되지 않는 team edit 진입점을 노출하지 않는다.
- Playwright team 영역 spec이 smoke가 아니라 role-based behavior를 실제로 assert한다.
- 관련 Playwright spec이 로컬 runtime에서 녹색으로 통과한다.

## Tech Debt Resolved

1. `useMyTeams()` 반환 계약과 `/my/teams` 설명/CTA의 의미 불일치
2. 팀 management surface의 false affordance
3. team membership E2E의 weak assertion

## Security Notes

- owner-only 관리 액션은 UI에서도 비-owner에게 숨기고, backend 권한과 동일한 계약을 유지한다.
- 지원되지 않는 destructive CTA를 제거해 사용자가 실패 경로를 정상 기능으로 오인하지 않게 한다.
- Playwright는 기존 dev-login/storageState 패턴만 사용하고 `.env*`에 접근하지 않는다.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| API가 내려가 있으면 Playwright global setup이 실패 | 실행 전 `/api/v1/health` 확인 |
| full Playwright bundle이 Docker Postgres runtime에 의존함 | `make dev` 기준으로 실행하고, preflight에서 `docker compose exec -T postgres psql ...` readiness를 먼저 확인 |
| 기존 E2E selector가 brittle | 이번 라운드에서 role/action용 stable selector 추가 |

## Validation

- `pnpm --filter api test -- teams.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm exec playwright test e2e/tests/team-owner-flow.spec.ts e2e/tests/team-manager-membership.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`

### Result

- api unit: passed (`491/491`)
- web typecheck: passed
- Playwright team bundle: passed with scoped skips (`10 passed / 1 skipped`, Docker dev stack 기준)
- skipped cases:
  - `TM-SMOKE-001` `/team-matches/new` owner entry smoke

## Ambiguity Log

1. **팀 수정/삭제를 이번 라운드에서 구현할지 여부**
   - 결정: 구현하지 않는다. backend route가 없어 false affordance 제거와 blocker 문서화로 한정한다.
2. **manager의 허용 범위**
   - 결정: 현재 backend 기준으로 member add/invite 계열만 허용되며, role change/remove는 owner-only로 본다.
3. **member의 `/teams/:id/members` 접근**
   - 결정: member+ 접근 가능 계약을 유지하되, member는 읽기/leave 수준 표면만 본다.
