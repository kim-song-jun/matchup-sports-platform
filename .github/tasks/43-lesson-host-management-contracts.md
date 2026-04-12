# Task 43 — Lesson Host Management Contracts

Owner: project-director -> backend-dev + frontend-dev
Date drafted: 2026-04-11
Status: Proposed
Priority: P1

## Context

Task 34에서 `/my/lessons`는 public lesson list를 억지로 재사용하던 구조를 걷어내고, “공개 중인 내 강좌만 보이는 제한된 읽기 전용 surface”로 낮췄다. 이 조정은 honest했지만, 동시에 실제 남은 제품 갭을 드러냈다.

- host-owned lesson을 status 전체 기준으로 조회하는 전용 API가 없다.
- host가 자신의 lesson을 수정/마감/취소하는 저장 경로가 없다.
- `/my/lessons`에 관리 CTA를 다시 열려면, public `GET /lessons`와 분리된 host contract가 먼저 필요하다.

즉, Task 34는 false affordance를 제거했고, Task 43은 그 자리에 실제 host capability를 채우는 작업이다.

## Goal

- host-owned lesson list를 public browse contract와 분리한다.
- host가 자신의 lesson을 수정하고 상태를 바꾸는 실제 저장 경로를 추가한다.
- `/my/lessons`를 open-only read shell에서 real management surface로 승격한다.

## Evidence

- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/edit/page.tsx`
- `apps/api/src/lessons/lessons.controller.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `docs/scenarios/08-marketplace-and-lessons.md` (`LES-001`, `LES-002`)
- `.github/tasks/34-user-surface-honest-data-contracts.md`

## Owned Write Scope

- `apps/api/src/lessons/**`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/edit/page.tsx`
- 필요한 테스트와 task/scenario 문서

## Acceptance Criteria

- host는 자신의 lesson을 public `status=open` 제약 없이 조회할 수 있다.
- host-only update/status route는 권한과 상태 전이 규칙을 강제한다.
- `/my/lessons`는 open / closed / cancelled / completed를 구분해 보여준다.
- 실제 저장 경로가 준비된 action만 CTA로 노출한다.
- 저장 실패 시 성공처럼 보이는 optimistic lie가 남지 않는다.

## Validation

- `pnpm --filter api test -- lessons.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest
- targeted browser smoke
  - `/my/lessons`
  - `/lessons/[id]/edit`

## Out Of Scope

- coach calendar / attendance 운영 완결
- lesson ticket refund / dispute
- admin lesson moderation

## Risks

- public browse contract와 host management contract를 섞으면 다시 false empty / false capability narrowing이 생길 수 있다.
- lesson status enum을 화면별로 다르게 해석하면 Task 34에서 정리한 honest-data 계약이 다시 무너질 수 있다.

## Dependency Notes

- end-user ticket ownership flow는 `Task 42`를 선행하는 편이 안전하다.
- match host lifecycle과는 별개로, lesson host contract는 별도 API/read model로 유지한다.
