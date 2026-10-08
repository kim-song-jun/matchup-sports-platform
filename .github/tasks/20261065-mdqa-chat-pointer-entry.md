# Task 20261065: 채팅방 정상 포인터 진입 보존

Status: In Progress
**Owner**: root → frontend-ui-dev implementation → independent frontend review
**Created**: 2026-10-09

## Context
PR #1653의 기존 공통 채팅 행에서 새 alpha P2가 게시됐다. https://github.com/kim-song-jun/matchup-sports-platform/pull/1653#pullrequestreview-5464056690 및 갤러리 https://github.com/kim-song-jun/matchup-sports-platform/pull/1653#issuecomment-6071075181 참조. 현재 문서/API/RSC SHA b11e714bc9e6180ca3c88c6dbd67ad921893409f, E2E 관리자, 390×844·768×1024 일반 포인터 클릭은 목록에 남으며 같은 링크의 모바일 Enter·1440 클릭은 상세로 이동한다. root가 원 시나리오를 중복 실행하지 않고 게시된 실제 근거를 검수한다.

Canonical QA: #66 https://teameet.jmandu.kr/issues/66/. 별도 QA가 2026-10-08 23:37–23:40 UTC 본인 소유 격리 방에서 CSS500·768×757 포인터 실패, 같은 링크 Enter 성공, CSS1180×757 포인터 성공을 독립 재현한 뒤 접수했다. root는 23:45 UTC UI ‘내가 처리하기’로 김성준/확인 중 저장 성공과 실제 표시를 확인했다. 이미 진행 중인 이 공통 행 수정에 연결하며 새 worker/worktree/중복 PR을 만들지 않는다. 이 브라우저의 서빙 SHA 직접 측정은 없으므로 b11 배포 CI 근거와 구분한다.

기존 QA #41(https://teameet.jmandu.kr/issues/41/)·#44(https://teameet.jmandu.kr/issues/44/)와 공유 행을 사용하지만 원 고정·메시지 동기화 재발을 이 포인터 결함으로 단정하지 않는다. 두 리포트 상태와 완료/삭제 확인 대기는 보존한다. 원 PR #1653은 MERGED이며 새 branch는 fresh origin/dev에서 생성했다. root가 tracker 티켓을 새로 만들지 않았다.

## Goal
일반 클릭/탭은 원래 Link의 상세 진입을 보존하고 실제 수평 드래그만 스와이프/클릭 억제를 수행한다. dev PR 코드 검증과 실제 alpha 해소를 구분한다.

## Original Conditions (must all be satisfied)
- [x] 현행 v1 실제 ChatRoomRow를 대상으로 실패하는 좁은 회귀를 먼저 기록한다.
- [x] 정상 포인터 입력과 키보드·데스크톱의 component 입력 계약을 유지한다. 실제 터치/배포 alpha 진입은 별도 미검증이다.
- [x] 수평 드래그, 고정·고정 해제, 우측 닫기의 component 계약을 유지한다.
- [x] root는 타인 WIP, 머지된 feature, dev/main 정책을 변경하지 않는다.

## User Scenarios
- 모바일·태블릿 사용자가 채팅방 링크를 누르면 같은 방 상세로 이동한다.
- 사용자가 행을 좌측으로 드래그하면 고정 액션이 드러나고 해당 제스처가 상세 진입을 일으키지 않는다.
- 세로 스크롤/취소 뒤 다음 정상 클릭이 이전 드래그 상태 때문에 막히지 않는다.

## Test Scenarios
### Happy path
- [x] media-query 분기 390·768 정상 pointerdown/up 및 작은 좌표 흔들림: 상세 href/클릭 기본 동작 보존, 부모 capture 없음.
- [x] media-query 1440 및 keyboard activation은 원래 상세 Link를 유지. jsdom은 화면 레이아웃/브라우저 라우팅을 측정하지 않는다.
### Edge cases
- [x] 수평 pointer event sequence에서만 capture/클릭 억제와 72px 액션 정착.
- [x] 우측 닫기, 취소, 다음 정상 클릭, 고정 버튼 콜백 회귀.
### Error paths
- [x] 포인터 취소 및 세로 이동은 수평 제스처로 잘못 처리하지 않는다.
### Mock data updates needed
- API/DTO/fixture 계약 변경 없음. 테스트는 실제 community component를 렌더하고 필요한 기존 mock만 사용한다.

## Parallel Work Breakdown
### Frontend — Phase 1, single owner
- Owned: apps/v1_web/src/components/community/community-page.tsx, apps/v1_web/src/components/community/community-chat-pointer.test.tsx.
- Forbidden: hooks/types/MSW/DTO/schema/API, CSS/layout, package/lock, 기존 task·다른 worktree.
- [x] RED → 최소 handler fix → GREEN, 직렬 단일 worker.
### Sequential — root
- [ ] 독립 코드 리뷰와 committed tree 검증.
- [ ] Changeset·task·feature commit/push·base dev PR·기존 관련 QA 진행 댓글.
- [ ] 외부 dev 머지 후 serving SHA가 맞는 alpha 실제 검증. 같은 peer 시나리오를 중복하지 않는다.

## Acceptance Criteria
- [x] 최신 변경 계약 회귀 GREEN17/17, 좁은 기존 community regression24/24과 필요한 타입/원본 패턴 검사 PASS. 최초 통과 후 독립 finding 수정의 최신 소스로 갱신했다.
- [ ] 정확한 최신 head 독립 리뷰 FindingsNone/OK, 실제 지적 미해결 0.
- [ ] dev 대상 PR 게시 및 실제 리뷰/CI 추적.
- [ ] alpha 원 실패/수평 제스처/고정 경계 재검증은 해당 수정 포함 배포 후 별도 판정.

## Tech Debt Resolved
- 정상 Link 입력과 스와이프 capture의 결합을 제거한다. 새 abstraction이나 무관한 refactor는 도입하지 않는다.

## Security Notes
- auth, entitlement, API 요청 계약에 변경 없음. 실제 사용자 메시지·팀 권한을 변경하지 않는다.

## Risks & Dependencies
- JS DOM의 capture 계약 회귀는 실제 Chromium click retargeting/터치 장치 통과를 대신하지 않는다.
- 코드 PR 머지/CI 성공을 alpha 해소 또는 기존 #41/#44 완료로 표현하지 않는다.
- 기존 완료 리포트/첨부 영구 삭제 승인 대기는 보존한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-09 | root | pointer capture가 클릭 차단의 확정 원인인가 | peer 실제 실패와 코드의 즉시 부모 capture는 강한 가설. 실제 handler의 실패→성공과 독립 리뷰로 검증하고 alpha 원인/해소는 배포 후 판정한다. |

## Progress Snapshot
- Phase: 3 / latest-source validation + atomic commit preparation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-chat-pointer-entry/matchup-sports-platform.
- Branch: fix/mdqa-chat-pointer-entry, base b11e714bc9e6180ca3c88c6dbd67ad921893409f (fresh fetch origin/dev).
- root test slot: single frontend worker; no full suite/build/local Next server.
- H1: eager parent capture retargets click away from Link. H2: movedRef/vertical jitter incorrectly suppresses click. H3: auth/router/API rejection; Enter/desktop success and absent pointer navigation requests argue against a shared permission failure.
- Host preflight 23:39 UTC: CPU10%, free memory13300MiB, Node198/browser33. Docker unavailable; isolated frontend component tests do not require Docker. Minimal worker only; no process cleanup outside own work.
- Source: parent capture delayed until horizontal intent beyond 8px; vertical intent lock, cancel restores prior open state, actual gesture click suppressed on capture owner, keyboard and pin inputs preserved. API/DTO/fixture/style/layout contract unchanged.
- RED source unchanged: final harness run 10 failed / 2 passed, exit1, unhandled errors0. Earlier harness assertion failure is retained separately in the same log and excluded from the final RED count.
- GREEN after fix: pointer regression12/12; root narrow pointer + existing community-wave7 combined36/36, exit0 (4.75s). Typecheck tsc --noEmit --incremental false exit0.
- Original pattern gate direct Windows run exit1 because Windows find cannot parse POSIX syntax. Existing Git Bash execSync adapter reran the identical gate, PASS/exit0, gate source SHA unchanged. Failure retained, no gate edits or skipped checks.
- Evidence: original checkout git-ignored tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-2334/{pointer-red.log,pointer-green.log,pointer-combined-green.log,pointer-typecheck.log,pointer-pattern.log,pointer-pattern-posix.log,pointer-validation.json,pointer-pattern-posix-receipt.json}.
- Root inspected QA66 description/repro/environment/comments0 and all four published before/control image pixels; narrow α pointer failure and keyboard/desktop controls preserved. No deployed-after PASS asserted.
- Independent reviewer: /root/review_mdqa_66_pointer, first intended diff4/4 processed, Critical1/Warning0: delayed-capture pending gesture could survive mouse release outside the row and interpret hover or next pin input as the old drag.
- Review fix: new primary input resets prior gesture before button/desktop early returns; movement without primary contact clears pending/captured state, preserving prior open state. Secondary pointer cannot interrupt the active primary gesture. Added actual-component RED4 failed /13 passed → GREEN17/17, exit0 (2.96s); logs pointer-review-red.log and pointer-review-green.log. The original before/fix counts remain historical.
- Independent source/test re-review2/2: prior Critical1 closed, current Critical0/Warning0/Good3/Suggestion0. Approved source blob c113457a9201f24944eaaed56238d3f8d8de70e5 and test blob f75e82ccbdc7faec1e8299ebbcf227fb4c19664b. Exact commit/task/Changeset4/4 recheck pending. No new PR or root merge yet.
- Latest source root validation: 41/41 tests (4.85s), tsc0, POSIX original pattern0, source gate hashes unchanged; final receipt pointer-validation-final.json. Fresh origin/dev b11 unchanged immediately before commit; intended paths4, debt markers0, diff --check0, imports accounted for. Committed-tree narrow rerun follows atomic commit.
- #66 UI claim verified: Kim Songjun / 확인 중, success toast, handling history 2; original description/reproduction/environment/comments0/attachments4 read and saved. Attachment deletion not authorized or performed.
- Dependencies: only new worktree root/app node_modules junctions to existing installed mdqa-65-footer-legal-return → dev-pr-1654-review dependencies; no install or existing tree mutation.
