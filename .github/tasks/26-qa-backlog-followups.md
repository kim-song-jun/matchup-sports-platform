# Task 26 — QA Backlog & Follow-ups (Task 21-25 파이프라인 잔여)

## Context

Task 21-25 + Fix Wave 파이프라인 완료 후 스코프 밖으로 판정된 이슈 목록. 다음 태스크 사이클의 후보 목록으로 관리한다.

우선순위: **Critical > Warning > Suggestion**

## Truth Sync Note (2026-04-11)

- `C1`은 현재 코드 기준 stale이다. `/mercenary/[id]/page.tsx`는 이미 존재하며, 관련 follow-up은 “detail page missing”이 아니라 task 36의 lifecycle completion으로 옮긴다.
- 이 문서는 historical backlog trace를 유지한다. 해결되었거나 stale 판정된 항목은 삭제하지 않고 상태를 명시한다.

---

## UX Critical (C-tier)

### C1 — `/mercenary/[id]` 상세 페이지 미존재 (Stale / superseded)

- **원 관찰**: 이전 라운드에서는 `apps/web/src/app/(main)/mercenary/[id]/`에 `page.tsx`가 없다고 기록했다.
- **현재 상태**: `apps/web/src/app/(main)/mercenary/[id]/page.tsx`가 존재한다. 이 이슈는 “detail route missing” 기준으로는 닫혔다.
- **대체 follow-up**: 용병 도메인의 남은 갭은 task 36 `Mercenary Lifecycle Completion`에서 추적한다.
- **우선순위**: Closed as stale

### C2 — 팀 매칭 모집글 작성 종목 2종목 하드코딩 (Resolved)

- **원 관찰**: `sportOptions`가 `soccer`/`futsal`만 포함한다고 기록했다.
- **현재 상태**: `apps/web/src/app/(main)/team-matches/new/page.tsx`는 `Object.entries(sportLabel)` 기반으로 전체 서비스 지원 종목을 노출한다.
- **우선순위**: Closed as resolved

### C3 — `/my/team-matches/page.tsx` mock 데이터 잔존 (Resolved)

- **원 관찰**: hosted/applied 탭이 mock 상수에 의존한다고 기록했다.
- **현재 상태**: `useTeamMatches()`, `useMyTeams()`, `useMyTeamMatchApplications()`를 조합해 실제 API 기반 목록을 만든다.
- **우선순위**: Closed as resolved

### C4 — `POST /teams/:id/apply` 백엔드 미구현 (Resolved)

- **원 관찰**: 팀 상세 CTA가 호출할 API가 없다고 기록했다.
- **현재 상태**: `apps/api/src/teams/teams.controller.ts`에 `@Post(':id/apply')`가 존재하고, 프론트 팀 상세 CTA도 해당 엔드포인트를 호출한다.
- **우선순위**: Closed as resolved

---

## UX Warning (W-tier)

### W1 — `/mercenary` 종목 필터 2종목 하드코딩 (Resolved)

- **원 관찰**: `soccer`/`futsal`만 있어 다른 종목 탐색이 막힌다고 기록했다.
- **현재 상태**: `apps/web/src/app/(main)/mercenary/page.tsx`는 `sportLabel` 전체를 필터에 사용한다.
- **우선순위**: Closed as resolved

### W2 — 팀 멤버 관리 버튼 권한 클라이언트 가드 누락

- **증상**: `/teams/:id/members` 페이지에서 member 역할 사용자에게도 멤버 추방/역할 변경 버튼이 표시될 수 있음. 백엔드에서 최종 차단하나, 클라이언트 선제 가드 없어 UX 혼란.
- **수정**: `isHost && ['owner','manager'].includes(myRole)` 조건으로 버튼 조건부 렌더링.
- **우선순위**: Warning

### W3 — 도착 인증 버튼 권한 가드 누락

- **증상**: `/team-matches/:id` 상세 페이지의 "도착 인증" 버튼이 호스트 팀 멤버가 아닌 사용자에게도 노출될 수 있음.
- **수정**: `isHost || isApplicant` + 역할(`owner`/`manager`) 조건 추가.
- **우선순위**: Warning

### W4 — 모집글 작성 후 상세 페이지 redirect 누락

- **증상**: `/team-matches/new` 제출 성공 후 `/team-matches` 목록으로 이동. 신규 생성된 매칭 상세(`/team-matches/:newId`)로 이동해야 UX 일관성 유지.
- **우선순위**: Warning

### W5 — 프로필 중복 CTA

- **증상**: `/profile` 페이지에 "매칭 찾기" CTA와 하단 네비 매칭 탭이 중복. 화면 밀도 문제.
- **우선순위**: Warning (낮음, 다음 디자인 리팩토링 사이클에서 검토)

### W6 — 멤버 초대 기능 TODO

- **증상**: 팀 멤버 관리 화면 "초대" 버튼이 `TODO` 상태 또는 미연결. `POST /teams/:id/members` 연동 필요.
- **우선순위**: Warning

### W7 — 하단 네비게이션 팀 매칭 탭 누락

- **증상**: 모바일 하단 플로팅 pill 바에 팀 매칭(`/team-matches`) 탭이 없어 진입점이 홈 화면 섹션뿐.
- **우선순위**: Warning

---

## UI Suggestion (S-tier)

### S1 — 소셜 로그인 버튼 브랜드 컬러 CSS 변수화

- **증상**: 카카오(`#FEE500`), 네이버(`#03C75A`) 컬러가 인라인 `style={}` 또는 하드코딩 Tailwind 클래스로 산재.
- **수정**: `globals.css` @theme에 `--color-kakao`/`--color-naver` 변수 추가.
- **우선순위**: Suggestion

### S2 — `min-h-11` → `min-h-[44px]` 일관화

- **증상**: 터치 타겟 44px 기준이 일부 컴포넌트에서 `min-h-11`(44px)로, 다른 곳에서 `min-h-[44px]`로 혼재.
- **수정**: `globals.css`에 `--spacing-touch: 44px` 커스텀 토큰 추가 또는 `min-h-11`로 통일.
- **우선순위**: Suggestion

### S3 — `rounded-[22px]` 토큰화

- **증상**: 하단 네비 pill bar의 `rounded-[22px]`가 임의 값. `--radius-pill` 토큰화 필요.
- **우선순위**: Suggestion

---

## Backend

### B1 — `ApplicationsSection` 페이지네이션 미적용

- **증상**: `/team-matches/:id` 호스트 뷰의 신청 목록이 cursor pagination 없이 전체 로드. 신청이 많을 경우 성능 저하.
- **파일**: `apps/api/src/team-matches/team-matches.service.ts` `findApplications()` 메서드
- **우선순위**: Warning

### B2 — `admin.service.ts` in-memory Map → Prisma 전환 (Superseded)

- **원 관찰**: moderation/audit state가 in-memory Map에 남아 있어 재시작 시 소멸할 수 있다고 기록했다.
- **현재 상태**: 이 이슈는 task 37 `Admin Real Data And Audit Persistence`가 canonical follow-up으로 직접 추적한다.
- **우선순위**: Superseded by task 37

### B3 — Prisma migration `CONCURRENTLY` 전략 부재

- **증상**: 프로덕션 migration 실행 시 대형 테이블 인덱스 생성이 테이블 락을 걸 수 있음. `CREATE INDEX CONCURRENTLY` 패턴 도입 필요.
- **우선순위**: Suggestion (트래픽 증가 시 선행 필요)

---

## 작업 순서 권고

Critical 해결 순서: B2 (admin in-memory) → C3 (my/team-matches mock) → C2 (종목 하드코딩) → C4 (team apply API)
