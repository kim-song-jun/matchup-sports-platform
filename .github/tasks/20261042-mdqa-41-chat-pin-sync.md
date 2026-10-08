# Task 20261042: MD-QA #41 채팅방 고정 상태 탭 복귀 동기화

Status: In Progress
**Owner**: root → frontend-data-dev
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/41/

## Context
동일 계정의 두 열린 탭에서 한 탭의 고정 변경이 다른 탭에 55초 동안 반영되지 않고 새로고침 후 일치했다. 실제 상세 댓글 0, 미배정 접수를 root가 UI로 선점하여 김성준·확인 중 저장 성공을 확인했다. 현재 열린 dev PR과 canonical task에 같은 수정은 없다.

## Goal
채팅 목록/상세의 개인 고정 상태가 탭 복귀 시 실제 서버 상태와 일치하도록 최소 수정하고 dev PR과 원 리포트 댓글까지 게시한다.

## Original Conditions (must all be satisfied)
- [x] 담당자 필터 없는 미완료·접수 전체에서 원 설명과 재현 조건을 읽는다.
- [x] root 선점 후 김성준·확인 중 실제 표시를 확인한다.
- [x] 기존 API와 계정 권한을 유지하고 탭 복귀에서 최신 고정/해제 상태를 읽는다.
- [ ] 실제 실패하는 좁은 회귀 검증, 독립 리뷰, committed-tree 검증을 완료한다.
- [ ] feature branch push와 base dev PR 및 기존 #41 댓글을 확인한다.

## User Scenarios
같은 계정으로 채팅 탭 A/B 목록 로딩을 완료한다. A에서 고정한 뒤 B로 복귀하면 최신 고정 상태를 본다. A에서 해제하고 B로 복귀하면 해제 상태를 본다. 메시지 전송 없이 테스트 후 원 상태로 복구한다.

## Test Scenarios
- Happy path: 실제 query hook/focus contract에서 고정과 해제 모두 최신 데이터 반영.
- Edge cases: fresh 캐시, enabled=false, room/list 구분 및 필터 캐시.
- Error paths: 실제 refetch 실패를 숨기거나 성공 데이터로 만들지 않는다.
- Mock data updates needed: 계약이 동일하므로 새 회귀 fixture만 필요하며 API/DTO/MSW 전역 계약 변경은 없다.

## Parallel Work Breakdown
- Frontend data (single owner): `apps/v1_web/src/hooks/use-v1-api.ts`, 그 채팅 회귀 스펙과 필요시 좁은 기존 realtime hook/spec. 먼저 원인과 정확한 변경 경로를 보고한다.
- Root: task/Changeset, Git/PR, tracker UI, #40 중복 대조 및 독립 #42 조율.
- Forbidden: API/DTO/schema, global provider 정책, 다른 route page, 다른 자동화 SSOT, .env, 타인 WIP. Root 승인 exact pathspec 없는 self-commit 금지.
- Independent review and verification serial after implementation. Alpha 검증은 dev 머지/실배포 확인 후 진행한다.

## Acceptance Criteria
- [x] 고정 및 해제 최신화 RED → GREEN 증거.
- [x] 기존 채팅 권한·목록·오류 계약 유지 (cached consumer 오류·복구 검증 포함).
- [ ] 범위 내 검증 PASS 및 Critical/Warning 0 독립 리뷰.
- [ ] task, Changeset, intended/committed diff scope 일치.
- [ ] PR/원 리포트 댓글 게시 실제 확인.
- [ ] 실제 alpha 동일 계정 2탭 검증 (미머지는 대기로 명시).

## Tech Debt Resolved
복귀 시 개인 상태 캐시가 오래 유지되는 채팅 query 설정을 바로잡았다. fresh 캐시도 실제 서버 상태를 다시 읽으며, 기존 filter key/params와 enabled guard는 유지한다. touched 두 hook에 TODO/FIXME/HACK/XXX/any는 없고 새 marker도 없다.

## Security Notes
현재 인증과 서버 권한을 유지한다. 계정/채팅 데이터 broadcast 또는 로컬 영구 저장을 도입하지 않는다. 비밀과 .env를 읽지 않는다.

## Risks & Dependencies
실시간 다중 탭 동기화 요구사항은 원 제보에서 미확인이다. 명시된 대안인 탭 복귀 refetch를 우선 조사한다. 코드/CI를 실제 alpha PASS로 표시하지 않는다. 최신 origin/dev `5948dfd6b69e5f62a0e6c8f9f2de1ae38f7abf97` 기반 전용 managed worktree.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report #41 | 열린 비활성 탭 즉시 동기화가 필수인가? | 원 제보는 UX 개선이며 탭 복귀 최신화를 대안으로 명시. 먼저 그 최소 계약을 증명한다. |

## Progress Snapshot
- 0550 실행: 원 리포트/선점 성공 DOM와 screenshot은 원 checkout `tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/report41-claimed.*`.
- Dedicated worktree: `C:/Users/kinso/.codex/worktrees/mdqa-41-chat-pin-sync/matchup-sports-platform`.
- Branch: `fix/mdqa-41-chat-pin-sync`; base dev 5948dfd6. PR/수정/검증 아직 대기.
- Frontend investigation: `lib/query-client.ts`는 `staleTime: 60_000`, `refetchOnWindowFocus: false`. 목록/상세 chat query에 override가 없고, 개인 pin PATCH는 같은 탭 QueryClient만 invalidate한다. Backend `ChatService.updateMe`는 participant 저장 후 응답하며 pin realtime emit이 없다.
- 조사 가설: (1) 서버 저장 실패는 새로고침 후 일치/실제 PATCH 계약으로 기각, (2) B의 query 복귀 재조회 누락은 기본 focus false로 확인, (3) realtime pin 전달 누락은 updateMe와 message/safety listener 확인. 대안으로 명시된 focus refresh를 두 chat query에만 적용한다.
- 예정 변경/검증 artifact: `hooks/use-v1-api.ts` 두 query 옵션과 `hooks/use-v1-api.chat-focus.test.tsx` HTTP MSW 회귀. 임시 debug instrumentation, 서버, browser, Git 변경은 만들지 않는다. 테스트의 MSW/QueryClient/focus/environment는 teardown한다.
- Preflight: CPU 71%/12 logical cores, free memory 14.05/31.91 GiB, Node 33/Edge 10; Docker daemon 미가동. 서버가 필요 없는 jsdom/MSW 단일 worker 검증만 실행하며 root가 준비한 기존 의존성을 사용한다.
- RED (15:04:01 local): `apps/v1_web`에서 bundled Node v24.19.0으로 `node_modules/vitest/vitest.mjs run src/hooks/use-v1-api.chat-focus.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose`. 5 failed / 1 passed (8.25s). 고정 `expected false to be true`, 해제 `expected true to be false`; HTTP503 probe도 refetch되지 않아 `isRefetchError` false. imports나 harness 오류 없이 복귀 시 기존 캐시 유지가 재현됐다.
- GREEN (15:04:43 local): 같은 명령 6 passed (3.15s). 목록, 실제 filter params(`roomType=team&status=active&limit=50`), 상세 모두 fresh/stale × 고정/해제 최신화. signed-out `enabled=false`/빈 room idle, 실패의 HTTP503·SERVICE_UNAVAILABLE/기존 캐시 유지도 확인했다. 직전 preflight CPU57%, free13.71GiB, Node41/Edge10.
- 구현 경로: `apps/v1_web/src/hooks/use-v1-api.ts` 두 chat query `refetchOnWindowFocus: 'always'`와 이유 주석; `apps/v1_web/src/hooks/use-v1-api.chat-focus.test.tsx` 신규 6-case 실제 query/API/focus 회귀. Global provider/API/DTO/MSW 계약 변경 없음. 외부 영속 저장/broadcast 추가 없음.
- 제한/남은 gate: active query가 있는 탭 복귀 최신화를 증명했다. 비활성 탭에서 즉시 broadcast하지 않는다. lint/full suite/독립 리뷰/committed-tree/Changeset/PR은 root 후속 gate이며 alpha 2탭 실측은 dev 머지·배포 후 대기다. 임시 instrumentation/서버/브라우저는 생성하지 않았고 테스트는 client/MSW/visibility/env를 teardown했다.
- 독립 리뷰 `0b1dfe872` followup: cache가 있으면 `community-page.tsx`의 list `!hasRooms`/detail `messages.length === 0` 조건이 ErrorState를 숨긴다. detail model은 error여서 composer는 잠기는데 오류/재시도는 보이지 않는다. filteredQuery 실패도 list model이 base query만 보아 숨기며, cached endedQuery의 data 우선 status도 archived 실패를 숨긴다.
- 후속 분담: frontend-data 소유는 `hooks/use-v1-api.chat-refresh-consumer.test.tsx`/task evidence. `components/**` 수정은 frontend-ui worker가 담당한다. 실제 ChatListPageClient/ChatRoomPageClient + QueryClient/MSW/visibilitychange로 base/filter/archived failure와 retry, cached detail503의 입력 복구, detail403의 접근 거절/목록 이동을 검증한다. hooks/consumer/views는 mock하지 않으며 Next navigation과 외부 Socket 연결만 fixture한다. RED 실행/실제 UI 수정은 root serial slot 순서를 기다린다.
- Consumer RED (15:18:18 local): `apps/v1_web`에서 bundled Node로 `node_modules/vitest/vitest.mjs run src/hooks/use-v1-api.chat-refresh-consumer.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose`, 5 failed (9.13s). 실제 cached DOM이 남아 있지만 `Unable to find role="alert"`; import/fixture 오류 없이 숨은 오류가 재현됐다. 직전 CPU14%, free14.06GiB, Node27/Edge10, Docker daemon 미가동.
- Consumer GREEN (15:22:16 local): 동일 serial worker로 `... run src/hooks/use-v1-api.chat-focus.test.tsx src/hooks/use-v1-api.chat-refresh-consumer.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose`, 2 files / 11 passed (6.63s). base/filter/archived cached 실패의 표시·실제 재시도·최신 서버 데이터, cached 상세503의 표시/스크롤 상단 유지/재시도 후 composer 복구,403 권한 거절·목록 이동·network retry 미노출 모두 PASS. 초기 query/read mutation 완료 후 실패를 주입한다. 직전 CPU21%, free13.83GiB, Node27/Edge10.
- 후속 범위의 UI 수정은 frontend-ui worker가 `community-api-clients.tsx`, `community-page.tsx`에서 수행했다. data worker는 신규 소비자 회귀 스펙과 task만 수정했다. 길어진 대화의 browser geometry/ResizeObserver는 jsdom fixture이며 alpha viewport 증거를 대체하지 않는다. 실제 서버/Next/브라우저/메시지 전송/계정 변경/Git mutation은 실행하지 않았고 root에 serial slot을 반환했다.
- Root typecheck first exposed redundant `status !== error` after narrowed ErrorState ternary. Removed only the two unreachable comparisons; incremental tsc rerun PASS and unchanged pattern gate PASS. Consumer cases remain actual failure/retry, final committed 11-case rerun pending. Initial0b1d reviewer Critical cached-error failure addressed; exact followup head re-review required.

- Root publication: PR https://github.com/kim-song-jun/matchup-sports-platform/pull/1662, base dev OPEN/head e36a187ef887ce3df6699897e05531421dcf3400. final committed focus6+consumer5=11/11;tsc/pattern PASS. latesthead frontend re-review7/7 Critical0 Warning0 OK/FindingsNone. Fresh fetch origin/dev5948 drift0 behind; committed scope verified and final tests passed before task progress-only WIP. IAB existing tracker comment https://teameet.jmandu.kr/issues/41/#comment-104 save toast+actual text+screens verified. Copilot auto requested once/latesthead CI pending at publication. No root merge; actual alpha-after pending.


- External review e36 followup: Copilot archived-only error/filtered initial skeleton 및 Codex Home focus 정책/failed base retry의 실제 4 findings 확인. archived 오류는 해당 section ErrorState와 별도 retry로 분리, cached filtered 로딩은 base pending만 skeleton, focus always는 chat list 소비자 3곳 opt-in이며 Home 기본 false 유지, filtered retry는 실패한 base도 복구.
- Followup RED logs: tmp/qa/mdqa-41-followup-red-20261008.txt (2 FAIL/4 PASS) 및 mdqa-41-codex-followup-red-20261008.txt (2 FAIL/12 PASS). 최종 GREEN14/14 7.54s, worker1/no-file-parallelism, CPU51%,free12.23GiB. tmp/qa/mdqa-41-followup-green-20261008.txt. 실제 HTTP/consumer/query를 통한 동일 계정 focus/503/403/재시도/보관 section/홈 noforced read 검증.
- Root followup intended diff 7files 확인. committed 타입/패턴 및 최신 base 통합 후 독립 재리뷰/동일 PR push 대기. 과거 head OK는 새 head의 OK로 사용하지 않음. alpha after는 여전히 배포 후 대기.
- Exact e2eb 독립리뷰 Warning falseEmpty: base 첫50개에 선택 category row가0이고 filtered 첫조회 pending이면 ready/Empty/매치 CTA가 표시됨. 새 실제 deferred HTTP consumer RED1 FAIL → GREEN focus7+consumer8=15/15 8.07s. fallback cached rows가 있을 때 skeleton 미중첩도 유지. status는 base pending 또는 active pending + visibleRooms0일 때만 loading.
- 승인된 test-only fixtures 분리로 consumer pure247/helper47. 신규 hooks/use-v1-api.chat-refresh-consumer.fixtures.ts import와 commit scope 포함. 실제 query/consumer/view/API는 mock하지 않음. evidence tmp/qa/mdqa-41-falseempty-{red,green}-20261008.txt. 타입 문제 optionalErrorMessage는 기존 generic ErrorState 문구 fallback으로 해결. 최신 committed/type/pattern/재리뷰 후 같은1662 update 예정.