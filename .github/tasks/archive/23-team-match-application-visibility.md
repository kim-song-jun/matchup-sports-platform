# Task 23 — Team Match Application Visibility + Contract Fix

## Context

팀 매칭 신청/승인 플로우에서 두 가지 큰 문제가 관찰된다:

1. **가시성 부재**: 호스트 팀은 자기 모집글에 들어온 신청 목록을 볼 UI가 없고, 신청한 팀은 자기 신청 상태를 추적할 수 없다.
2. **Critical Contract Bug** (tech-planner 발견): `apps/web/src/hooks/use-api.ts` L1215-1241의 `useApproveTeamMatchApplication`/`useRejectTeamMatchApplication`은 `PATCH /team-matches/:id/applications/:appId` with `{ action: 'approve' }` body로 호출하지만, 백엔드 컨트롤러는 `PATCH :id/applications/:appId/approve` 및 `/reject` 분리된 경로를 제공한다. 현재 **승인/거절 기능이 동작하지 않을 가능성이 높다**.

추가로 `/team-matches/:id` 상세 페이지에서 호스트 팀 카드가 링크가 아닌 순수 텍스트로 렌더링되어 팀 상세로 이동할 수 없다.

## Goal

팀 매칭 신청 플로우의 가시성을 양방향으로 복구하고, 승인/거절 REST 계약을 백엔드와 일치시킨다.

## Original Conditions (체크박스)

- [ ] `use-api.ts` approve/reject 훅이 올바른 경로 `/team-matches/:id/applications/:appId/approve` 및 `/reject` 호출 (body 없음)
- [ ] `msw/handlers.ts` — 동일 경로로 모킹 수정 (기존 `{action}` 핸들러 제거)
- [ ] `/team-matches/:id` 호스트 뷰: `ApplicationsSection` 컴포넌트가 호스트 멤버(owner/manager)에게 렌더링됨 — 신청 목록 + 승인/거절 버튼
- [ ] 신청자 뷰: 신규 페이지 또는 `/profile` 섹션에서 "내가 신청한 팀 매칭" 목록 조회 (`GET /team-matches/me/applications`)
- [ ] `/team-matches/:id` 상세의 호스트 팀 카드 → `/teams/:hostTeamId` 링크로 연결
- [ ] `isHost` 로직을 `myTeams.some(t => t.id === match.hostTeamId && ['owner','manager'].includes(t.role))` 로 강화 (null 안전)

## User Scenarios

**S1 — 호스트 매니저 승인 플로우**: manager가 `/team-matches/:id` 진입 → 하단 "신청한 팀" 패널에 3개 팀 노출 → "승인" 클릭 → API 성공 (현재 실패) → 상태 `scheduled` 전환 → 토스트.

**S2 — 신청자 상태 추적**: 신청을 보낸 팀의 manager가 `/profile` 또는 `/my/team-match-applications` 진입 → 자신이 보낸 신청 목록 + 상태(pending/approved/rejected) 확인.

**S3 — 호스트 팀 상세 점프**: 아무 사용자가 `/team-matches/:id` 진입 → 호스트 팀 카드 클릭 → `/teams/:hostTeamId` 이동.

## Test Scenarios

**Happy**
- 호스트 manager가 승인 → 200 응답, 신청 상태 `approved`, 매칭 상태 `scheduled`
- `GET /team-matches/me/applications` 인증 상태에서 본인 신청 반환

**Edge**
- `ApplicationsSection`에 신청 0건 → `EmptyState`
- 호스트가 아닌 사용자가 승인 버튼을 직접 호출 시도 → 백엔드 403
- `match.hostTeam` 이 null인 레거시 매칭 → isHost=false 안전 처리

**Error**
- 이미 승인된 신청을 재승인 → 409 conflict 토스트
- 계약 수정 전 테스트가 실패해야 함 (MSW 경로 미일치로)

**Mock Updates**
- `apps/web/src/test/msw/handlers.ts` — `PATCH /team-matches/:id/applications/:appId/approve`, `/reject` 2개 핸들러 신규 등록 + 기존 단일 PATCH 제거
- 기존 테스트 (`use-api.test.ts` 등)에서 approve/reject 호출 부분 업데이트

## Parallel Work Breakdown

**[Wave 1 Sequential] frontend-data-dev (블로커)**
- `apps/web/src/hooks/use-api.ts` — approve/reject 경로 수정, `useMyTeamMatchApplications()` 훅 신규 (이미 있으면 감사)
- `apps/web/src/types/api.ts` — `TeamMatchApplication`, `MyTeam` 타입 정규화
- `apps/web/src/test/msw/handlers.ts` — approve/reject 핸들러 분리

**[Wave 2 Parallel] backend-api-dev**
- `apps/api/src/team-matches/team-matches.controller.ts` — 기존 approve/reject 엔드포인트 확인, `GET /team-matches/me/applications` 존재 확인 (없으면 추가)
- `apps/api/src/team-matches/team-matches.service.ts` — `listMyApplications(userId)` 서비스 (이미 Phase 1-5에서 추가됐다면 감사)

**[Wave 2 Parallel] frontend-ui-dev**
- `apps/web/src/app/(main)/team-matches/[id]/page.tsx` — `isHost` 강화, `ApplicationsSection` 렌더 조건 점검, 호스트 팀 카드 Link 래핑
- `apps/web/src/app/(main)/my/team-match-applications/page.tsx` (신규) — 내 신청 목록
- `apps/web/src/components/team-matches/applications-section.tsx` — 이미 존재 시 승인/거절 버튼 훅 연결 검증

## Acceptance Criteria

1. 백엔드 컨트롤러와 프론트엔드 훅의 approve/reject 경로 문자열 일치 (`grep -r "applications.*approve"` 수동 확인)
2. 호스트 매니저 로그인 상태로 `/team-matches/:id` 진입 시 `ApplicationsSection` DOM 렌더
3. "내 신청" 페이지에서 본인 신청 목록 1건 이상 표시 (fixture 기반 E2E)
4. 호스트 팀 카드 클릭 시 `/teams/:id` 라우팅
5. `pnpm test` (web + api) 통과, `tsc --noEmit` 통과

## Tech Debt Resolved (Core Principle 1)

- approve/reject REST 계약 불일치 (조용히 실패 중이었을 가능성)
- `isHost` 로직의 null 안전성 결여
- 신청 가시성 반쪽 구현 (백엔드만 있고 프론트 미연결)

## Security Notes

- approve/reject는 백엔드에서 `assertRole(teamId, userId, 'manager')` 필수 검증
- `GET /team-matches/me/applications`는 `@CurrentUser()` 기반, 타 사용자 데이터 노출 금지
- `isHost` 프론트 가드는 UI 힌트일 뿐, 권한은 백엔드에서 재검증

## Risks & Dependencies

- **Wave 1 (use-api.ts + msw + types)는 Task 22, 24의 블로커** → 가장 먼저 단일 에이전트가 처리
- MSW 경로 수정 후 기존 테스트가 붉게 나올 수 있음 — fix와 동시 커밋

## Ambiguity Log

- 내 신청 페이지 위치: `/profile` 내 섹션 vs 독립 페이지 `/my/team-match-applications` → 독립 페이지 + `/profile`에서 링크
