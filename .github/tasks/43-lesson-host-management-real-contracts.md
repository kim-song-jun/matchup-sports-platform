# Task 43 — Lesson Host Management Real Contracts

Owner: project-director -> backend-dev / frontend-dev
Date drafted: 2026-04-11
Status: Proposed
Priority: P1

## Context

Task 34는 `/my/lessons`에서 false affordance를 제거했다. 현재 화면은 public lesson list를 host 기준으로 다시 거르는 read-only shell이며, 수정/취소/수강생 관리 CTA는 의도적으로 제거됐다. 하지만 제품 관점에서 강사는 여전히 본인 레슨을 관리해야 한다.

현재 backend `lessons` 도메인은 공개 목록/상세, 생성, 티켓 구매/결제 확인까지만 제공한다. host 전용 목록, 상태 전환, 수정 contract가 없어서 frontend가 honest하게 downgrade된 상태다.

## Goal

- 강사가 본인 레슨을 host-scoped 실데이터로 조회한다.
- 수정/상태 전환은 실제 backend contract와 정확히 맞춘다.
- `/my/lessons`가 public open filter shell이 아니라 host 관리 surface로 동작한다.

## Evidence

- `.github/tasks/34-user-surface-honest-data-contracts.md`
- `apps/api/src/lessons/lessons.controller.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `docs/scenarios/08-marketplace-and-lessons.md`

## Owned Write Scope

- `apps/api/src/lessons/**`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- 필요 시 `apps/web/src/app/(main)/lessons/[id]/edit/page.tsx`
- 필요 시 `apps/web/src/hooks/use-api.ts`
- 관련 테스트/시나리오 문서

## Acceptance Criteria

- host 전용 lesson list/read endpoint가 존재하고, public lesson list에 의존한 client-side 필터가 제거된다.
- `/my/lessons`는 `open|closed|cancelled|completed` 상태를 host 기준으로 정확히 보여준다.
- 화면에 노출한 수정/상태 전환 CTA는 실제 저장 contract와 1:1로 연결된다.
- 실패 시 optimistic success나 mock fallback 없이 explicit error를 보여준다.

## Validation

- `pnpm --filter api test -- lessons`
- `pnpm --filter api build`
- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest / targeted browser smoke

## Out Of Scope

- 출석/수강생 평가 기능 확장
- recurring lesson product redesign
- 관리자 lesson moderation

## Risks

- host 관리 contract를 추가하면 public lesson enum/status와 host 관리 상태 표현이 drift할 수 있다.
- lesson edit/create form payload가 DTO와 어긋나면 다시 false affordance가 생긴다.
