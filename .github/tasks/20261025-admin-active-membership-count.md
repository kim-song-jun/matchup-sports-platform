# Task 20261025: 관리자 회원 현재 소속 집계 정합성

Status: Review
Owner: Codex
Created: 2026-10-05

## Context
관리자 회원 목록에서 전체 소속 이력과 active 역할 집계를 혼합하여 `1 (0/0/0)`이 표시된다. 목록과 상세에 동일한 결함이 있다.

## Goal
alpha에 올릴 수정으로 현재 소속 수와 팀장/매니저/멤버 합계를 일치시킨다.

## Original Conditions
- [x] 목록과 상세의 membershipCount를 active 소속 기준으로 통일한다.
- [x] 탈퇴(left)·제명(removed) 이력을 현재 소속에서 제외한다.
- [x] API 문서와 patch changeset을 준비한다.
- [x] 회귀 테스트 및 backend lint 검증 완료.

## User Scenarios
관리자는 소속을 모두 종료한 회원에게 `0 (0/0/0)`을 보고, 현재 세 역할로 소속된 회원은 과거 이력과 무관하게 `3 (1/1/1)`을 본다.

## Test Scenarios
- 목록/상세 각각 탈퇴 이력만, 제명 이력만, 현재 세 역할+과거 이력 혼합의 6개 회귀 계약.
- 기존 관리자 인증 403, 회원 없음 404와 목록/상세 응답 검증 유지.
- Prisma active relation query 조건과 응답 총수/역할 합계/상세 목록 길이를 함께 검증.
- mock은 전체 이력 수와 active 관계 배열을 구분한다. 스키마 및 MSW 응답 구조 변경 없음.

## Parallel Work Breakdown
단일 에이전트 순차 진행. Backend: service/spec. Docs: 두 API 계약 문서/task/changeset. Frontend/Infra 구현 변경 없음.
Owned: apps/v1_api/src/admin/admin.service.ts, apps/v1_api/src/admin/admin-list.service.spec.ts, docs/api/domains/admin-and-ops.md, docs/api/domains/tournament-operations-auth.md, 본 task, .changeset/admin-active-membership-count.md.
Forbidden: 나머지 경로, main 승격, 사용자 DB 변경.

## Acceptance Criteria
- [x] membershipCount = owner + manager + member, 상세의 active 배열 길이와 일치.
- [x] 좁은 회귀 테스트와 관련 검증 통과.
- [ ] alpha 배포/실측 상태와 남은 blocker를 명시.

## Tech Debt Resolved
필터 없이 수행하던 중복 membership count query를 제거하고 기존 active 관계 배열을 총수의 단일 기준으로 사용한다.

## Security Notes
기존 V1AuthGuard 및 active admin 권한 유지. 개인정보/계정 식별자를 추가하지 않는다. 읽기 응답 계산만 바꾸며 이력은 보존한다.

## Risks & Dependencies
alpha 배포는 dev 대상 PR/CI/merge를 거친다. 브라우저 실측에는 실제 관리자 로그인 세션이 필요하다. DB migration/seed/reset 불필요.

## Ambiguity Log
사용자가 alpha용 수정을 요청했다. 현재 소속은 membership.status=active로 해석하며 팀 자체 상태 등 인접 정책은 변경하지 않는다.

## Progress Snapshot
최신 origin/dev 04654d297에서 격리 브랜치 fix/admin-active-membership-count 생성. 공유 작업트리의 줄바꿈/WIP는 보존. RED: 신규 6개 테스트 모두 실제 응답 1≠0 / 5≠3으로 실패. 초기 실행은 공유 Prisma 생성 파일이 최신 dev schema의 listImageUrl 필드와 불일치하여 시작 전 실패했으며, 격리 node_modules에 동일 dev schema의 Prisma client를 생성하여 해결했다(공유 생성 파일·DB 미변경). GREEN: admin-list.service.spec.ts 64/64 PASS(신규 6개 포함). tsc --noEmit PASS. surface check는 sandbox child shell EPERM으로 첫 실행 불가였으며 해당 검사만 escalation 재실행하여 602 files PASS. git diff --check PASS, touched-path debt marker 없음. validation schema 및 root 의존성 symlink 정리; test/API 프로세스 잔존 없음.

alpha 배포 및 실제 관리자 화면 검증은 미실행. 이 작업은 alpha용 수정 PR 준비 단계이며 운영(main) 변경 없음.
