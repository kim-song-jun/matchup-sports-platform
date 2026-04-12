# Task 44 — Lesson Ticket Ownership Read Model

Owner: project-director -> backend-dev / frontend-dev
Date drafted: 2026-04-11
Status: Proposed
Priority: P0

## Context

Task 34에서 `/my/lesson-tickets`의 mock 목록은 제거했지만, 현재는 전용 조회 API가 없어 unsupported shell만 남아 있다. 반면 lesson ticket purchase / payment confirm은 이미 backend에 존재한다. 즉, 돈을 내고 티켓을 산 사용자가 본인 보유 수강권을 확인할 수 없는 상태다.

이 갭은 user trust와 transaction completeness에 직접 닿는다. 결제가 실제로 일어난 뒤 내역 조회가 불가능하면 honest empty가 아니라 incomplete product contract가 된다.

## Goal

- 로그인 사용자가 본인 lesson ticket 목록을 실데이터로 조회할 수 있게 한다.
- `/my/lesson-tickets`를 실제 보유 수강권 화면으로 연결한다.
- active / exhausted / expired / refunded / cancelled 상태를 샘플 없이 명확히 구분한다.

## Evidence

- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- `apps/api/src/lessons/lessons.controller.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `apps/api/prisma/schema.prisma`
- `docs/scenarios/08-marketplace-and-lessons.md`

## Owned Write Scope

- `apps/api/src/lessons/**`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- task 범위 테스트 / 문서

## Acceptance Criteria

- 인증 사용자는 `GET /lessons/tickets/me` 또는 동등한 전용 read API로 본인 티켓만 조회한다.
- 응답에는 최소한 `plan`, `lesson`, 사용량, 결제 금액, 구매일, 만료/시작 정보가 포함된다.
- `/my/lesson-tickets`는 mock/sample 없이 실제 티켓을 렌더한다.
- 티켓이 없을 때는 honest empty state를 보여준다.
- `LES-002`의 “사용자 측 보유 티켓 화면” 검증을 진행할 수 있는 최소 read contract가 생긴다.

## Validation

- `pnpm --filter api test -- lessons.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest
- targeted browser smoke
  - `/my/lesson-tickets`

## Out Of Scope

- 수강권 구매 결제 UX 재설계
- 출석 차감 / 환불 workflow
- 강사 측 수강생 관리 화면

## Risks

- 기존 purchase flow가 `startDate`, `expiresAt`, `usedSessions`를 충분히 채우지 않으면 일부 카드 정보는 “정보 준비 중”으로 보여야 할 수 있다.
- 오래된 seed/runtime 데이터가 sparse relation을 가질 수 있으므로 read payload는 explicit select/include와 null-safe UI가 필요하다.
