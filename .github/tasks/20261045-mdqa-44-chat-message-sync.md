# Task 20261045: MD-QA #44 동일 계정 채팅 메시지 동기화

Status: In Progress
**Owner**: root → implementation worker
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/44/

## Context
격리 QA팀의 동일 E2E관리자 계정 두 탭에서 전송한 새 메시지가 저장/새 탭 조회는 성공하지만 기존 다른 탭은64초 이후에도 본문·목록 미리보기를 갱신하지 않는다. #41 고정 설정 UX와 다른 실제 메시지 계약이다. 원 설명·재현·댓글0 확인, active task/worktree/open dev PR 교차검사 중복 없음, root UI선점 김성준·확인 중 및 toast/실제 표시 성공.

## Goal
현재 v1 socket/API 저장 계약을 확인하고 동일 계정의 열린 다른 탭에도 정상 메시지 변경을 전달한다. 기존 타인 수신·발신자 알림 제외·권한·읽음 계약은 유지한다. 실제 RED→GREEN/독립리뷰/dev PR/원 리포트 댓글까지 진행한다.

## Original Conditions (must all be satisfied)
- [x] 원 리포트 상세·최근 댓글·실제 선점 및 중복 진행 확인.
- [x] 가장 좁은 실제 결함·계약 확인 및 수정.
- [ ] 실패하는 회귀→GREEN, 독립 리뷰, committed 검증·dev PR·원 댓글.

## User Scenarios
같은 계정의 서로 다른 탭 A/B에 QA팀 채팅을 열고 A에서 전송한다. B 본문/미리보기에 변경이 나타난다. 발신자의 알림함/푸시는 불필요한 자기 메시지 알림을 만들지 않는다. 다른 활성 수신자에게는 기존 메시지/알림 정책을 유지한다.

## Test Scenarios
- Happy path: persisted message emit to sender user channel and other active recipients.
- Edge cases: 단일 멤버 방, 다중 멤버, mute·entitlement·inactive membership.
- Error paths: 실패한 저장은 emit 없음, 권한 없는 수신자 제외.
- Mock data updates needed: 실제 emit recipients와 알림 recipients의 구분을 기존 좁은 스펙에 sync.

## Parallel Work Breakdown
- Worker initial read-only investigation: backend chat service/spec + realtime gateway, frontend realtime hook/socket tests; 수정 전에 root에게 exact smallest scope 보고.
- Root owns task/Changeset/Git/PR/SSOT/tracker 및 browser evidence.
- Forbidden edits: shared hooks/use-v1-api.ts (#41 owner), frontend types/MSW/provider 및 지정 범위 밖 components, schema/DTO, 다른 WT/automation state, .env. 혼자가 아니므로 타인 변경 되돌리기 금지; stage/commit/push 금지.
- 검증은 root serial slot 승인 이후 최소worker.

## Acceptance Criteria
- [x] 동일 계정 타 탭 변경 event의 실제 계약·권한 보존.
- [x] 발신자 notification/push 제외 및 기존 다른 수신자/mute semantics 보존.
- [ ] narrow RED→GREEN + 독립 리뷰0 + Changeset/task/committed scope.
- [ ] base dev PR 및 기존 #44 댓글 실제 저장 확인.
- [ ] 실제 alpha before/after/console/network는 코드 검증과 구분 (배포 전 pending).

## Tech Debt Resolved
메시지 변경 이벤트와 새 메시지 알림 수신 대상의 누락/혼동을 현재 코드 근거로 정리한다.

## Security Notes
유저 채널 인증·content entitlement·방의 active 참가자 게이트와 저장 실패 의미를 유지한다. 개인 사용자 메시지를 fixture로 복사하지 않는다.

## Risks & Dependencies
origin/dev5948dfd6에서 fetch 직후 managed전용 WT. #41은 별도 focus설정이며 그 열린 feature의 공유 hooks 직접 편집 금지. peer dev-pr-5는1660일정·순위 alpha QA 진행 중이라 root는 동일 시나리오 중복하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report44 | WS/폴링 또는 다른 계정 수신 원인? | 발신자가 chat:message 대상에서 빠져 1인 팀은 이벤트 0건. 목록 구독 누락과 room subtree 중복 invalidation도 실제 소비자/QueryObserver RED로 확인. |

## Progress Snapshot
- WT C:/Users/kinso/.codex/worktrees/mdqa-44-chat-message-sync/matchup-sports-platform; branch fix/mdqa-44-chat-message-sync; base5948dfd6.
- Root evidence report44-before/claimed DOM/screens; source investigation pending, no PR yet.

### 2026-10-08 root validation checkpoint
- Owned source: API chat.service.ts/spec; web use-v1-realtime-socket.ts/test + community-api-clients.tsx import/hook mount + new community-api-clients.message-sync.test.tsx; docs/api/domains/chat.md. Root owns this task and Changeset. Shared use-v1-api.ts remains untouched.
- RED: backend 2 failures (sender channel absent), actual HTTP consumer 2 failures (base/filtered list not refreshed), actual QueryObserver 1 failure (duplicate message request revision3 vs expected2). Initial selector-harness mismatch corrected before the true RED evidence. GREEN API38/38, web43/43, one worker serial. Narrow real consumer test includes real query hooks/MSW HTTP and multi-listener event source, no mocked successful UI completion.
- Root actual alpha BEFORE: E2E관리자, IAB Windows1280x720, 1-member isolated team f39f5962 / chat0737eaac. One labelled QA message stored and visible in sender; receiver had an authenticated websocket with engine heartbeats, but no chat event and still old body/preview after80seconds and input focus. Evidence: original checkout tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/report44-{members,sender-confirmed,receiver-60plus,receiver-focus}-before and receiver events JSON. This is pre-deployment FAIL, not an after PASS. Test-only message intentionally retained for verification; no real conversation or destructive cleanup.
- API/web type checks, unchanged canonical gates, committed verification, exact-head independent review and dev PR remain in progress. Alpha after remains deployment-dependent.

- Precommit: API/web TypeScript PASS; API surface616 and unchanged web pattern gates PASS via existing Git Bash shell adapter (initial mistaken gate path failed before correct package path). Diff/debt/import scope verified9 files. Independent exact commit review and committed regression next.

- Independent frontend review found new unsafe typed-name assertion in regression helper. Replaced Object.entries cast with literal typed names and direct keys/reads access; runtime unchanged. Fresh head review and affected committed hook run required.
