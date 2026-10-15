# MD-QA #142 경기 시간 만료의 자동 종료와 운영자 안내

Status: In Progress
Owner: root orchestration → backend-data-dev → shared frontend owner
Created: 2026-10-13

## Context
기존 리포트 https://teameet.jmandu.kr/issues/142/ 는 예정 일정의 종료와 실제 진행 경기의 시간 만료를 구분하여 개선을 요청한다. 김성준 담당·확인 중을 기존 UI에서 확인했다. 최신 직접 답변은 선택 3과 1을 함께 적용하는 것이다.

## Goal
서버가 실제 플레이 시간 만료를 기존 상태·동시성 계약으로 기간 종료 처리하고, 운영자는 만료 안내와 수동 종료 출구를 함께 사용한다. 마지막 기간이 끝나도 Game은 `LIVE`를 유지하며, 경기 종료·결과 제출과 공식 확인은 기존 운영 절차로 진행한다.

## Original Conditions
- [x] 사용자 선택: 서버 자동 종료 + 기존 만료 안내·수동 종료 버튼
- [x] fetch origin dev 직후 관리형 생성; base 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [x] 실제 worker·공동 기록 실행 중 시계의 실패 회귀 → 최소 수정 → backend 36/36 PASS
- [x] Web 실제 소비자 실패 회귀와 초기 상세 역전 회귀 → `e93` 영향 6개 파일 148/148 PASS(기간 만료 13개 포함)
- [x] `e93` 기준 독립 적대적 리뷰: API 13개 + 문서 2개 C0/W0, frontend 6개 + 문서 2개 C0/W0
- [ ] 최신 dev 통합 HEAD `05f8b0ebb726441738269c2db9416e49181cfb34`의 API 타입 검사
- [ ] 같은 최신 dev 통합 HEAD의 Web 타입 검사
- [ ] 로컬 DB 통합 11개 검증 — Docker OFF로 NOT RUN
- [ ] dev PR·CI 확인과 기존 tracker 댓글 갱신
- [ ] dev 머지와 배포 확인
- [ ] 머지 후 실제 alpha 390/768/1440 이미지·console/network 검증 — NOT RUN

## User Scenarios
운영 중 설정된 단판/전후반의 실제 플레이 시간이 끝나면 서버가 현재 기간을 일관되게 종료한다. 완료된 정지 시간은 경과 시간에서 빼고, 진행 중인 정지 동안에는 만료 처리하지 않는다. `extraTime`은 기존 별도 연장 기간의 boolean 표시이며 숫자 추가 분이 아니다. 연장도 해당 기간의 설정 시간을 한 번만 적용한다. 브라우저가 오프라인이어도 서버가 권위 있는 상태를 유지한다. 서버 확인 전에는 운영자에게 만료와 기존 수동 종료 액션을 안내하며, 마지막 기간 종료 뒤의 경기 종료·결과 제출과 공식 확인은 운영자가 기존 흐름으로 진행한다.

## Test Scenarios
- Happy: 실제 서버 worker 경로가 현재 기간 만료를 저장한다. 다음 기간은 `HALFTIME`으로 두고, 마지막 기간 종료 후에도 Game `LIVE`를 유지해 수동 경기 종료·결과 제출·공식 확인으로 이어진다.
- Edge: 각 기간의 설정 `durationMinutes`를 한 번 적용하는 임계값, 별도 연장 기간의 boolean `extraTime`, 누적/진행 중 정지, 중간 기간·최종 기간, 재시작·재접속, 동일 명령 재시도, 운영자와 worker 경합, 일반 상세·보호 조회·Socket 응답 순서 역전.
- Error: 예정 endAt만으로 종료하지 않음; stale version/다른 기간/이미 종료/권한·DB 실패에서 중복 이벤트나 공식 결과를 만들지 않음.
- Mock: v1 fixture·MSW·API 문서 및 실제 worker 소비자 회귀를 같은 변경으로 맞춤. pure helper만 통과하는 검증은 전체 경로 증거가 아님.

## Parallel Work Breakdown
- Wave A backend-data-dev 단독: games 서비스·core lifecycle 경계와 현재 jobs/v1-game-operations-worker의 실제 연결, 좁은 unit/integration fixture. 정확한 수정 파일은 조사 후 root에 고정한다. 먼저 RED 준비, 실행은 root.
- Wave B: A 공유 응답/상태 계약 확정 뒤 한 frontend-data owner가 타입·훅·MSW를 선행하고 별도 UI owner가 기존 clock/console를 변경한다.
- Sequential: root Git·최소 worker 직렬 검증·최신 head 리뷰·PR·이미지·tracker·실제 alpha. #134/#135 console hook owner와 파일 단위로 조율한다.
- Forbidden: 타인 변경 원복, main/prod, .env, 다른 worktree, 정책·다른 task, broad staging, subagent commit/runtime/browser.

## Acceptance Criteria
- [x] 실제 경과 시간은 `now - startedAt - max(0, pausedTotalMs)`로 계산하고 열린 정지는 만료 대상에서 제외한다. 각 기간의 설정 `durationMinutes`를 한 번 적용하며, 기존 boolean `extraTime`을 숫자 추가 분으로 사용하지 않는다. 예정 `endAt`으로 판단하지 않는다.
- [x] 기존 기간 종료 경계·행 잠금·재조회·idempotency·감사를 보존한다. 반복 처리·worker/운영자 경합에서 기간을 중복 종료하지 않으며, 만료 자체가 Game 이벤트나 새 sequence를 만들지 않는다.
- [x] 마지막 기간 종료 후 Game `LIVE`를 유지한다. 수동 경기 종료·결과 제출·공식 확인과 분리하고 공식 결과·revision·완료 알림을 자동 생성하지 않는다.
- [x] 단위/소비자 검증에서 만료·서버 확인·수동 종료·오류·재시도와 단조로운 상태·버전 수락을 확인한다. 실제 alpha 화면 확인은 아래 별도 미완 게이트다.
- [x] backend 36/36과 `e93` Web 영향 6개 파일 148/148 RED→GREEN 및 `e93` 독립 리뷰 C0/W0를 기록한다.
- [ ] 최신 dev 통합본 API/Web 타입 검사와 committed diff gate를 확인한다.
- [ ] 로컬 DB 통합 11개 검증을 수행한다(Docker OFF, NOT RUN).
- [ ] dev PR·CI·머지·배포를 확인한다.
- [ ] alpha 390/768/1440 이미지·console/network를 확인한다(NOT RUN).

## Tech Debt Resolved
예정 시각과 실제 플레이 시계의 혼동 및 client-only 종료의 중복 경로를 도입하지 않는다.

## Security Notes
서버 내부 expiry actor는 기존 운영 명령의 상태/기간/버전/감사 불변식을 우회하지 않는다. 사용자 권한과 takeover 계약은 유지한다.

## Risks & Dependencies
#139 실시간 버전 및 #134/#135 console 수신 변경과 공유 계약을 통합해 검증한다. 현재 `7596` dev를 충돌 없이 일반 merge한 HEAD는 `05f8b0ebb726441738269c2db9416e49181cfb34`이고, 그 통합본의 API/Web 타입 검사는 대기 중이다. 로컬 DB 통합 11개는 Docker OFF로 NOT RUN이며 dev PR과 alpha도 남아 있다. 관리형 생성은 성공했으나 attachment identity100 한도와 attach server overloaded 오류는 별도 기록하며 중복 checkout을 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | 만료 동작 | 선택3 서버 자동 종료 + 선택1 운영자 안내·수동 종료 |
| 2026-10-13 | root | clock 식 | 경과 시간에서 정지 시간을 제외하고 각 기간의 설정 시간을 한 번 적용한다. `extraTime`은 기존 별도 연장 기간의 boolean이며 숫자 추가 분이 아니다. 예정 `endAt` 사용 금지 |
| 2026-10-16 | root | 마지막 기간 만료와 경기 종료 | 기간은 `ENDED`, Game은 `LIVE`를 유지한다. 경기 종료·결과 제출·공식 확인은 기존 수동 흐름으로 분리한다 |

## Progress Snapshot
- 2026-10-13 10:20Z: fresh managed checkout 생성 및 fix/mdqa-142-automatic-period-end 분리. 전용 canonical task 준비. 소스·테스트·PR·alpha는 아직 NOT RUN. 기존 tracker 담당·상태는 유지한다.

- 2026-10-15 root recovery: same canonical checkout restored via existing branch + snapshot FF863ee6ef1 then normal latest-dev merge3cc383dc8e; no duplicate worktree. Actual worker initial RED1/controls4 (period remains LIVE), then shared-record running-clock actual RED1 after separately recorded compile0-tests actor repair. Minimal worker/period/audit helper implementation frozen; sharedRecord must not disable an already-started period. extraTime is the existing boolean separate-period marker; each configured period duration is used once, never numeric boolean addition or scheduled endAt. Unit10+core and DB11 GREEN not yet executed; DB Docker OFF NOTRUN. Frontend real-console tests5 first run fixture-origin errors (not feature RED), corrected fixture rerun pending. No alpha PASS or auto final result submission.

### 2026-10-16 검증 이력과 현재 게이트

아래 실행 결과는 root가 확인한 기록이다. 이전 snapshot의 미실행·실패 이력은 보존하며 현재 상태를 대신하지 않는다.

| 범위 | 실제 결과 | 기준과 남은 제한 |
|---|---|---|
| Backend worker·core 회귀 | `de7` 기준 36/36 PASS, 23.828초 | 실제 worker 및 공동 기록의 실행 중 시계 RED 뒤 GREEN. 최신 dev 통합 후 재검증 결과로 확대하지 않는다 |
| API 타입 검사 | 이전 base에서 PASS | 현재 통합 HEAD의 API 타입 검사는 대기 중 |
| Web 초기 기능 회귀 | 7 FAIL / 5 PASS | 초기 RED 이력이며 현재 PASS로 취급하지 않는다 |
| 지연·역순 응답 및 초기 상세 역전 회귀 | 13번째 기간 만료 회귀 RED: 1 FAIL / 12 SKIP, 8.68초 | initial subscribe v5 → 보호 GET v5 → worker v6 → 일반 상세 GET v6 뒤 수동 종료가 expectedVersion v5를 보내던 실제 실패. root 기록 `mdqa142-initial-ahead-red.log` |
| Web 수정 후 영향 범위 | `e93`의 6개 파일 148/148 PASS, 25.15초 | 기간 만료 13개 포함. 일반 상세의 일관된 최신 state/version 수락 및 같은 batch의 최신 Socket 버전 보호를 포함한다 |
| 검증 준비·이전 수동 fixture 실패 | native Abort fixture 오류는 0 tests; 이후 Testing Library 수동 확인 fixture 실패도 별도 이력 | 기능 GREEN이나 통과 건수에 포함하지 않는다 |
| 독립 API·문서 리뷰 | API 13개 + 문서 2개 C0/W0 | 최신 `e93` 기준 |
| 독립 frontend·문서 리뷰 | frontend 6개 + 문서 2개 C0/W0 | 최신 `e93` 기준 |
| 최신 dev 통합 | `7596` 일반 merge, 충돌 없음 | 현재 HEAD `05f8b0ebb726441738269c2db9416e49181cfb34`; 수정 소스 `e93` 유지 |
| 통합 후 API/Web 타입 검사 | PENDING | 이전 base의 PASS로 대체하지 않는다 |
| 로컬 DB 통합 11개 | NOT RUN — Docker OFF | 로컬 DB 통합 PASS 주장 없음 |
| dev PR·CI·머지 및 실제 alpha | PENDING / alpha NOT RUN | alpha 390/768/1440 이미지·console/network 게이트는 열어 둔다 |
