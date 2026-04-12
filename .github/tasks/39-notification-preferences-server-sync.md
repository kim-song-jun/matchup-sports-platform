# Task 39 — Notification Preferences Server Sync

Owner: tech-planner -> frontend-dev + backend-dev
Date drafted: 2026-04-11
Status: Implemented (runtime smoke follow-up)
Priority: P1

## Context

현재 backend에는 `NotificationPreference` 모델, controller/service, web hooks까지 이미 존재한다. 그러나 `/settings/notifications` 페이지는 여전히 device-local state만 토글하고 있으며 “이 기기에만 적용됩니다” 문구를 표시한다.

즉, backend contract와 front UX가 완전히 분리돼 있다. 이 mismatch는 문서, 제품, 테스트 기준선을 동시에 흐리게 만든다.

## Goal

- category-level notification preference를 서버와 동기화한다.
- truly device-local인 항목과 server-synced 항목을 명확히 분리한다.
- 설정 변경이 reload 및 재로그인 후에도 유지되게 만든다.

## Evidence

- `apps/api/prisma/schema.prisma` (`NotificationPreference`)
- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/notifications/dto/notification-preference.dto.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/app/(main)/settings/notifications/page.tsx`
- `docs/scenarios/index.md`
- `.github/tasks/32-web-audit-and-remediation.md`

## Owned Write Scope

- `apps/web/src/app/(main)/settings/notifications/page.tsx`
- `apps/web/src/hooks/use-api.ts` (notification preference 범위에 한정)
- `apps/api/src/notifications/**` if schema/controller adjustments are needed

## Acceptance Criteria

- 매치/팀/채팅/결제 category toggle은 서버 preference를 읽고 저장한다.
- reload, 재로그인, 다른 탭 진입 후에도 같은 category 상태를 본다.
- browser permission, push OS permission, DND처럼 truly device-local한 항목은 별도 섹션/문구로 구분된다.
- 현재 backend schema에 없는 marketing/email/master toggle은 범위를 축소하거나 명시적 local-only로 남긴다. 둘을 혼합해 서버 저장인 것처럼 보이게 하지 않는다.

## Validation

- `pnpm --filter api test -- notifications`
- `pnpm --filter web exec tsc --noEmit`
- targeted browser smoke on `/settings/notifications`

## Out Of Scope

- full marketing preference center
- email delivery system 구축
- native push permission onboarding 개선

## Risks

- 현재 UI의 토글 종류가 backend schema보다 많다. 이번 task는 “정직한 범위 축소”를 허용한다.

## Execution Report

- 2026-04-11 — `/settings/notifications`를 서버 동기화 섹션, device-local 섹션, 미지원 범위 섹션으로 분리했다.
- 2026-04-11 — 서버 저장 대상은 `match/team/chat/payment` 4개 category로 고정했고, 브라우저 권한/DND는 local-only로 남겼다.
- 2026-04-11 — backend는 기존 `GET/PATCH /notifications/preferences` contract를 그대로 재사용했고 코드 변경은 필요하지 않았다.
- changed files:
  - `apps/web/src/app/(main)/settings/notifications/page.tsx`
  - `apps/web/src/app/(main)/settings/page.tsx`
  - `apps/web/src/hooks/use-api.ts`
  - `apps/web/src/app/(main)/settings/notifications/page.test.tsx`
  - `apps/web/src/hooks/__tests__/use-api-notification-preferences.test.tsx`
- validation:
  - `pnpm --filter api test -- notifications.service.spec.ts` ✅ (`27 suites / 516 tests`)
  - `pnpm --filter web exec tsc --noEmit` ✅
  - `pnpm --filter web test` ✅ (`29 files / 270 tests`)
  - targeted browser smoke on `/settings/notifications` ⚠️ attempted but current dev runtime stayed unstable: the stale API process first returned `POST /api/v1/auth/dev-login` `500` (`users.admin_status` column drift), and after API recovery the web restart surfaced missing `@swc/helpers`, so protected-route smoke could not be completed
- residual follow-up:
  - dev runtime을 안정화한 뒤 protected-route browser persistence smoke를 다시 실행해 reload / 재로그인 증거를 추가한다.
