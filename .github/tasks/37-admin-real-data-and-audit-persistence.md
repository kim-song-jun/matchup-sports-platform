# Task 37 — Admin Real Data And Audit Persistence

Owner: tech-planner -> backend-dev + frontend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

관리자 표면은 “운영 판단”이 개입되는 영역인데도 일부 페이지는 mock list를 렌더링하고, `AdminService`의 moderation/audit 상태는 아직 `Map` 기반 in-memory다. 이 상태는 서버 재시작 시 운영 기록이 사라지고, 운영자가 샘플 데이터를 실제 데이터로 오해하게 만든다.

admin surface는 다른 사용자-facing 화면보다 더 엄격하게 honest해야 한다.

## Goal

- 관리자 페이지에서 silent mock fallback을 제거한다.
- 관리자 제재/audit 상태를 영속화해 서버 재시작 후에도 유지되게 만든다.
- 운영 화면은 real data / empty / error contract만 사용한다.

## Evidence

- `apps/web/src/app/admin/reviews/page.tsx`
- `apps/web/src/app/admin/mercenary/page.tsx`
- `apps/web/src/app/admin/venues/[id]/page.tsx`
- `apps/web/src/app/admin/statistics/page.tsx`
- `apps/api/src/admin/admin.service.ts`
- `.github/tasks/26-qa-backlog-followups.md`
- `.github/tasks/32-web-audit-and-remediation.md`

## Owned Write Scope

- `apps/web/src/app/admin/**`
- `apps/api/src/admin/**`
- `apps/api/prisma/**` for audit persistence
- admin-focused tests

## Acceptance Criteria

- admin pages가 API 비어 있음/오류 상태에서 mock list를 대신 렌더링하지 않는다.
- `warn`, `suspend`, `reactivate` 같은 moderation/audit 결과가 재시작 후에도 유지된다.
- 관리자 후속 링크와 상태 변화는 admin shell 안에서 맥락을 잃지 않는다.
- 부분 실패가 가능한 운영 액션은 성공/실패가 구분되어 보인다.

## Validation

- `pnpm --filter api test -- admin`
- `pnpm --filter api build`
- `pnpm --filter web exec tsc --noEmit`
- targeted admin browser smoke
  - dashboard
  - users detail moderation
  - payments/reviews one surface each
- targeted moderation persistence restart smoke
  - `warn -> suspend -> api restart -> detail refetch -> reactivate`

## Out Of Scope

- 관리자 전체 정보 구조 재설계
- 통계 차트 고도화
- marketing/admin copy polish only changes

## Risks

- Prisma migration이 필요하면 deploy-safe 전략과 함께 검토해야 한다.

## Implementation Summary

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260411090000_add_admin_user_audit_persistence/migration.sql`
  - `User.adminStatus`, `User.adminSuspensionReason`, `AdminUserAuditLog`를 추가해 moderation/audit를 DB에 영속화했다.
- `apps/api/src/admin/admin.controller.ts`, `apps/api/src/admin/admin.service.ts`
  - admin stats/statistics/reviews/mercenary/team detail/venue detail API를 실제 데이터 기준으로 확장했다.
  - `warn`, `suspend`, `reactivate`가 audit log를 남기고, 시설 삭제는 연결된 match/lesson이 있으면 실패를 명시적으로 반환하도록 바꿨다.
- `apps/web/src/app/admin/dashboard/page.tsx`
  - 대시보드 카드와 운영 큐 카운트를 실데이터 집계로 교체했다.
- `apps/web/src/app/admin/payments/page.tsx`, `apps/web/src/app/admin/reviews/page.tsx`, `apps/web/src/app/admin/mercenary/page.tsx`, `apps/web/src/app/admin/statistics/page.tsx`
  - mock/sample fallback을 제거하고 real data / empty / error contract만 남겼다.
- `apps/web/src/app/admin/teams/[id]/page.tsx`, `apps/web/src/app/admin/venues/[id]/page.tsx`
  - 관리자 상세 화면이 실제 엔티티를 hydrate하도록 바꾸고, admin shell 맥락 안에서 후속 액션을 유지하게 정리했다.
- `apps/api/src/admin/admin.service.spec.ts`
  - admin persistence/statistics/reviews/mercenary/team/venue/payment 회귀를 고정했다.

## Validation Evidence

- `pnpm --filter api test -- admin`
  - Passed: `27 suites / 516 tests`
- `pnpm --filter api build`
  - Passed
- `pnpm --filter web exec tsc --noEmit`
  - Passed
- Targeted admin browser smoke on `http://localhost:3003`
  - `/admin/dashboard` opened with live stats
  - `/admin/users/:id` opened with moderation controls visible
  - `/admin/reviews` and `/admin/payments` rendered inside admin shell without mock fallback
- Targeted moderation persistence API smoke on `http://localhost:8111/api/v1`
  - `warn -> suspend -> reactivate` persisted across refetches
  - final state restored to `active`
- Restart-equivalent moderation persistence smoke on Docker dev API
  - `codex-smoke-ui` 사용자에 대해 `warn -> suspend -> docker compose restart api -> detail refetch -> reactivate`를 실행했다.
  - restart 이후에도 `adminStatus=suspended`, `suspensionReason`, warn/suspend audit entry가 그대로 유지됐고, 마지막에 `active`로 복구했다.

## Residual Follow-up

- admin dashboard smoke spec는 존재하지만, payments/reviews/user moderation까지 포함한 Playwright coverage는 아직 별도 spec으로 고정되지 않았다.
