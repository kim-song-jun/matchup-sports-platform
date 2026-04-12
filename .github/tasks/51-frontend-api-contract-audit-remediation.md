# Task 51 — Frontend API Contract Audit Remediation

Owner: project-director + tech-planner -> frontend-dev + docs-writer
Date drafted: 2026-04-11
Status: Implemented
Priority: P0

## Context

`docs/api/**`는 Task 49에서 frontend integration의 canonical contract로 정리됐다. 하지만 현재 문서가 이미 일부 known drift를 경고하고 있고, 실제 `apps/web/src/hooks/use-api.ts` / `apps/web/src/types/api.ts` / 소비 화면에도 그 drift가 남아 있다.

문서를 기준으로 한 검수 요청을 단순 보고서로 끝내면, 프론트 훅이 존재하지 않는 endpoint를 호출하거나 잘못된 response shape를 가정하는 문제가 계속 남는다. 이번 작업은 문서를 기준으로 frontend API layer가 실제 backend contract를 따르도록 정리하는 후속 remediation이다.

## Goal

- `docs/api/**` 기준으로 frontend hook/type/usage를 점검하고 실제 drift를 정정한다.
- 잘못된 method/path/body, 누락된 DTO 필수 필드, 잘못된 response parsing을 줄인다.
- 관련 테스트와 문서를 같이 갱신해 다시 drift가 생겨도 빨리 잡히게 한다.

## Scope

- 포함:
  - `apps/web/src/hooks/use-api.ts`
  - `apps/web/src/types/api.ts`
  - 직접 소비하는 최소 페이지/컴포넌트
  - 관련 frontend hook tests
  - `docs/api/**` drift note sync
- 제외:
  - backend API redesign
  - unrelated UI polish
  - broad E2E expansion

## Confirmed Audit Findings

### Chat

- `useMarkChatRead`
  - frontend: `POST /chat/rooms/:id/read` + empty body
  - backend/docs: `PATCH /chat/rooms/:id/read` + `{ messageId }`
- `useChatMessages`
  - frontend: `ChatMessage[]` 직접 파싱
  - backend/docs: `{ data, nextCursor, hasMore }`
- `useCreateChatRoom`
  - frontend hook input에서 `type` 누락
  - backend DTO는 `type` 필수, `teamId`는 비계약 필드

### Team Matches

- `useRespondTeamMatchApplication`
  - frontend: `PATCH /team-matches/:id/applications/:appId` + `{ action }`
  - backend/docs: `/approve`, `/reject` 분리 route
- `useTeamMatchRefereeSchedule`
  - frontend: 배열 응답 가정
  - backend/docs: `{ hasReferee, quarterCount, schedule }`
- `CreateTeamMatchInput`
  - frontend type에서 `hostTeamId` 누락
  - backend DTO는 필수
- `ApplyTeamMatchInput`
  - `teamId` / `applicantTeamId` 공존
  - backend는 `applicantTeamId`만 사용

## Acceptance Criteria

1. 프론트 훅이 존재하지 않는 endpoint/method를 호출하지 않는다.
2. DTO 필수 필드가 frontend input type에서 누락되지 않는다.
3. cursor object 응답을 배열로 오해하는 훅이 남지 않는다.
4. 이번 범위의 known drift 문구는 코드 상태와 모순되지 않는다.
5. 수정된 surface에 targeted test 또는 typecheck 근거가 남는다.

## Validation

- `pnpm --filter web test -- src/hooks/__tests__/use-api-matches.test.tsx`
- `pnpm --filter web test -- src/hooks/__tests__/use-api-chat.test.tsx`
- `pnpm --filter web exec tsc --noEmit`

## Execution Notes

- backend contract는 바꾸지 않고 frontend를 contract에 맞춘다.
- weakly typed/raw-body endpoint는 frontend type을 더 엄격히 하는 방향을 우선한다.
- 문서가 이미 경고하던 drift는 해결 후 `Known Drift`에서 제거하거나 현재 상태로 갱신한다.

## Execution Report

- 2026-04-11 — `useChatMessages`를 cursor page object 기준으로 정렬하고, `useMarkChatRead`를 `PATCH + { messageId }` 계약으로 수정했다.
- 2026-04-11 — `CreateChatRoomInput`, `CreateTeamMatchInput`, `ApplyTeamMatchInput`, `TeamMatchRefereeSchedule`를 backend DTO/response shape와 맞췄다.
- 2026-04-11 — chat room embed와 team-match detail/new page를 새 hook contract에 맞게 보정했다.
- 2026-04-11 — chat read sync failure는 one-shot info toast + rollback으로 보완했고, team-match apply modal의 기본 선택 상태와 심판 배정표 quarter label도 UX 기준으로 정리했다.
- 2026-04-11 — `use-api-matches` 테스트를 확대하고 `use-api-chat.test.tsx`를 추가해 route/method/payload/response parsing을 고정했다.
- 2026-04-11 — `docs/api/README.md`, `docs/api/domains/chat.md`, `docs/api/domains/team-matches.md`, `docs/api/pagination-filtering-and-sorting.md`의 stale drift 문구를 현재 코드 상태에 맞게 갱신했다.
- changed files:
  - `apps/web/src/hooks/use-api.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/app/(main)/chat/[id]/chat-room-embed.tsx`
  - `apps/web/src/app/(main)/team-matches/[id]/page.tsx`
  - `apps/web/src/app/(main)/team-matches/new/page.tsx`
  - `apps/web/src/hooks/__tests__/use-api-matches.test.tsx`
  - `apps/web/src/hooks/__tests__/use-api-chat.test.tsx`
  - `.github/tasks/51-frontend-api-contract-audit-remediation.md`
- validation:
  - `pnpm --filter web test -- src/hooks/__tests__/use-api-matches.test.tsx src/hooks/__tests__/use-api-chat.test.tsx` ✅ (`11/11`)
  - `pnpm --filter web exec tsc --noEmit` ✅
  - backend contract spot-check by backend-dev: `pnpm --filter api test -- chat.service.spec.ts team-matches.service.spec.ts` ✅ (`28 suites / 542 tests`)
- residual follow-up:
  - broad browser smoke/E2E까지는 이번 범위 밖이라, chat unread UX와 team-match approval happy-path의 full browser evidence는 후속 QA batch에서 확장 가능하다.
