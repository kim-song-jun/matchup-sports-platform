# Task 21 — Auth Gate & Non-Login UX Consistency

## Context

QA 수동 검수 중 비로그인 상태에서 인증이 필요한 액션/UI가 일관되게 가드되지 않는 이슈가 다수 발견되었다. 일부는 핸들러 자체가 누락되었고, 일부는 로그인 페이지 리다이렉트가 빠져 있으며, 사이드바 메뉴에는 비로그인 상태에서도 `/chat`, `/notifications` 메뉴가 노출된다.

## Goal

비로그인 사용자가 인증 필요 액션에 접근했을 때 **일관된 로그인 유도 플로우**를 제공하고, 로그인 전에는 인증 전용 메뉴·배지를 완전히 숨긴다.

## Original Conditions (체크박스)

- [ ] `/teams/:id` "연락하기" 버튼 클릭 시 비로그인이면 `/login?redirect=/teams/:id`로 이동, 로그인 상태이면 contactInfo 모달/tel:mailto: 링크
- [ ] `/mercenary/:id` "신청" 버튼 클릭 시 비로그인이면 `/login?redirect=/mercenary/:id`로 **즉시 이동** (토스트만 띄우고 멈추지 않음)
- [ ] `/team-matches/:id` "모집글 수정" 버튼: 비로그인 + `isHost=false` 상태에서 절대 노출 금지 (명시적 null 체크)
- [ ] 사이드바(`components/layout/sidebar.tsx`) — 비로그인 시 `/chat`, `/notifications` 메뉴 항목 자체를 렌더링하지 않음 (배지뿐 아니라 메뉴도 숨김)
- [ ] `useChatUnreadTotal`, `useNotificationsUnread` 훅은 `enabled: isAuthenticated`로 비로그인 네트워크 호출 차단 (이미 되어 있으면 감사만)
- [ ] 감사: `useRequireAuth()` 누락된 인증 필요 페이지 전수 조사 (`my/*`, `teams/new`, `team-matches/new`, `mercenary/new`, `profile` 등)

## User Scenarios

**S1 — 비로그인 용병 신청**: 비로그인 사용자가 `/mercenary/:id` 진입 → "신청하기" 클릭 → 즉시 `/login?redirect=/mercenary/:id`로 이동 → 로그인 성공 시 원위치 복귀.

**S2 — 비로그인 팀 연락**: 비로그인 사용자가 `/teams/:id`에서 "연락하기" 클릭 → `/login?redirect=/teams/:id`로 이동. 로그인 후 contactInfo가 있으면 모달/링크 노출, 없으면 "연락처 미등록" disabled 상태.

**S3 — 비로그인 사이드바**: 비로그인 상태로 앱 진입 → 사이드바에 `/chat`, `/notifications` 메뉴가 아예 표시되지 않음. 로그인 후에만 노출되며 이때 배지도 함께 활성.

**S4 — 비로그인 팀 매칭 상세**: 비로그인 사용자가 `/team-matches/:id` 진입 → "모집글 수정", "경기 신청", "신청 취소" 어떤 CTA도 노출되지 않고 "로그인 후 이용" 안내만 표시.

## Test Scenarios

**Happy**
- 비로그인 + 용병 신청 → `/login?redirect=...` 리다이렉트 검증 (Playwright)
- 로그인 후 `/login?redirect=...` → redirect 쿼리대로 원위치 이동
- 로그인 상태 사이드바에 `/chat`, `/notifications` 메뉴 + 배지 노출

**Edge**
- 사이드바에서 로그아웃 직후 메뉴가 즉시 사라지는지 (reactive)
- `/team-matches/:id`에서 `match.hostUserId === undefined` 레거시 데이터 처리

**Error**
- 로그인 페이지 redirect 파라미터가 외부 URL일 때 거부 (open redirect 방지)

**Mock Updates**
- `apps/web/src/test/msw/handlers.ts` — 필요한 엔드포인트 변경 없음 (프론트 가드만 수정)

## Parallel Work Breakdown

**frontend-ui-dev A (비로그인 CTA + 사이드바)**
- `apps/web/src/app/(main)/teams/[id]/page.tsx` — 연락하기 핸들러 수정
- `apps/web/src/app/(main)/mercenary/page.tsx` + `[id]/page.tsx` — 신청 핸들러 로그인 리다이렉트
- `apps/web/src/app/(main)/team-matches/[id]/page.tsx` — 수정 버튼 null 체크 강화 (**Task 23과 동일 파일 — sequencing 주의**)
- `apps/web/src/components/layout/sidebar.tsx` — 비로그인 메뉴 숨김

**frontend-data-dev**
- `apps/web/src/hooks/use-api.ts` — `useChatUnreadTotal`, `useNotificationsUnread`, 기타 chat/notification 훅의 `enabled` 플래그 감사
- 필요 시 `useRequireAuthRedirect(path)` 헬퍼 추가 (표준화)

**infra-security-dev**
- `/login` 페이지의 `redirect` 쿼리 검증 — 상대 경로만 허용

## Acceptance Criteria

1. 비로그인 상태로 어떤 인증 필요 CTA를 클릭해도 "토스트만 뜨고 멈춤" 상황이 없음
2. 비로그인 사이드바에 `/chat`, `/notifications` 메뉴가 **DOM에 존재하지 않음**
3. 비로그인 `/team-matches/:id`에서 "모집글 수정" 버튼이 **DOM에 존재하지 않음**
4. `pnpm test` (web) + `pnpm test` (api) + `pnpm --filter web exec tsc --noEmit` 통과

## Tech Debt Resolved (Core Principle 1)

- 비로그인 가드의 일관성 부재 (일부는 토스트, 일부는 리다이렉트, 일부는 버튼 노출)
- 사이드바가 `isAuthenticated` 조건 없이 링크 렌더

## Security Notes

- `/login?redirect=...`의 redirect 파라미터는 **상대 경로 `/`로 시작**하는 값만 허용 (open redirect 방지)
- `useChatUnreadTotal` 등 토큰 필요 API는 비로그인 시 호출되지 않아야 함 (401 누수 방지)

## Risks & Dependencies

- Task 23과 `team-matches/[id]/page.tsx` 파일 공유 → Task 23 먼저 착수 후 Task 21의 수정 버튼 가드 부분은 같은 PR에 포함
- Task 21의 사이드바 변경이 E2E 테스트의 기대 DOM 구조에 영향 가능 → `e2e/tests/` 전수 검증

## Ambiguity Log

- (해결됨) A3: 메뉴·배지 모두 숨김 결정
- (해결됨) A6: admin 가드는 false positive — 이 태스크에서 제외
