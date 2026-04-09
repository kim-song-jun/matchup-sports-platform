# Task 26 — QA Backlog & Follow-ups (Task 21-25 파이프라인 잔여)

## Context

Task 21-25 + Fix Wave 파이프라인 완료 후 스코프 밖으로 판정된 이슈 목록. 다음 태스크 사이클의 후보 목록으로 관리한다.

우선순위: **Critical > Warning > Suggestion**

---

## UX Critical (C-tier)

### C1 — `/mercenary/[id]` 상세 페이지 미존재

- **증상**: `apps/web/src/app/(main)/mercenary/[id]/` 디렉토리에 `page.tsx`가 없고 `edit/`만 존재. 용병 목록 카드 클릭 시 404.
- **영향**: 용병 신청 플로우 전체 dead-end. 비로그인 redirect(`/login?redirect=/mercenary/:id`)도 복귀 후 404.
- **파일**: `apps/web/src/app/(main)/mercenary/[id]/page.tsx` (신규 생성 필요)
- **우선순위**: Critical

### C2 — 팀 매칭 모집글 작성 종목 2종목 하드코딩

- **증상**: `apps/web/src/app/(main)/team-matches/new/page.tsx` L17-20의 `sportOptions`가 `soccer`/`futsal`만 포함. 농구·배드민턴 등 다른 종목 팀 owner/manager는 모집글 생성 불가.
- **수정**: `lib/constants.ts`의 전체 종목 상수(`SPORT_TYPES` 또는 `sportCardAccent` 키)로 교체.
- **우선순위**: Critical

### C3 — `/my/team-matches/page.tsx` mock 데이터 잔존

- **증상**: `apps/web/src/app/(main)/my/team-matches/page.tsx` L15에 `mockTeamMatches` 하드코딩 상수 존재. `useMyTeamMatchApplications()` 또는 `useTeamMatchList({ myTeams })` 실제 API 연동 필요.
- **우선순위**: Critical (Mock Data Discipline 원칙 위반)

### C4 — `POST /teams/:id/apply` 백엔드 미구현

- **증상**: 팀 상세 페이지 "가입 신청" CTA가 호출할 API가 없음. 현재 버튼 클릭 시 API 에러 또는 dead-end.
- **파일**: `apps/api/src/teams/teams.controller.ts`, `apps/api/src/teams/teams.service.ts` (엔드포인트 추가)
- **우선순위**: Critical

---

## UX Warning (W-tier)

### W1 — `/mercenary` 종목 필터 2종목 하드코딩

- **증상**: `apps/web/src/app/(main)/mercenary/page.tsx` L19-20에 `soccer`/`futsal`만 있어 다른 종목 용병 탐색 불가.
- **수정**: 전체 종목 상수로 교체.
- **우선순위**: Warning

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

### B2 — `admin.service.ts` in-memory Map → Prisma 전환

- **증상**: `apps/api/src/admin/admin.service.ts` L23-24에 `userAuditLog`/`userModerationState`가 `new Map<>()`으로 선언. 서버 재시작 시 데이터 소멸. Prisma `AdminAuditLog` 모델 마이그레이션 필요.
- **우선순위**: Critical (Tech Debt 원칙 — 현재 범위 내 미해결)
- **참고**: Task 19에서 부분 전환됐으나 두 Map이 잔존.

### B3 — Prisma migration `CONCURRENTLY` 전략 부재

- **증상**: 프로덕션 migration 실행 시 대형 테이블 인덱스 생성이 테이블 락을 걸 수 있음. `CREATE INDEX CONCURRENTLY` 패턴 도입 필요.
- **우선순위**: Suggestion (트래픽 증가 시 선행 필요)

---

## 작업 순서 권고

Critical 해결 순서: B2 (admin in-memory) → C3 (my/team-matches mock) → C1 (mercenary 상세 페이지) → C2/C5 (종목 하드코딩) → C4 (team apply API)
