# 정규 리그 경기 일정 전체/내 팀 필터

Status: 로컬 구현·회귀 검증, alpha QA 대기

정본 작업: [Task 20261081](../../.github/tasks/20261081-league-schedule-filter.md)
Route: `/tournaments/:id/bracket`, `kind=regular_league`인 대회 거울 경로.
Scope: 경기 일정 목록의 전체/내 팀 필터. 대진표의 기존 동작 유지. 대회 일정 탭(비리그)은 아래 "대회 일정 탭 변경(MD-QA #220·221)"을 따른다.

## 시나리오

1. 비로그인 관전자: 전체가 기본, 내 팀 선택 → 로그인 안내. 로그인 redirect에 `teamScope=mine`, 기존 `from`/단계/hash 유지.
2. active 일반 멤버/팀장/매니저: 소속된 모든 팀의 홈·원정 경기 합집합. live·예정·종료·시간 미정에 동일한 기준 적용, 경기 중복 없음.
3. 가입 신청 대기: 내 팀으로 인정하지 않는다.
4. 참가하지 않은 사용자: 미참가 안내 → 전체 일정 보기. 참가팀이지만 미배정: 미배정 안내 → 전체 일정 보기.
5. 커서 페이지 조회 중: 빈 결과·0경기로 확정하지 않고 로딩 표시. 후속 페이지의 내 팀 경기 포함. 페이지 오류는 일정 조회 오류·재시도.
6. 팀 API 401: 로그인 안내. 기타 API 실패: 원인·재시도, 빈 소속으로 대체하지 않는다.
7. 참가팀 비공개: 공개 후 내 팀 일정 확인 안내. registrationId로 숨겨진 teamId를 추론하지 않는다.
8. 전체↔내 팀 연속 선택·새로고침·경기 상세 복귀·browser history: 마지막 선택 유지, 기존 from/단계/hash 보존.

## 대회 일정 탭 변경 (MD-QA #220·221)

비리그 대회의 일정 탭은 위 필터 범위 밖이지만, 같은 일정 컴포넌트(`ScheduleContent`)를 쓰므로 다음이 달라졌다.

- 팀장이 아닌 팀원도 소속 팀 전체 기준으로 "내 팀만" 스위치와 "우리 팀" 카드를 받는다. 순위표 우리 팀 행에는 "우리 팀" 배지와 왼쪽 막대가 붙는다. 비공개 팀 행은 "참가팀 비공개"로 그대로 보이고 표식만 붙지 않는다.
- 일정 위 "예정만" 칩(`?schedule=upcoming`, 리그와 같은 키)이 끝났거나 취소된 경기를 가린다. 진행 중 경기는 가리지 않고, 가릴 경기가 없으면 칩을 두지 않는다. "예정만" 때문에 비면 빈 상태의 "전체 보기"로 푼다.
- "다음 경기" 배지는 지금 보는 단계·팀 범위에서 시각이 가장 이른 예정 경기에 붙고 필터를 켜고 꺼도 같은 카드에 남는다.
- 종료(`completed`) 대회는 일정 맨 위에 "모든 경기가 끝났어요 · 최종 결과 보기" 한 줄이 나온다. 정규 리그 거울 경로에는 붙이지 않는다.
- 정규 리그 거울 경로는 같은 일정 컴포넌트라 "예정만" 칩과 "다음 경기" 배지가 함께 생긴다. 내 팀만 스위치는 리그 래퍼의 것 한 벌만 그린다.

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
