# Task 123 — Admin Owner Access Invariant

Owner: codex
Status: In progress
Priority: P0
Target: backend + docs
Mode: CODE + SECURITY REVIEW

## Problem

v1 관리자 mutation은 마지막 active owner를 단순 `count -> update`로 보호했다. PostgreSQL 기본 격리에서 두 owner 권한 제거가 동시에 실행되면 둘 다 count를 통과해 active owner가 0명이 될 수 있었다. 또한 active 관리자는 관리자 사용자 상태 변경·삭제 또는 일반 프로필 탈퇴 요청을 통해 자신의 인증 가능한 사용자 계정을 비활성화할 수 있었다.

## Security Contract

- active 관리자는 자신의 underlying `V1User`를 정지·차단·삭제하거나 탈퇴 대기로 전이할 수 없다.
- owner 접근을 제거하는 모든 관리자 경로는 active owner 행을 같은 순서로 잠그고, 사용자 계정까지 active인 다른 owner가 1명 이상 남는지 트랜잭션 안에서 확인한다.
- 사용자 상태 변경, 삭제, 관리자 권한 부여·재활성화는 대상 사용자 행을 잠근 뒤 최신 계정 상태를 다시 읽는다.
- inactive 사용자에게 관리자 권한을 부여·재활성화할 수 없다.
- support mutation 금지, owner-only 운영자 계정 제어, 감사 로그 계약은 유지한다.

## Owned Files

- `apps/v1_api/src/admin/admin.service.ts`
- `apps/v1_api/src/common/admin-context.service.ts`
- `apps/v1_api/src/common/admin-context.service.spec.ts`
- `apps/v1_api/src/tournaments/admin-registrations.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-announcements.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-players.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-popup.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-reviews.service.spec.ts`
- `apps/v1_api/src/tournaments/tournament-sponsors.service.spec.ts`
- `apps/v1_api/src/tournaments/tournaments-admin.controller.spec.ts`
- `apps/v1_api/src/tournaments/tournaments-admin.service.spec.ts`
- `.changeset/close-common-admin-account-gate.md`
- `apps/v1_api/src/admin/admin-mgmt.service.spec.ts`
- `apps/v1_api/src/admin/admin-inquiries.service.spec.ts`
- `apps/v1_api/src/admin/admin-list.service.spec.ts`
- `apps/v1_api/src/admin/admin-notices.service.spec.ts`
- `apps/v1_api/src/profile/profile.service.ts`
- `apps/v1_api/src/profile/profile.service.spec.ts`
- `apps/v1_api/test/integration/admin-owner-invariant.e2e-spec.ts`
- `apps/v1_api/prisma/migrations/20260719043000_v1_admin_active_account_invariant/migration.sql`
- `docs/api/domains/admin-and-ops.md`
- `docs/api/domains/users.md`
- `.changeset/secure-admin-owner-access.md`
- `.github/tasks/123-admin-owner-access-invariant.md`

## Acceptance Criteria

- [x] 관리자 self status/delete는 mutation 전에 stable error로 차단된다.
- [x] 일반 profile withdrawal 경로로 active admin self-lockout을 우회할 수 없다.
- [x] demote/revoke/suspend/block/delete owner 경로가 동일 owner lock/count invariant를 사용한다.
- [x] admin grant/reactivation은 active 사용자에게만 허용된다.
- [x] 대회·캠페인·연동이 공유하는 `AdminContextService`도 연결 사용자 계정의 active 상태를 직접 검증한다.
- [x] 동시 두-owner demotion에서 한 건만 성공하는 regression contract가 추가된다.
- [x] 실제 PostgreSQL 두 트랜잭션 통합 테스트가 동일 owner 잠금 계약을 검증한다.
- [x] 배포 시 inactive 사용자에 연결된 active admin 행을 revoke하는 remediation migration이 추가된다.
- [x] remediation은 runtime과 같은 owner-first 잠금 순서를 사용하고 system 감사 로그를 원자적으로 남긴다.
- [x] v1 admin/users API 계약 문서가 새 오류와 잠금 계약을 설명한다.
- [x] 컨트롤러·DTO·서비스·migration 기준 정적 계약 검토에서 legacy/nonexistent route drift가 제거된다.
- [ ] shared `AdminContextService` 회귀 spec을 포함한 변경이 GitHub CI의 직렬 test gate에서 통과한다.
- [ ] backend typecheck/integration은 shared gate 보강과 동일 commit GitHub CI에서 통과한다.
- [ ] shared gate 보강 commit 기준 독립 backend/security review에 blocker가 없다.

## Validation Gate

2026-07-19 preflight에서 12 cores / load `4.60 4.96 5.54`였지만 swap `31.0GB+ / 32GB`, Node 약 `749`, browser-like 약 `79`로 심한 메모리 압박이 확인됐다. 다른 세션 프로세스는 종료하지 않고 로컬 Jest/typecheck/build를 시작하지 않는다. 입력이 고정된 뒤 exact pathspec commit을 push하고 GitHub CI의 순차 backend 검증을 근거로 삼는다.

## Progress Snapshot

- 구현: admin/profile service의 active-linked-user, revoke-first, self-lockout, last-owner 직렬화 계약을 반영했고, shared `AdminContextService`에도 같은 linked-user gate를 적용했다.
- 데이터 remediation: `20260719043000_v1_admin_active_account_invariant` migration이 inactive 사용자에 연결된 active admin 접근을 revoke하도록 추가됨.
- 문서: 실제 v1 `AdminController`/`ProfileController` route, DTO payload, auth/error 계약으로 canonical 문서 동기화 완료.
- 정적 검토: controller, DTO, service, migration과 문서 링크/path 존재 여부 검토 완료.
- 독립 검토: 3차 backend/security gate에서 Critical 0, Warning 0, PASS.
- 검증: GitHub CI `29659353429`가 SHA `a608551bbafaa2a4689aabb166600b3ec87690f1`에서 typecheck, migration replay/drift, 실제 PostgreSQL owner 동시성 통합 테스트, unit, build를 통과했다.
- 배포: alpha run `29659353464`, release `0.1.0-alpha.20260719.ga608551bbafa`, 동일 SHA header, DB health `true`.
- 후속 정적 감사: tournament/campaign/integration이 공유하는 `AdminContextService`가 `V1AdminUser.status`만 확인하고 연결된 `V1User.accountStatus`를 읽지 않는 drift를 발견했다. linked-user select와 inactive account 거부 회귀 spec을 추가했다. 2026-07-19 05:39 KST host는 load `9.74/6.75/6.45`, swap `39.55/40GB`, Node-like `1200`, Playwright MCP `33`이라 로컬 Jest/typecheck는 시작하지 않았고, 새 commit 기준 CI/review/alpha 검증이 남았다.
- CI `29660153971`은 changeset, typecheck, migration replay까지 통과한 뒤 unit 단계에서 기존 9개 tournament spec의 admin row mock에 새 `user.accountStatus` relation이 없어 실패했다. 제품 코드를 느슨하게 fallback하지 않고 해당 fixture 9개를 실제 Prisma select shape로 맞췄다. 다음 commit에서 전체 직렬 unit/build gate를 다시 확인한다.

## Out of Scope

- main merge, production deploy, production DB mutation
- 관리자 UI redesign
- 운영자 역할/권한 모델 자체 변경
