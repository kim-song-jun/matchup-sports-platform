# MD-QA #142 경기 시간 만료의 자동 종료와 운영자 안내

Status: In Progress
Owner: root orchestration → backend-data-dev → shared frontend owner
Created: 2026-10-13

## Context
기존 리포트 https://teameet.jmandu.kr/issues/142/ 는 예정 일정의 종료와 실제 진행 경기의 시간 만료를 구분하여 개선을 요청한다. 김성준 담당·확인 중을 기존 UI에서 확인했다. 최신 직접 답변은 선택 3과 1을 함께 적용하는 것이다.

## Goal
서버가 실제 플레이 시간 만료를 기존 상태·동시성 계약으로 처리하고, 운영자는 만료 안내와 수동 종료 출구를 함께 사용한다. 공식 결과 확정은 기존 별도 절차를 유지한다.

## Original Conditions
- [x] 사용자 선택: 서버 자동 종료 + 기존 만료 안내·수동 종료 버튼
- [x] fetch origin dev 직후 관리형 생성; base 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [ ] 실제 기존 worker/경기 상태 경로의 실패 회귀 → 최소 수정 → GREEN
- [ ] 최신 head 독립 적대적 리뷰·dev PR·기존 댓글·머지 후 실제 alpha

## User Scenarios
운영 중 설정된 단판/전후반의 실제 플레이 시간이 끝나면 서버 상태가 일관되게 종료된다. 일시정지 중에는 시간이 진행되지 않으며 설정된 추가시간을 끝낸 뒤 처리한다. 브라우저가 오프라인이어도 서버가 권위 있는 상태를 유지한다. 서버 확인 전에는 운영자에게 만료와 기존 수동 종료 액션을 안내한다.

## Test Scenarios
- Happy: 실제 서버 worker 경로가 현재 기간 만료를 저장하고 최종 기간의 경기 종료를 기존 종료 계약과 연결한다.
- Edge: duration + configured added time 임계값, 누적/진행 중 정지, 중간 기간·최종 기간, 재시작·재접속, 동일 명령 재시도, 운영자와 worker 경합.
- Error: 예정 endAt만으로 종료하지 않음; stale version/다른 기간/이미 종료/권한·DB 실패에서 중복 이벤트나 공식 결과를 만들지 않음.
- Mock: v1 fixture·MSW·API 문서 및 실제 worker 소비자 회귀를 같은 변경으로 맞춤. pure helper만 통과하는 검증은 전체 경로 증거가 아님.

## Parallel Work Breakdown
- Wave A backend-data-dev 단독: games 서비스·core lifecycle 경계와 현재 jobs/v1-game-operations-worker의 실제 연결, 좁은 unit/integration fixture. 정확한 수정 파일은 조사 후 root에 고정한다. 먼저 RED 준비, 실행은 root.
- Wave B: A 공유 응답/상태 계약 확정 뒤 한 frontend-data owner가 타입·훅·MSW를 선행하고 별도 UI owner가 기존 clock/console를 변경한다.
- Sequential: root Git·최소 worker 직렬 검증·최신 head 리뷰·PR·이미지·tracker·실제 alpha. #134/#135 console hook owner와 파일 단위로 조율한다.
- Forbidden: 타인 변경 원복, main/prod, .env, 다른 worktree, 정책·다른 task, broad staging, subagent commit/runtime/browser.

## Acceptance Criteria
- 누적 플레이 시간은 정지 시간을 제외하며 만료 기준은 기본 기간 시간 + 실제 설정 추가시간이다. 추가시간을 양쪽 식에 중복 적용하지 않는다.
- 실제 v1 기간/경기 종료 state machine을 보존하고 반복 처리·worker/운영자 동시 요청에서도 종료 이벤트는 한 번만 생성한다.
- 최종 경기 종료와 공식 결과 확정은 구분한다. 공식 결과·revision·알림을 임의 확정하거나 중복 생성하지 않는다.
- 현재 UI에 만료·서버 확인·수동 종료·오류 및 재시도를 정직하게 표시한다.
- RED→GREEN, committed diff/type gate, 최신 head Critical0/Warning0 및 alpha 390/768/1440 이미지·console/network를 확인한다.

## Tech Debt Resolved
예정 시각과 실제 플레이 시계의 혼동 및 client-only 종료의 중복 경로를 도입하지 않는다.

## Security Notes
서버 내부 expiry actor는 기존 운영 명령의 상태/기간/버전/감사 불변식을 우회하지 않는다. 사용자 권한과 takeover 계약은 유지한다.

## Risks & Dependencies
#139 실시간 버전 수정과 #134/#135 console 수신 변경이 진행 중이다. 머지 전 최신 dev drift를 통합하고 영향받는 검증을 갱신한다. 관리형 생성은 성공했으나 attachment identity100 한도와 attach server overloaded 오류는 별도 기록하며 중복 checkout을 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | 만료 동작 | 선택3 서버 자동 종료 + 선택1 운영자 안내·수동 종료 |
| 2026-10-13 | root | clock 식 | elapsed에서 정지시간 제외; threshold에서 설정 추가시간 적용. 예정 endAt 사용 금지 |

## Progress Snapshot
- 2026-10-13 10:20Z: fresh managed checkout 생성 및 fix/mdqa-142-automatic-period-end 분리. 전용 canonical task 준비. 소스·테스트·PR·alpha는 아직 NOT RUN. 기존 tracker 담당·상태는 유지한다.
