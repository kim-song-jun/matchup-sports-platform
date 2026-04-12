# Task 34 — User Surface Honest Data Contracts

Owner: project-director -> frontend-dev
Date drafted: 2026-04-11
Status: Implemented
Priority: P0

## Context

사용자-facing 표면 중 일부는 API가 비거나 실패할 때 dev/mock/sample 데이터를 대신 렌더링한다. 특히 `my/*` 계열과 `venues/[id]`는 “데이터가 없다”와 “샘플 데이터다”가 구분되지 않아 사용자가 실제 상태를 오해할 수 있다.

이 영역은 기능 추가보다 honest contract 정리가 우선이다. API가 준비되지 않았으면 empty/error/explicit sample로 보여야지, 다른 엔티티나 개발용 mock으로 대체되면 안 된다.

## Goal

- 사용자 주요 표면에서 silent mock fallback을 제거한다.
- API 부재/빈 결과/오류 상태를 명확한 UI 계약으로 분리한다.
- 필요 시 sample은 유지하되, sample badge 또는 읽기 전용 문구로 실데이터와 명확히 구분한다.

## Evidence

- `apps/web/src/app/(main)/my/matches/page.tsx`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`
- `.github/tasks/32-web-audit-and-remediation.md`
- `docs/plans/2026-04-10-web-audit-remediation-plan.md`

## Owned Write Scope

- `apps/web/src/app/(main)/my/matches/page.tsx`
- `apps/web/src/app/(main)/my/lessons/page.tsx`
- `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`
- task 범위 내에서 필요한 route-local helper/component

## Parallel Safety Rule

- `apps/web/src/hooks/use-api.ts` 전면 수정은 피한다.
- 불가피한 shared hook 변경은 additive한 최소 범위만 허용한다.

## Acceptance Criteria

- `my/matches`의 created/participated 탭에서 dev-only mock 배열이 실데이터처럼 렌더되지 않는다.
- `my/lessons`, `my/lesson-tickets`는 API 결과가 비면 honest empty state를 보여준다.
- `venues/[id]`는 특정 venue ID에서 API가 없을 때 다른 mock venue를 렌더하지 않는다.
- sample/demo 데이터를 유지해야 한다면 `sample` 또는 동등한 명시가 있고 action은 읽기 전용으로 제한된다.
- error, empty, sample, real data가 시각적으로 구분된다.

## Validation

- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest
- targeted browser smoke
  - `/my/matches`
  - `/my/lessons`
  - `/my/lesson-tickets`
  - `/venues/[id]`

## Out Of Scope

- 새 backend endpoint 추가
- venue 도메인 기능 확장
- scenario/status 문서 write-back

## Risks

- 일부 surface가 실제 API 부재를 드러내며 empty state가 늘어날 수 있다. 이것은 의도된 변화다.

## Implementation Notes

- `my/matches`
  - 참가 탭은 `/users/me/matches` 기반 실데이터만 표시하도록 바꾸고, 현재 API가 owner-scoped가 아니라는 점을 배너로 명시했다.
  - `내가 만든 매치` 탭은 host 전용 목록/관리 API가 없으므로 unsupported 상태로 낮췄다.
- `my/lessons`
  - 공개 목록 API의 실제 status 계약(`open|closed|cancelled|completed`)에 맞춰 read-only 목록으로 정리했다.
  - 존재하지 않는 취소/관리 CTA를 제거하고, `useMe()` 실패 시 false empty 대신 explicit error state를 보여준다.
- `my/lesson-tickets`
  - 전면 mock 목록과 정렬/만료 배너를 제거하고, 전용 조회 API 미연결 상태를 warning banner + empty shell로 명시했다.
- `venues/[id]`
  - 시설 사진 부재 시 예시 이미지 배너와 상시 `샘플` 배지를 노출한다.
  - 리뷰 total count와 detail list를 분리해 summary-only 상태를 명시한다.
  - `!venue` 분기에서 `error`와 `not found`를 구분하고, 공유 버튼은 실제 공유/링크 복사 동작을 연결했다.

## Validation Results

- ✅ `pnpm --filter web exec tsc --noEmit`
- ✅ `pnpm --filter web exec vitest run src/hooks/__tests__/use-api-lessons.test.tsx src/components/ui/__tests__/trust-signal-banner.test.tsx`
- ✅ targeted browser smoke
  - `/my/matches`
  - `/my/lessons`
  - `/my/lesson-tickets`
- ✅ `/venues/[id]` targeted browser smoke rerun (`2026-04-11`)
  - seeded venue route `/venues/22c1f9d2-ec1f-4a3c-a1d6-58d30a399a76`
  - `docker compose up -d api web` 이후 route `200`
  - headless browser rerun에서 error/not-found copy 없이 page shell이 열리는 것 확인

## Follow-up Routing

- hosted match real-data closure와 host lifecycle UX 복원은 기존 `Task 13 — match lifecycle completion`이 계속 담당한다.
- lesson ticket 실구매/보유 티켓 surface 연결은 `Task 42 — Lesson Ticket Purchase And Ownership Closure`로 분리한다.
- host-owned lesson list 및 관리 action 복원은 `Task 43 — Lesson Host Management Contracts`로 분리한다.
- scenario/status write-back은 후속 구현 반영 후 `Task 40 — Scenario And Doc Truth Sync` 범위에서 다시 정리한다.

## Follow-up Ledger

- Existing task reuse
  - `Task 13 — match lifecycle completion`
    - `내가 만든 매치` 탭을 실데이터 host 관리 화면으로 복구하려면 host-scoped 목록/상태 전환 계약까지 포함한 기존 task를 이어서 닫는 편이 맞다.
  - `Task 40 — scenario and doc truth sync`
    - Task 34 후속 구현이 끝난 뒤 `docs/scenarios/08-marketplace-and-lessons.md`와 scenario index의 runtime evidence를 다시 동기화한다.
- New task proposals
  - `Task 42 — dev web bootstrap and venue smoke closure`
    - `/venues/[id]` 재검증을 막은 Next dev `.next` / loader ENOENT 환경 이슈를 재현·고정하고 venue smoke를 닫는다.
  - `Task 43 — lesson host management contracts`
    - `/my/lessons`를 read-only honest shell에서 실제 host 관리 화면으로 승격하기 위한 host-owned query / edit / cancel capability를 구현한다.
  - `Task 44 — lesson ticket ownership read model`
    - `/my/lesson-tickets`를 unsupported shell에서 실제 보유 수강권 목록으로 연결한다.

## Follow-up Ledger

- Mandatory closure
  - `Task 42 — Dev Web Bootstrap And Venue Smoke Closure`
    - Task 34의 유일한 미종결 항목이다. dev `web` bootstrap을 안정화하고 `/venues/[id]` smoke를 런타임 기준으로 다시 닫는다.
- Existing backlog reused
  - `Task 13 — Match lifecycle completion`
    - `내가 만든 매치` 탭을 다시 실데이터로 올리려면 host-scoped 목록/관리 contract가 필요하다. Task 34에서는 unsupported로 낮췄고, 실제 복구는 Task 13이 맡는다.
  - `Task 40 — Scenario and doc truth sync`
    - 이번 honest-data 정리 결과를 반영한 문서 truth sync는 이미 완료됐다. 후속 구현이 끝나면 해당 문서군을 다시 런타임 기준으로 재검증한다.
- New follow-up features
  - `Task 43 — Lesson Host Management Real Contracts`
    - `my/lessons`를 public open list filter 기반 read-only 화면에서 host 전용 관리 surface로 승격한다.
  - `Task 44 — Lesson Ticket Ownership Read Model`
    - `/my/lesson-tickets`를 unsupported shell에서 실제 구매 티켓 조회 화면으로 연결한다.
