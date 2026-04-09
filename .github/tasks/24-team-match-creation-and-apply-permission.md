# Task 24 — Team Match: Host Team Selection & Role-Based Permission

## Context

팀 매칭은 "팀 vs 팀" 구조인데, `/team-matches/new` 모집글 작성과 `/team-matches/:id` 경기 신청 모두 **내 팀 중 어떤 팀을 호스트/신청자로 쓸지** 선택하는 UI가 없다 (또는 `myTeams[0]` 기본값만 사용). 또한 백엔드 `TeamMembershipService.assertRole`은 manager+ 권한을 요구하지만 프런트가 member에게도 작성/신청 버튼을 노출하여 API 에러로만 차단된다.

## Goal

팀 매칭 작성/신청 플로우에서 **다중 팀 사용자가 명시적으로 팀을 선택**할 수 있게 하고, **역할 기반 권한 (owner/manager)**을 프런트에서 선제 가드한다.

## Original Conditions (체크박스)

- [ ] `/team-matches/new` — `useMyTeams()` 결과 중 `role in ('owner','manager')`인 팀만 호스트 Select에 노출
- [ ] 조건 충족 팀이 0개일 때 `EmptyState` ("매니저 이상 권한을 가진 팀이 없어요") + 팀 생성 CTA
- [ ] `/team-matches/:id` 신청 모달 — 내 팀 중 `owner`/`manager`인 팀을 Select로 선택 (`applicantTeamId` 바디)
- [ ] 백엔드 `POST /team-matches` 생성 시 `assertRole(hostTeamId, userId, 'manager')` 가드 확인/추가
- [ ] 백엔드 `POST /team-matches/:id/apply` 시 `assertRole(applicantTeamId, userId, 'manager')` 가드 확인/추가
- [ ] DTO: `CreateTeamMatchDto.hostTeamId`, `ApplyTeamMatchDto.applicantTeamId` 필드 필수 검증

## User Scenarios

**S1 — 다중 팀 owner 모집글 작성**: 2개 팀(A owner, B manager, C member)을 가진 사용자가 `/team-matches/new` 진입 → 호스트 Select에 A, B만 노출 (C 제외) → A 선택 → 제출 성공.

**S2 — member 차단**: 모든 팀이 member 권한인 사용자 → Select EmptyState 안내 + "매니저는 팀장에게 요청하세요".

**S3 — 신청 팀 선택**: 2개 팀 manager인 사용자가 `/team-matches/:id` 신청 모달 → 팀 Select에서 신청 팀 선택 → 본인 팀이 이미 신청했거나 매칭된 팀이면 disable.

## Test Scenarios

**Happy**
- owner가 호스트 Select에서 자기 팀 선택 후 생성 → 201
- manager가 신청 Select에서 팀 선택 후 신청 → 201
- 생성/신청 후 해당 데이터가 `/team-matches?teamId=...`에서 조회됨

**Edge**
- 팀 0개 사용자 → Select EmptyState + `/teams/new` 링크
- 팀은 있으나 모두 member → 권한 부족 안내
- 다중 팀 중 일부만 조건 충족 → 충족 팀만 노출

**Error**
- member가 프런트 우회하여 직접 API 호출 → 백엔드 403 + 에러 코드 `TEAM_ROLE_INSUFFICIENT`
- `hostTeamId` 누락 → 400 `VALIDATION_FAILED`
- 본인 팀에 본인이 소속되지 않은 teamId 주입 시도 → 403

**Mock Updates**
- `apps/api/test/fixtures/team-matches.ts` — owner/manager/member fixture 분리
- `apps/api/src/team-matches/team-matches.service.spec.ts` — 권한별 케이스
- `apps/web/src/test/msw/handlers.ts` — `POST /team-matches` 핸들러에 `hostTeamId` 검증

## Parallel Work Breakdown

**backend-api-dev**
- `apps/api/src/team-matches/dto/create-team-match.dto.ts` — `hostTeamId` 필수/UUID 검증 확인
- `apps/api/src/team-matches/dto/apply-team-match.dto.ts` — `applicantTeamId` 필수/UUID 검증 확인
- `apps/api/src/team-matches/team-matches.controller.ts` — 메서드 레벨에서 `CurrentUser` 기반 assertRole 호출 유지

**backend-data-dev**
- `apps/api/src/team-matches/team-matches.service.ts` — `create()`, `apply()` 내부에서 `assertRole(teamId, userId, 'manager')` 가드 (이미 있으면 감사만)
- `apps/api/src/team-matches/team-matches.service.spec.ts` — 권한 케이스 3종

**frontend-ui-dev**
- `apps/web/src/app/(main)/team-matches/new/page.tsx` — 호스트 팀 Select (eligibleTeams 필터), EmptyState
- `apps/web/src/app/(main)/team-matches/[id]/page.tsx` — 신청 모달 내 applicantTeam Select 추가/수정

**frontend-data-dev**
- `useMyTeams()` 는 Task 22에서 `role` 노출 후 재사용
- `apps/web/src/hooks/use-api.ts` — `useCreateTeamMatch`, `useApplyTeamMatch` 시그니처에 teamId 포함 확인

## Acceptance Criteria

1. member만 소속된 사용자에게 `/team-matches/new` 제출 버튼이 노출되지 않음
2. manager가 여러 팀을 가진 경우 Select가 노출되고 기본값은 첫 eligible 팀
3. 백엔드 권한 우회 테스트 (`curl -X POST` with member token) → 403
4. E2E: owner 로그인 → 팀 매칭 작성 → `/team-matches/:id` 진입 → 정상 노출

## Tech Debt Resolved

- `myTeams[0].id`의 단일 팀 암묵 가정 제거
- 프런트-백엔드 권한 불일치로 인한 사용자 혼란 제거

## Security Notes

- **권한 이중 가드 필수**: 프런트 Select 필터링은 UX, 백엔드 `assertRole`이 실제 권한 (Core Principle 3)
- `applicantTeamId` spoofing 방지: 백엔드에서 `userId`가 해당 팀에 속하는지 먼저 확인

## Risks & Dependencies

- Task 22의 `useMyTeams().role` 필드가 선결 조건
- 기존 `apply` 엔드포인트가 `applicantTeamId`를 이미 받는지 확인 필요 (Phase 1-5에서 추가됐을 가능성)

## Ambiguity Log

- (해결됨) A5: owner + manager 모두 작성/신청 가능, member 차단
