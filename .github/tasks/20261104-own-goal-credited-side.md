# Task 20261104: 자책골을 득점 팀 영역에 표시

Status: Review
Created: 2026-10-22
Owner: Codex (단일 세션)

## Context
자책골을 행위 선수 소속팀에 배치하는 기존 표시 계약을 사용자가 득점한 상대팀 기준으로 변경 요청했다. 이전 분석 후 이번 요청으로 코드 수정을 승인했다.
## Goal
대회 일정·경기 상세·팀 전적·공식 결과에서 자책골을 점수가 올라간 팀 영역에 표시한다.
## Original Conditions
- [x] 표시 팀은 기록된 득점 귀속 sideId를 사용한다.
- [x] 선수 이름·프로필·OG와 개인 득점 제외 규칙은 유지한다.
- [x] 실시간 이벤트 및 공식 revision JSON 경로에 같은 규칙을 적용한다.
## User Scenarios
A팀 선수가 자책골을 넣으면 B팀 점수와 B팀 영역의 선수명·OG 표시가 일치한다. 홈/원정 양방향 및 선수 미지정도 처리한다.
## Test Scenarios
- [x] 기존 코드에서 새 계약 회귀 테스트 실패(RED), 수정 후 통과(GREEN).
- [x] 일정 live/official 양방향, 경기 상세 live/official, 팀 전적 event/revision, 공식 결과 event/revision 및 선수 미지정·누락.
- [x] API 타입 검사·표면 검사와 diff 확인.
## Parallel Work Breakdown
순차: 회귀 테스트 → 표시 변환 제거 → 좁은 검증 → API 문서·changeset. 병렬 에이전트 없음.
Owned: 공통 공식 결과 projection, 공개 대회/팀 기록 service와 관련 spec, docs/api 계약, changeset 및 이 task.
Forbidden: DB schema/migration, 점수 원본·개인 기록 계산, 환경파일, 무관 WIP.
## Acceptance Criteria
- [x] 모든 관련 응답의 표시 side/team이 득점 귀속을 따른다.
- [x] 관련 테스트·tsc·표면 검사 통과 및 범위 확인.
## Tech Debt Resolved
점수 side와 표시 side를 다시 뒤집던 함수 및 불필요한 선수→팀 매핑을 제거한다.
## Security Notes
인증·인가·선수 이름 공개 정책 및 DB 원본은 변경하지 않는다.
## Risks & Dependencies
현재 Windows 환경은 Docker daemon이 없고 브라우저 연결이 제공되지 않는다. 로컬 Next 서버를 실행하지 않는다. 실 DB·alpha 화면 검증은 실행 여부를 별도로 기록한다.
## Ambiguity Log
2026-10-22: 사용자 확인한 표시 기준은 선수 소속이 아니라 득점한 상대팀이다. 이전 계약을 명시적으로 대체한다.
## Progress Snapshot
- Base: origin/dev bf41ad5c7. Branch: fix/own-goal-credited-side-20261022.
- RED: 일정 live/official 홈·원정 4건과 경기 상세 2건 실패. 테스트 fixture 타입 보정 뒤 공식 결과 4건·팀 전적 2건도 기존 코드에서 실패 확인 (총 12건).
- GREEN: 관련 API 6 suites / 131 tests PASS. Web 경기 상세39·일정56 =95 PASS.
- API 전체 tsc --noEmit --incremental false PASS. API 표면 검사706파일 PASS. Windows find 충돌은 이 프로세스 PATH에 Git의 GNU find를 우선해 해결했고 스크립트 수정 없음.
- 불필요한 표시 변환 함수·선수→팀 map 제거. 일반 골·카드, 이름/프로필, 익명·누락 선수, 실시간/공식 경로 및 점수 불변량 회귀 검증 포함.
- docs/api README/global/public-records와 API patch changeset 동기화. diff 공백 검사 및 touched-path 신규 debt marker0.
- 실 DB·alpha 화면 검증 미실행. 앱/DB/브라우저 서버 시작0. PR 생성 후 원격 CI는 별도로 확인하며 이번 수정 요청으로 dev/main 머지·배포는 실행하지 않는다.
