# Task 42 — Lesson Ticket Purchase And Ownership Closure

Owner: project-director -> backend-dev + frontend-dev
Date drafted: 2026-04-11
Status: Implemented (runtime follow-up)
Priority: P0

## Context

Task 34에서 `/my/lesson-tickets`의 mock fallback을 제거하면서, 레슨 구매 여정의 실제 공백이 더 선명해졌다. 아래 항목은 이 task를 drafted 했을 때의 문제 진술이다.

- `apps/web/src/app/(main)/lessons/[id]/page.tsx`는 존재하지 않는 `/lessons/:id/enroll` mutation을 호출하고 있었다.
- 유료 수강권 선택 시에는 실제 purchase/confirm 경로 대신 “준비 중” 토스트로 중단되고 있었다.
- backend에는 `POST /lessons/plans/:planId/purchase`, `POST /lessons/tickets/:ticketId/confirm`이 이미 있었지만, frontend에서 이 계약을 사용하지 못하고 있었다.
- `GET /lessons/tickets/me` read model은 존재했지만, frontend user surface가 이 계약을 실제 구매 여정과 아직 닫지 못하고 있었다.
- lesson detail API는 `ticketPlans`를 내려주지 않아 `TicketPlanSelector`가 mock plan으로 fallback되고 있었다.
- 그 결과 `/my/lesson-tickets`는 real owned read model이 backend에 있어도 frontend에서 연결되지 못한 채 unsupported shell에 머물러 있었다.

현재 상태는 “티켓 구매가 가능한 것처럼 보이지만 실제 보유/조회 surface가 닫히지 않은” 절반 구현이다. 이 갭을 닫아야 LES-002와 Task 34 follow-up이 의미를 가진다.

## Goal

- 레슨 상세의 fake enroll / fake payment affordance를 제거하고 real purchase contract로 연결한다.
- lesson detail이 real ticket plan 데이터만 렌더하도록 연결한다.
- `/my/lesson-tickets`를 real / empty / error 상태를 구분하는 실데이터 화면으로 전환한다.

## Evidence

- `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- `apps/web/src/app/(main)/payments/checkout/page.tsx`
- `apps/api/src/lessons/lessons.controller.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `docs/scenarios/08-marketplace-and-lessons.md` (`LES-002`)
- `.github/tasks/34-user-surface-honest-data-contracts.md`

## Owned Write Scope

- `apps/api/src/lessons/**`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- `apps/web/src/app/(main)/payments/checkout/page.tsx`
- task 범위 내 관련 테스트와 문서

## Acceptance Criteria

- 레슨 상세는 더 이상 존재하지 않는 `/lessons/:id/enroll` route를 호출하지 않는다.
- 사용자는 선택한 ticket plan 기준으로 real purchase/confirm 경로를 탄다.
- `checkout`은 `source=lesson`을 실제로 처리하고, match-only contract를 lesson source에 강제로 재사용하지 않는다.
- lesson detail은 API가 내려준 실제 ticket plan만 렌더하며, mock plan fallback을 사용자-facing surface에서 제거한다.
- `/my/lesson-tickets`는 결제 완료된 실제 티켓만 렌더한다.
- unpaid draft ticket나 mock placeholder는 active owned ticket처럼 보이지 않는다.
- empty / error / paid ticket state가 시각적으로 구분된다.

## Validation

- `pnpm --filter api test -- lessons.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest
- targeted browser smoke
  - `/lessons/[id]`
  - `/payments/checkout?source=lesson...`
  - `/my/lesson-tickets`

## Out Of Scope

- 강사용 출석 체크 / 수강생 roster 관리
- lesson refund policy 완결
- recurring lesson scheduling 확장
- admin lesson ticket 운영 surface 정리

## Risks

- 현재 schema에는 lesson ticket용 `pending` 상태가 없다. 따라서 owned view에는 `paymentId` 또는 동등한 결제 완료 기준으로 visibility rule을 명시해야 한다.
- free ticket / paid ticket 공통 흐름을 섣불리 합치면 unpaid ticket가 실제 소유 티켓처럼 노출될 수 있다.

## Dependency Notes

- `/my/lesson-tickets` honest shell은 Task 34에서 이미 정리되었다. 이 task는 그 shell을 real ownership surface로 승격하는 작업이다.
- host-owned lesson management는 별도 `Task 43`으로 분리한다.

## Implementation Notes

- backend
  - `GET /lessons/:id`는 active `ticketPlans`와 실제 `upcomingSchedules`를 함께 내려주도록 정리했다.
  - `GET /lessons/tickets/me`는 `paymentId != null` 조건의 paid-only ownership read model로 유지한다.
  - `POST /lessons/plans/:planId/purchase`에 host self-purchase guard를 추가했다.
  - `POST /lessons/tickets/:ticketId/confirm`은 mock Toss mode에서 free ticket을 막지 않되, paid amount가 0보다 큰 경우에만 Toss confirm을 요구한다.
- frontend
  - `lessons/[id]`는 더 이상 fake enroll mutation을 호출하지 않고, 선택한 ticket plan 기준으로 `/payments/checkout?source=lesson...`로 이동한다.
  - 이미 보유한 paid ticket이 있으면 구매 CTA는 `/my/lesson-tickets?ticketId=...`로 우회한다.
  - `TicketPlanSelector`는 mock fallback 없이 실제 active plan만 렌더한다.
  - `LessonCalendar`는 example schedule을 대신 보여주지 않고, 실제 일정이 없으면 honest empty state를 렌더한다.
  - `/my/lesson-tickets`는 paid ticket만 렌더하고, `ticketId` query가 있으면 해당 카드를 상단/강조 표시한다.

## Validation Results

- ✅ `pnpm --filter api test -- lessons.service.spec.ts`
- ✅ `pnpm --filter web exec tsc --noEmit`
- ✅ `pnpm --filter web exec vitest run src/hooks/__tests__/use-api-lessons.test.tsx src/components/lesson/ticket-plan-selector.test.tsx`
- ⚠️ targeted browser smoke
  - blocker 1: latest local recheck 기준 `curl http://localhost:8111/api/v1/health`가 `connection refused`로 끝나 host API가 살아 있지 않다.
  - blocker 2: `docker compose up -d deps api web`를 재시도했지만 `deps` bootstrap이 `exit 127`로 종료됐고, 로그에는 `rsync: not found`가 남았다.
  - blocker 3: compose bootstrap 실패 때문에 `api/web`가 함께 올라오지 못해 `/lessons/[id]`, `/payments/checkout?source=lesson...`, `/my/lesson-tickets` browser smoke를 아직 닫지 못했다.

## Follow-up

- live browser smoke rerun은 current dev runtime을 먼저 안정화한 뒤 다시 수행해야 한다.
- 강사 측 roster / attendance reflection은 `Task 43`에서 닫는다.
