# TEAM Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `TEAM-001` 팀 목록 기본 렌더
- `TEAM-002` 팀 검색
- `TEAM-003` 팀 필터
- `TEAM-004` 팀 상세 guest/auth
- `TEAM-005` 팀 생성 happy path
- `TEAM-006` 팀 생성 validation
- `TEAM-007` 팀 수정 happy path
- `TEAM-008` 팀 수정 권한
- `TEAM-009` 가입 자격 조회
- `TEAM-010` 팀 가입 신청
- `TEAM-011` 가입 신청 철회
- `TEAM-012` 가입 신청 목록
- `TEAM-013` 가입 승인
- `TEAM-014` 가입 거절
- `TEAM-015` 멤버 목록
- `TEAM-016` 역할 변경
- `TEAM-017` 멤버 제거
- `TEAM-018` self leave
- `TEAM-019` 내 팀 role view
- `TEAM-020` 팀 기반 연결

Out of scope:

- `AUTH-*`
- `TOURN-*` administrator state transitions
- `MY-*` account settings and reviews
- `CHAT-*` room internals
- `NOTI-*`
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/teams/**`
- `apps/v1_web/src/app/my/teams/**`
- `apps/v1_web/src/components/teams/**`
- `apps/v1_web/src/components/my/my-member-card.tsx`
- `apps/v1_api/src/teams/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Mobile `390x844` route/action check
- [ ] Desktop `1440x900` route/action check
- [ ] Permission and role-gated CTA check
- [ ] Happy path mutation check
- [ ] Negative path and duplicate action check
- [ ] Reload persistence check
- [ ] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- teams.controller.spec.ts`
- `pnpm --filter v1_web test -- src/components/teams`
- `pnpm exec playwright test e2e/tests/team-owner-flow.spec.ts e2e/tests/team-manager-membership.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
- `pnpm exec playwright test e2e/tests/teams.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line`

## Result Log

검증 방법:
- API: `curl http://localhost:8121/api/v1/...` — v1 API 직접 호출 (포트 8121, `x-v1-user-email` 헤더 인증)
- Unit: `apps/v1_api/src/teams/teams.controller.spec.ts` — 14/14 PASS
- E2E: `e2e/tests/team-owner-flow.spec.ts`, `e2e/tests/team-manager-membership.spec.ts`

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| TEAM-001 | API | API | PASS | `GET /api/v1/teams?limit=10` → 10개 items, `hasNext=true`, guest viewer=null. Unit: `teams.controller.spec.ts` "list" PASS | `query` 파라미터로 검색, `search` 아님 |
| TEAM-002 | API | API | PASS | `GET /api/v1/teams?query=러닝` → 1개 item (강남 러닝 크루) 정확히 반환 | `search` 파라미터는 동작 안 함, `query` 사용 |
| TEAM-003 | API | API | PASS | `GET /api/v1/teams?sportId=<UUID>` 풋살 5개, `?regionId=<UUID>` 강남구 2개 필터 정확히 동작. 스포츠/지역 필터는 이름 문자열이 아닌 UUID 필요 | UUID는 `/api/v1/sports`, `/api/v1/regions`에서 조회 |
| TEAM-004 | API | API | PASS | Guest(헤더 없음) → `viewer=null`. owner(`owner@teameet.v1`) → `viewer.role='owner'`, `viewer.joinState='member'`, `viewer.canRequestJoin=false`. E2E: `team-owner-flow.spec.ts` TEAM-001-A~D | 응답의 viewer 필드는 flat이 아닌 중첩 객체 |
| TEAM-005 | API | API | PASS | `POST /api/v1/teams` `{name, sportId(UUID), regionId(district UUID), joinPolicy:'approval_required'}` → 201, teamId 반환. Unit: "create" PASS. E2E: `team-owner-flow.spec.ts` TEAM-001-C | `sportType:'futsal'` 문자열 금지, UUID 필수. `regionId`는 district(구) 레벨 UUID |
| TEAM-006 | API | API | PASS | `POST /api/v1/teams` body `{}` → 400 VALIDATION_ERROR. Unit: "create" 검증 커버. E2E: `team-owner-flow.spec.ts` TEAM-001-B | 필수 필드(sportId, regionId, name, joinPolicy) 전부 누락 시 400 |
| TEAM-007 | API | API | PASS | `PATCH /api/v1/teams/:id` `{sportId, regionId, joinPolicy, name, version:team.updatedAt.toISOString()}` → 200 성공. Unit: "update" PASS | `version` 필드(optimistic concurrency) 필수. `description` 필드 없음, `introduction` 사용 |
| TEAM-008 | API | API | PASS | member 계정(`member@teameet.v1`)으로 `PATCH /api/v1/teams/:id` → 403 PERMISSION_DENIED. Unit: "update" PASS. E2E: `team-manager-membership.spec.ts` TEAM-002-C | owner/manager 만 수정 가능. member는 거부 |
| TEAM-009 | API | API | PASS | `GET /api/v1/teams/:id/join-eligibility` (비멤버) → `{eligible:true, reasonCode:'OK'}`. 이미 멤버인 경우 `eligible:false, reasonCode:'ALREADY_MEMBER'`. Unit: "join-eligibility" PASS | |
| TEAM-010 | API | API | PASS | `POST /api/v1/teams/:id/join-applications` `{message:'가입 신청합니다'}` → 201, applicationId 반환. Unit: "create-application" PASS | 이미 pending 신청이 있으면 409 |
| TEAM-011 | API | API | PASS | `POST /api/v1/team-join-applications/:appId/withdraw` → 200 성공. Unit: "withdraw-application" PASS | pending 상태 신청만 철회 가능 |
| TEAM-012 | API | API | PASS | `GET /api/v1/teams/:id/join-applications` (owner) → 1개 신청, applicant nickname/profileImageUrl 포함. Unit: "list-applications" PASS | manager+ 전용 엔드포인트 |
| TEAM-013 | API | API | PASS | `POST /api/v1/team-join-applications/:appId/approve` (빈 body) → 200 성공, 신청자 active 멤버로 전환. Unit: "approve-application" PASS | body에 필드를 넣으면 VALIDATION_ERROR — 빈 body 또는 body 없이 호출 |
| TEAM-014 | API | API | PASS | `POST /api/v1/team-join-applications/:appId/reject` → 200 성공. Unit: "reject-application" PASS | 거부 후 재신청 가능 (left 상태) |
| TEAM-015 | API | API | PASS | `GET /api/v1/teams/:id/members` (owner) → 4명 멤버, role/membershipId 포함. Unit: "members" PASS. E2E: `team-manager-membership.spec.ts` TEAM-002-A~C | |
| TEAM-016 | API | API | PASS | `PATCH /api/v1/team-memberships/:membershipId/role` `{role:'manager'}` → 200 성공. manager가 owner로 변경 시도 → PERMISSION_DENIED. Unit: "change-role" PASS. E2E: `team-manager-membership.spec.ts` TEAM-005-A | owner 만 manager로 승격 가능, manager는 owner 승격 불가 |
| TEAM-017 | API | API | PASS | `POST /api/v1/team-memberships/:membershipId/remove` (owner가 타 멤버 제거) → 200 성공. Unit: "remove-membership" PASS. E2E: `team-manager-membership.spec.ts` TEAM-005-B | `assertOwner` — owner만 멤버 제거 가능 |
| TEAM-018 | — | — | BLOCKED | `POST /team-memberships/:id/remove`는 `assertOwner` 호출 — member 본인이 실행 시 PERMISSION_DENIED. self-leave 전용 엔드포인트 없음. `apps/v1_api/src/teams/teams.service.ts` `removeMembership()` 확인 | API 미구현: v1에 self-leave 엔드포인트 없음. E2E `team-manager-membership.spec.ts` TEAM-004-A는 프론트 기대만 검증 |
| TEAM-019 | API | API | PASS | `GET /api/v1/me/teams` (owner) → 강남 러닝 크루(role:owner). (manager) → 강남 러닝 크루(role:manager). Unit: "my-teams" PASS | 엔드포인트는 `/teams/me` 아닌 `/me/teams` |
| TEAM-020 | API | API | PASS | `GET /api/v1/team-matches?teamId=<teamId>` → 2개 팀 매치. `GET /api/v1/teams/:id` 응답에 `viewer.manageRoute` 포함 (owner → `/teams/:id/manage`). Unit: 14/14 PASS | 팀 기반 경기 연결은 team-matches?teamId 쿼리로 동작 |

### 이슈 요약

| 번호 | ID | 분류 | 내용 |
|---|---|---|---|
| I-1 | TEAM-018 | API 미구현 | self-leave 엔드포인트 없음. `removeMembership()`이 `assertOwner`를 호출하여 본인 제거 불가. 별도 태스크 필요 |
| I-2 | TEAM-013 | 주의 | approve body에 필드를 넣으면 VALIDATION_ERROR. 빈 body로 호출해야 함 |
| I-3 | TEAM-005/007 | 주의 | DTO가 UUID 필드 요구(`sportId`, `regionId`). 문자열 이름 전달 시 VALIDATION_FAILED |
| I-4 | — | 페르소나 | `applicant@teameet.v1`(지원수) 계정이 `withdrawal_pending` 상태로 v1 DB에 존재 → V1AuthGuard 403 차단. 테스트 시 다른 계정 사용 필요 |

