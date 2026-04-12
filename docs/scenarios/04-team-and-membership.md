# Team And Membership Scenarios

## Coverage Summary

- Primary personas: `팀장오너E2E`, `매니저E2E`, `일반팀원E2E`
- Automation status: Team/Membership core contracts are automated in Playwright with scenario IDs.
- Blocking dependencies: team edit/delete backend APIs are not implemented; only UI affordance contracts are in scope.
- Runtime note: current Playwright harness assumes the Docker dev stack (`make dev`) because `global-setup` touches `docker compose exec postgres psql` for E2E account restore/admin promotion.

## Scenario Checklist

- [x] TEAM-001 팀 생성 후 owner 관점 반영 (`e2e/tests/team-owner-flow.spec.ts`)
- [x] TEAM-002 owner/manager 권한 차등 (`e2e/tests/team-manager-membership.spec.ts`)
- [ ] TEAM-003 팀 목록/상세 fallback photo slot과 logo slot 분리 유지 (`visual/manual + follow-up automation`)
- [x] TEAM-004 일반 멤버 self-leave와 내 팀 동기화
- [x] TEAM-005 owner role change / remove member 반영 (`TEAM-005-A/B` pass, `TEAM-005-C` planned)

## TEAM-001 팀 생성 후 owner 관점 반영

### User Story

- As a team owner
- I want to create a team with required fields
- So that the team appears in team discovery and my management surface

### Preconditions

- [x] `팀장오너E2E` 로그인 상태
- [x] `/teams/new` 접근 가능

### Given / When / Then

- Given owner is on `/teams/new`
- When required fields (`name`, `sport`, `city`) are entered and submitted
- Then redirect to `/teams` occurs and the created team is visible
- Then `/my/teams` shows owner role badge and supported member-management CTA only

### Negative / Edge Cases

- [x] 필수값 없이 submit 시 검증 토스트 노출
- [x] 필수 CTA는 지원되는 backend capability와만 연결된다

### Test Case Matrix

| Case ID | Type | Intent | Layer | Status | Automation |
|---------|------|--------|-------|--------|------------|
| `TEAM-001-A` | Happy | create form의 필수 필드 가용성 | Playwright | Automated | `team-owner-flow.spec.ts` |
| `TEAM-001-B` | Negative | 필수값 누락 validation | Playwright | Automated | `team-owner-flow.spec.ts` |
| `TEAM-001-C` | Happy | 생성 후 `/teams` + `/my/teams` 반영 | Playwright | Automated | `team-owner-flow.spec.ts` |
| `TEAM-001-D` | Contract | unsupported edit/delete CTA가 주요 표면에서 숨겨졌는지 검증 | Playwright | Automated | `team-owner-flow.spec.ts` |

## TEAM-002 owner/manager 권한 차등

### User Story

- As an owner or manager
- I want role-based management controls to match my permissions
- So that UI contract and backend authorization stay aligned

### Preconditions

- [x] spec가 owner/manager/member를 포함한 fresh fixture team을 API로 직접 준비한다.
- [x] 세 페르소나 모두 `/teams/:id/members`와 `/my/teams`에 접근 가능하다.

### Given / When / Then

- Given owner opens `/teams/:id/members`
- When member list is rendered
- Then owner-only member actions (`멤버 메뉴`) are visible
- Given manager opens the same page
- Then owner-only member actions are hidden and self-leave CTA is visible
- Given manager and member open `/my/teams`
- Then each role sees only supported CTA labels and no dead-end edit/delete controls

### Negative / Edge Cases

- [x] non-owner는 owner-only 멤버 메뉴를 볼 수 없다.
- [x] `/my/teams`에는 역할별로 지원되는 CTA만 남고 edit/delete dead-end는 숨겨진다.

### Test Case Matrix

| Case ID | Type | Intent | Layer | Status | Automation |
|---------|------|--------|-------|--------|------------|
| `TEAM-002-A` | Happy | owner members-page 관리 메뉴 노출 | Playwright | Automated | `team-manager-membership.spec.ts` |
| `TEAM-002-B` | Negative | manager는 owner 전용 메뉴 없이 supported CTA만 본다 | Playwright | Automated | `team-manager-membership.spec.ts` |
| `TEAM-002-C` | Negative | member는 읽기/탈퇴 수준 표면만 보고 owner 전용 CTA를 보지 못한다 | Playwright | Automated | `team-manager-membership.spec.ts` |

## TEAM-003 fallback photo slot과 logo slot 분리

### Status

- Planned for dedicated automation.
- Current verification remains documented as visual/manual QA.

### Blocker

- photo/logo fallback assertions need stable DOM hooks on team list/detail media slots.

## TEAM-004 일반 멤버 self-leave와 내 팀 동기화

### User Story

- As a regular team member
- I want to leave a team without stale team cards or broken navigation
- So that I can trust that my membership state is actually updated

### Preconditions

- [x] `일반팀원E2E`가 active member로 속한 fresh fixture team을 준비한다.
- [x] `/teams/:id/members`와 `/my/teams` 둘 다 접근 가능하다.

### Given / When / Then

- Given member opens `/teams/:id/members`
- When self-leave CTA를 누르고 확인 모달에서 탈퇴를 확정한다
- Then `/my/teams`로 이동하고 방금 탈퇴한 팀 카드가 사라진다

### Negative / Edge Cases

- [ ] owner에게는 self-leave CTA가 노출되지 않는다.
- [ ] leave mutation 실패 시 성공처럼 이동하지 않는다.

### Test Case Matrix

| Case ID | Type | Intent | Layer | Status | Automation |
|---------|------|--------|-------|--------|------------|
| `TEAM-004-A` | Happy | member self-leave 후 `/my/teams` sync 검증 | Playwright | Automated | `team-manager-membership.spec.ts` |
| `TEAM-004-B` | Contract | leave mutation route alignment에 대한 isolated 회귀 검증 | Hook + E2E | Planned | `apps/web/src/hooks/use-api.ts` |

## TEAM-005 owner role change / remove member 반영

### User Story

- As a team owner
- I want to update member roles or remove a member
- So that the roster stays accurate without dead-end controls

### Preconditions

- [ ] owner, manager, member가 모두 속한 팀을 준비한다.

### Given / When / Then

- Given owner opens `/teams/:id/members`
- When owner changes a manager role or removes a member
- Then role badge 또는 member row가 변경 결과와 일치한다
- Then 페이지를 새로고침해도 결과가 유지된다

### Negative / Edge Cases

- [ ] remove mutation이 membership id가 아니라 user id를 사용한다.
- [ ] owner row에 대해 role change / kick menu가 열리지 않는다.

### Test Case Matrix

| Case ID | Type | Intent | Layer | Status | Automation |
|---------|------|--------|-------|--------|------------|
| `TEAM-005-A` | Happy | owner가 manager를 member로 내리고 reload 후 유지되는지 검증 | Playwright | Automated | `team-manager-membership.spec.ts` |
| `TEAM-005-B` | Happy | owner가 일반 멤버를 remove하고 row가 사라지는지 검증 | Playwright | Automated | `team-manager-membership.spec.ts` |
| `TEAM-005-C` | Contract | remove mutation parameter mismatch 회귀 방지 | Hook + E2E | Planned | `apps/web/src/hooks/use-api.ts`, `team-manager-membership.spec.ts` |

## Notes

- 이 문서는 시나리오 ID와 Playwright 테스트명을 1:1로 맞춰 TDD 회귀 기준으로 사용한다.
- 미구현 기능 blocker와 테스트 미작성을 구분한다.
  - 미구현 기능: backend team update/delete API 부재
  - 테스트 미작성: TEAM-003 media fallback automation
  - 이번 라운드 구현 대상: TEAM-001, TEAM-002, TEAM-004 core contract, TEAM-005-B
- 2026-04-10: `/teams/new`는 실제 저장되는 필드만 submit하도록 정리했고, `/my/teams`와 `/teams/[id]`는 지원되지 않는 edit/delete CTA를 더 이상 노출하지 않는다.
- 2026-04-10: `04-team-and-membership` 범위에서는 `TEAM-001-A~D`, `TEAM-002-A~C`, `TEAM-004-A`, `TEAM-005-A/B`가 통과했고 `TEAM-004-B`, `TEAM-005-C`는 follow-up contract로 남아 있다.
- 2026-04-10: 같은 Playwright 실행 파일 묶음에는 다른 도메인 smoke인 `TM-SMOKE-001 /team-matches/new`도 포함되어 있어 전체 터미널 결과는 `10 passed / 1 skipped`로 기록됐다.
