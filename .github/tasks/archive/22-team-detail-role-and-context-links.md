# Task 22 — Team Detail: Role-Based UI + Team-Scoped Sub-Pages

## Context

`/teams/:id` 팀 상세 페이지는 현재 모든 사용자에게 동일한 UI를 보여주고 있고, "최근 경기 전체보기"/"용병모집 전체보기" 링크가 **팀 전용 필터가 아닌 전역 목록 페이지로 이동**한다. 또한 팀 멤버의 역할(owner/manager/member)을 인식하지 못해 팀 설정/수정 권한이 UI에 반영되지 않는다. 페이지 상단의 `mockTrustScore`, `mockBadges`, `mockRecentMatches`, `hasMercenaryPost = true` 등의 하드코딩 상수는 실제 데이터가 있든 없든 동일한 값을 노출하여 사용자 경험을 혼란스럽게 만든다 (A1 피드백).

## Goal

팀 상세 페이지가 **현재 사용자의 역할**과 **팀 컨텍스트**를 인식하여 올바른 액션/정보를 보여주고, 하위 경로로 **팀 전용 경기 기록**과 **팀 전용 용병 모집** 페이지를 신설한다.

## Original Conditions (체크박스)

- [ ] 내 팀인 경우 "팀 가입 신청", "연락하기" 버튼 숨김
- [ ] 팀 역할(owner/manager)인 경우 "팀 정보 수정" 버튼 노출 (member는 숨김)
- [ ] 팀 상세 페이지의 `mockTrustScore`, `mockBadges`, `mockRecentMatches`, `hasMercenaryPost` 상수 제거 → 실제 API 데이터 또는 `EmptyState` 사용
- [ ] "최근 경기 → 전체보기" 링크를 신규 페이지 `/teams/:id/matches`로 연결
- [ ] "용병 모집중 → 전체보기" 링크를 신규 페이지 `/teams/:id/mercenary`로 연결
- [ ] 신규 페이지 `/teams/:id/matches` 생성 — 해당 팀이 host 또는 applicant로 참여한 팀 매칭 목록
- [ ] 신규 페이지 `/teams/:id/mercenary` 생성 — 해당 팀의 용병 모집 글 목록
- [ ] 백엔드: `/team-matches?teamId=` 쿼리 파라미터 지원 (host+applicant 양쪽 포함)
- [ ] 백엔드: `/mercenary?teamId=` 쿼리 파라미터 지원 (이미 있으면 감사만)
- [ ] `useMyTeams()` 응답에 `role` 필드 포함 — 프런트 훅/타입 정규화

## User Scenarios

**S1 — 팀장 대시보드**: owner인 사용자가 `/teams/:id` 진입 → "팀 정보 수정" 버튼 노출, "팀 가입 신청" 미노출. "최근 경기 전체보기" 클릭 → `/teams/:id/matches`로 이동하여 이 팀이 참여한 경기만 표시.

**S2 — 팀 매니저**: manager 사용자가 `/teams/:id` 진입 → "팀 정보 수정" 버튼 노출. 멤버 추방/초대 가능 (기존 기능).

**S3 — 일반 멤버**: member 사용자 → "팀 정보 수정", "팀 가입 신청", "연락하기" 모두 숨김. "팀 나가기"만 노출.

**S4 — 비멤버 로그인**: 다른 팀 사용자가 `/teams/:id` 진입 → "팀 가입 신청", "연락하기" 노출, "수정" 미노출.

**S5 — 데이터 없음**: 팀이 아직 경기를 하지 않은 상태 → "최근 경기" 섹션에 `EmptyState` ("아직 경기 기록이 없어요"), 목 데이터 노출 금지.

## Test Scenarios

**Happy**
- owner가 `/teams/:id` → 수정 버튼 O, 가입 신청 X
- member가 `/teams/:id` → 수정 버튼 X, 가입 신청 X
- `/teams/:id/matches` 접근 → 해당 팀 매칭만 표시 (host + applicant 양쪽)
- `/teams/:id/mercenary` 접근 → 해당 팀 용병 모집만 표시
- backend: `GET /team-matches?teamId=X` → `hostTeamId=X OR applicants.teamId=X` 결과

**Edge**
- 팀에 경기 0건 → EmptyState 표시, 목 데이터 섞이지 않음
- `useMyTeams()` 로딩 중 → 역할 기반 UI는 disabled/skeleton
- 팀 탈퇴 직후 페이지 → 재fetch 후 버튼 갱신

**Error**
- 존재하지 않는 teamId로 `/teams/:id/matches` → 404 페이지
- 비공개 팀 조회 시 권한 체크

**Mock Updates**
- `teams/[id]/page.tsx`의 mock 상수 4개 완전 제거 (Core Principle 4)
- `apps/web/src/test/msw/handlers.ts` — `GET /team-matches` 핸들러에 `teamId` 파라미터 처리 추가
- `apps/api/test/fixtures/teams.ts` — 역할별 fixture 보강 필요시

## Parallel Work Breakdown

**backend-api-dev**
- `apps/api/src/team-matches/dto/team-match-query.dto.ts` — `teamId?: string` 필드 추가
- `apps/api/src/team-matches/team-matches.service.ts` — `findAll()` 에서 `teamId` 필터링 (`hostTeamId OR applications.applicantTeamId`)
- `apps/api/src/teams/teams.service.ts` — `listUserTeams` 응답에 `role` 필드 확인/추가

**backend-data-dev**
- `apps/api/prisma/schema.prisma` — `TeamMatch`에 `@@index([hostTeamId, status, matchDate])` 인덱스 추가 마이그레이션
- `apps/api/src/team-matches/team-matches.service.spec.ts` — `findAll with teamId` unit 테스트
- `apps/api/test/fixtures/team-matches.ts` — teamId 필터링 fixture

**frontend-data-dev**
- `apps/web/src/hooks/use-api.ts` — `useTeamMatches({ teamId?})`, `useMercenaryPosts({ teamId? })` 파라미터 지원, `useMyTeams()` 응답 정규화 (`{id, name, role, ...}`)
- `apps/web/src/types/api.ts` — `TeamMembership` / `MyTeam` 타입 `role` 포함
- `apps/web/src/test/msw/handlers.ts` — `teamId` 쿼리 처리

**frontend-ui-dev (A)**
- `apps/web/src/app/(main)/teams/[id]/page.tsx` — mock 상수 제거, 역할 기반 CTA 렌더, 전체보기 링크 수정
- `apps/web/src/app/(main)/teams/[id]/matches/page.tsx` (신규) — 팀 전용 경기 기록
- `apps/web/src/app/(main)/teams/[id]/mercenary/page.tsx` (신규) — 팀 전용 용병 모집

## Acceptance Criteria

1. `teams/[id]/page.tsx` 내 모든 `mock*` 상수 제거 확인 (`grep -n "mock" apps/web/src/app/\(main\)/teams/\[id\]/page.tsx` 결과 0건)
2. `useMyTeams()` 리턴 타입에 `role: 'owner'|'manager'|'member'` 포함
3. owner/manager/member 각각의 UI가 3가지로 분기 (스냅샷 테스트 또는 RTL 테스트)
4. 신규 2개 페이지가 렌더링되고 `tsc --noEmit` 통과
5. `GET /team-matches?teamId=X` 백엔드 unit 테스트 통과

## Tech Debt Resolved (Core Principle 1, 4)

- `mockTrustScore`, `mockBadges`, `mockRecentMatches`, `hasMercenaryPost = true` 상수 제거
- `myTeams[0].id`로 첫 팀만 쓰는 단일 팀 가정 제거
- 전역 필터 페이지를 "팀 전용"처럼 보이게 하는 잘못된 라우팅 제거

## Security Notes

- `/teams/:id` 수정 버튼은 프론트 가드만으로 부족 → 백엔드 `TeamMembershipService.assertRole('manager')` 기존 가드 유지 확인
- `teamId` 쿼리 파라미터 타입 검증 (UUID) — `@IsUUID()` 데코레이터 필수

## Risks & Dependencies

- `useMyTeams` shape 변경 → 전 앱에서 `myTeams[0]`, `myTeams?.length` 같은 호출 사이트 20+ 영향 (Task 23, 24 공통 블로커)
- **Wave 0 sequential 작업 필요**: `use-api.ts` + `types/api.ts` + MSW handlers 통합 수정을 먼저 단일 에이전트가 처리
- 새 페이지 2개 생성은 LEAF 파일이므로 병렬 가능

## Ambiguity Log

- (해결됨) A1: 목 데이터 의존 금지 — EmptyState 사용
- (해결됨) A4: 신규 페이지 `/teams/:id/matches`, `/teams/:id/mercenary` 생성
