# Task 20261079: MD-QA #139 콘솔 버전 역행 방지

Status: In Progress
**Owner**: root → frontend-data-dev
**Created**: 2026-10-13

## Context
https://teameet.jmandu.kr/issues/139/ 원문과 최근 댓글을 확인하고 김성준 담당·확인 중 저장을 재조회로 검증했다. 현재 v1 콘솔은 중복 committed 이벤트의 sequence를 검사하기 전에 version을 적용하여 최신 버전을 과거 값으로 되돌릴 수 있다.

## Goal
지연·중복 commit/ack/snapshot 이후에도 다음 실제 명령이 최신 expectedVersion을 보내도록 보장한다.

## Original Conditions (must all be satisfied)
- [ ] 과거 idempotent 재전송이 version·score·clock을 역행시키지 않는다.
- [ ] 정상 최신 이벤트·재접속 snapshot은 유지된다.

## User Scenarios
운영자가 최신 명령을 처리한 뒤 과거 재전송을 받아도 다음 운영 명령이 409 없이 최신 버전을 사용한다.

## Test Scenarios
### Happy path
- [ ] 실제 콘솔 hook의 최신 committed/ack 버전과 다음 송신 expectedVersion을 검증한다.
### Edge cases
- [ ] 중복·역순 sequence/version, 재시도 ack, stale snapshot을 검증한다.
### Error paths
- [ ] 실제 최신 충돌 및 권한 실패를 성공으로 숨기지 않는다.
### Mock data updates needed
- [ ] 기존 v1 socket/REST 계약과 동일한 fixture를 사용한다.

## Parallel Work Breakdown
- Phase A frontend: Owned `apps/v1_web/src/hooks/use-v1-game-operations-console.ts`, 전용 `use-v1-game-operations-console-version-monotonic.test.tsx`. 필요한 기존 helper 변경은 root와 조정한다.
- Forbidden: API, 다른 hooks/types/MSW, UI pages, 다른 task/state, Git 및 테스트 실행. #134·#135의 hook 변경은 Phase A 완료 후 root가 직렬 조정한다.
- Phase B root: 실제 RED → GREEN 직렬 검증, 독립 리뷰, committed diff, dev PR·기존 리포트 댓글, gated merge 및 alpha 검증.

## Acceptance Criteria
- [ ] Original conditions·실제 consumer 회귀 검증 통과
- [ ] Critical=0, Warning=0 최신 head 독립 리뷰
- [ ] 명시 pathspec commit·base dev PR 및 CI 확인
- [ ] 실제 alpha 검증과 리포트 댓글을 코드 검증과 구분

## Tech Debt Resolved
조사 중. 버전·sequence 수용 순서와 재전송 계약의 공백을 최소 범위로 해결한다.

## Security Notes
기존 인증, operating lease 및 권한 gate를 유지한다. 실제 사용자 데이터·비밀은 사용하지 않는다.

## Risks & Dependencies
#134/#135는 같은 hook을 사용하므로 단일 소유권으로 순서를 맞춘다. 관리형 checkout 생성은 성공했지만 attachment 100개 제한으로 등록 재시도도 실패했다. 반환된 checkout을 그대로 사용하고 새 중복 checkout은 생성하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root | stale snapshot/ack의 실제 수용 경계 | v1 source 및 실제 hook 회귀로 확인 |

## Progress Snapshot
- 2026-10-13 07:38Z F6/F7 root verification: retained REST callbacks after route/token change produced4 FAIL/2 PASS, with two additional same-route-cycle cases added; current narrow8/8 GREEN. Real GamesService arrival ordering had4 FAIL/4 PASS after correcting invalid UUID fixture setup (initial invalid8 failures excluded from product RED); internal reservations produced12/12 GREEN including metadata-await, expiry/revoke and failure cleanup. Actual gateway first profile await reproduced5 FAIL/1 PASS; pre-await reservation, exact superseded code and old registry fixture synchronization passed three affected files61/61. Evidence logs `mdqa139-f6-stale-rest-green.log`, `mdqa139-f7-takeover-order-valid-red.log`, `mdqa139-f7-cwd-match-green.log`, `mdqa139-f7-gateway-profile-order-red.log`, `mdqa139-f7-gateway-affected-green.log`. API/Web Changeset and realtime contract now include server ordering; process-local limitation remains explicit. Final affected console/registry tests, committed type gates, latest independent review, PR/CI and alpha are pending.
- 2026-10-13 06:45Z latest actual hook verification: **17 files / 61 PASS**, `mdqa139-f5-console-green.log`. After the six ordering REDs, a restored-queue pre-snapshot case failed because its retry envelope prematurely used version0; the hook now waits for authoritative initialization. Two later actual route/lease REDs reproduced missing automatic B lease acquisition and delayed A ACK overwriting the legitimately held B token; scoped lease/request-generation and current-game guards produced GREEN. The preceding affected run43/46 failed only on missing gameId metadata and persisted JSON undefined-key comparison; those fixture corrections preserve the original action/ACK assertions. Newly added snapshots7 and takeover2 cases are real hook/transport scenarios. Source tests do not establish alpha resolution. Latest committed head review, publication and CI remain pending.
- 2026-10-13 06:13Z independent reviews of immutable f150 were FAIL (Critical2; additional adversarial ordering cases). Six corrected, valid actual consumer RED cases failed: foreign-game snapshot, event/REST before initial snapshot, newer same-sequence assist, delayed native digest and fresh offline queue rebase. The earlier three fixture setup errors are NOT product RED. Minimal hook fixes produced16/16 GREEN (new6 + previous10), evidence `mdqa139-adversarial16-green.log`. Required gameId metadata was synchronized in12 existing fixtures without weakening assertions; their27 cases and broader affected verification still await root execution. Old f150 review does not approve the new source. Latest immutable review, PR, CI and alpha remain pending.
- Root claim verified 2026-10-13 05:07Z; branch `fix/mdqa-139-console-version`, base `5d289d7f40ccc6f0e447d5ce1f89a1f4c331c711`.
- Initial actual consumer RED: 8 cases / 7 FAIL / 1 PASS. Extended ACK/body and game-switch consumer: 10 cases / 9 PASS / 1 FAIL; final two-line game snapshot/timeline reset corrected that observed failure.
- Source frozen: hook + 217 pure-line dedicated consumer spec. Latest dirty-tree dedicated 10/10 GREEN and affected console 15 files / 52 cases PASS. Logs: original checkout ignored `tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa139-version-final-green.log`, `mdqa139-affected-console-green.log`.
- Web tsc PASS; initial unchanged pattern runner failed because Windows `find.exe` was selected. Root reran only that failed pattern stage with child-process GNU toolchain PATH; PASS (`mdqa139-pattern-corrected-toolchain.log`). The gate was not changed or skipped.
- Before publication fetch detected unrelated native update/events/tournament-order merges; `origin/dev=1b64224674417f8c2333f1f31a6f0c8b0d058033`. Root preserves these changes and integrates after scoped source commit.
- Independent adversarial review / committed-tree check / PR / merge / actual alpha remain pending. Tests alone are not alpha evidence.
