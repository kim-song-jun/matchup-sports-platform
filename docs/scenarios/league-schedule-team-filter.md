# 정규 리그 경기 일정 전체/내 팀 필터

Status: 로컬 구현·회귀 검증, alpha QA 대기

정본 작업: [Task 20261081](../../.github/tasks/20261081-league-schedule-filter.md)
Route: `/tournaments/:id/bracket`, `kind=regular_league`인 대회 거울 경로.
Scope: 경기 일정 목록만. 순위표·대진표·대회 일정의 기존 동작 유지.

## 시나리오

1. 비로그인 관전자: 전체가 기본, 내 팀 선택 → 로그인 안내. 로그인 redirect에 `teamScope=mine`, 기존 `from`/단계/hash 유지.
2. active 일반 멤버/팀장/매니저: 소속된 모든 팀의 홈·원정 경기 합집합. live·예정·종료·시간 미정에 동일한 기준 적용, 경기 중복 없음.
3. 가입 신청 대기: 내 팀으로 인정하지 않는다.
4. 참가하지 않은 사용자: 미참가 안내 → 전체 일정 보기. 참가팀이지만 미배정: 미배정 안내 → 전체 일정 보기.
5. 커서 페이지 조회 중: 빈 결과·0경기로 확정하지 않고 로딩 표시. 후속 페이지의 내 팀 경기 포함. 페이지 오류는 일정 조회 오류·재시도.
6. 팀 API 401: 로그인 안내. 기타 API 실패: 원인·재시도, 빈 소속으로 대체하지 않는다.
7. 참가팀 비공개: 공개 후 내 팀 일정 확인 안내. registrationId로 숨겨진 teamId를 추론하지 않는다.
8. 전체↔내 팀 연속 선택·새로고침·경기 상세 복귀·browser history: 마지막 선택 유지, 기존 from/단계/hash 보존.

## 로컬 증거

- 실제 `BracketScheduleTab` → `LeagueScheduleContent` → `ScheduleContent` → 경기 상세 링크를 렌더한다. query 경계만 fixture로 대체.
- 전용 회귀 14/14 PASS. 기존 일정/필터 복귀/bracket/팀 권한/선수 링크 관련 111/111 PASS.
- TypeScript PASS, 동일 v1 패턴 검사 Git Bash 실행 PASS. diff --check PASS, touched code 새 debt marker 없음. 미커밋 작업트리 기준이며 PR/배포 완료 판정은 아님.
- 공개 alpha 엔티티가 실제 `kind=regular_league`, `format=group_knockout`, `status=in_progress`임을 확인했고 health `db=true`. API 읽기만 수행했으며 화면 QA를 대체하지 않는다.
- API/DB/fixture 스키마 변경 없음. `/me/teams`는 active membership 모두 반환, cursor 없음. 리그 공개 일정 standings는 confirmed 참가팀 전체에서 계산.
- Vitest 단일 worker 및 파일 직렬 실행. 로컬 web/API 서버·DB·운영 데이터 생성/변경 없음.

## Alpha 수동 QA (미실행)

대상 viewport: 390/768/1440. 실제 관전자·일반 멤버·복수 팀 사용자로 위 시나리오를 클릭하고 screenshot before/after, focus/overflow/sticky, console/network를 확인한다.

- 브랜치 변경이 alpha에 배포되지 않아 after 검증 불가.
- 브라우저 커넥터 연결 두 번 실패: trusted Node process 종료, Windows sandbox `helper_unknown_error: setup refresh had errors`. baseline 캡처도 없음.
- 승인된 파일/CLI 검증은 elevated 실행으로 복구. UI를 테스트만으로 완료 판정하지 않는다.
- 브라우저 초기화 실패로 생성된 탭/세션 없음. 테스트·lint 프로세스 종료 확인 후 마무리.
