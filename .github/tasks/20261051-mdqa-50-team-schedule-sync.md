# Task 20261051: MD-QA #50 열린 팀 일정 상세·캘린더 최신 상태 복구

Status: In Progress
**Owner**: root → frontend-data-dev
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/50/

## Context
동일 E2E관리자 다중 탭에서 팀 f39f5962-38e9-4a41-9553-6156924c56d1 일정 c57b2eef-abfc-43dd-a867-a60a08a19e6c 제목과 RSVP를 저장한 뒤 다른 상세·캘린더는 이전 제목·참석 수를 유지한다. 실제 포커스 복귀도 회복하지 않고 전체 reload만 회복한다. 작성자가 데이터 복원을 확인했다. 원문 CSS1188×760/alpha/serving SHA 미확인. 저장 실패·데이터 손실은 관측하지 않았다.

## Goal
탭 재활성화 시 실제 일정·참석 데이터를 재조회하여 상세와 목록·캘린더를 갱신하고 실패를 명확하게 보여준다.

## Original Conditions (must all be satisfied)
- [x] 미배정 접수·댓글0, canonical task/활성 실행/worktree/branch/열린 PR 중복 없음 확인.
- [x] root UI ‘내가 처리하기’ 저장 성공·김성준 담당·확인 중 실제 표시 확인.
- [ ] 같은 실행에서 실제 결함·최소 수정·RED→GREEN·독립 리뷰·dev PR·원 리포트 댓글.

## User Scenarios
- 다른 탭에서 제목·RSVP 저장 → 열린 상세 탭 재활성화 → 최신 제목·참석 수.
- 열린 캘린더 재활성화 → 현재 조건과 선택 날짜를 유지하며 최신 제목.
- 조회 실패·권한 실패는 오류와 재시도를 유지하며 저장 성공으로 숨기지 않는다.

## Test Scenarios
- 실제 consumer+QueryClient+HTTP MSW로 이전 응답 hydrate, 서버 상태 변경, focus 이벤트 후 새 요청·새 제목·참석 표시를 검증한다.
- 인증·enabled·ID·필터·오류/재시도·disabled query 계약 유지. hook 호출 옵션 mock만 검증하는 테스트는 주 근거가 아니다.
- 기존 직접 저장 mutation invalidation과 일정 상세·목록 회귀 유지.

## Parallel Work Breakdown
- Wave A 단일 frontend-data-dev Owned: apps/v1_web/src/hooks/use-v1-api.ts의 팀 일정 조회 hooks만; 좁은 신규 팀 일정 focus HTTP 소비자 test. 호출부 변경 필요 시 root에게 exact 경로를 요청한다.
- Forbidden: 다른 도메인 hooks/types/MSW 공유handler/API/DTO/schema/session/provider/다른 WT/정책/state/.env. #45는 별도 WT에서 목록 복귀를 수정 중이므로 동시 공유 구현 금지.
- Wave B consumer 수정이 필요하면 Wave A 완료 후 root가 독립 소유권 지정. Root task/Changeset/브라우저/Git/PR/SSOT 소유.
- 혼자가 아니다. 타인 변경 보존, 자체 stage/commit/push 금지. 테스트는 root 단일 serial slot 승인 뒤 최소 worker.

## Acceptance Criteria
- [ ] 열린 상세·캘린더의 실제 서버 변경을 focus 복귀로 회복.
- [ ] 인증·권한·오류·필터·탐색 상태 보존, 반복 요청 폭주 없음.
- [ ] 실제 RED→GREEN, committed scope/test/type/pattern, exact head 독립 OK/FindingsNone.
- [ ] base dev PR와 기존50 댓글 저장 성공·실제 표시.
- [ ] alpha 실측·persona·viewport·수정 SHA의 미확인 한계를 정확하게 구분.

## Tech Debt Resolved
조회 정책과 실제 탭 복귀 계약의 불일치를 기존 QueryClient 패턴으로 정리한다. 새 전역 정책·polling·가짜 websocket은 추가하지 않는다.

## Security Notes
기존 인증·팀 멤버십·참석/관리 권한을 우회하지 않는다. 사용자 데이터/비밀 출력과 .env 읽기 금지. 전용 QA fixture 원문의 근거만 사용하며 별도 실제 저장은 root가 판단한다.

## Risks & Dependencies
새 managed WT는 fetch 직후 origin/dev de61d66c100c44d2618a14cda1ef15949aa2557a에서 생성. #45 복귀 정책과 #44 채팅 갱신은 다른 증상이다. dev 머지·수정 SHA 배포 전 alpha 해소로 표현하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report50 | 다른 사용자/기기 서버 원인? | 원문은 동일 계정 다중 탭만 검증. 현행 v1 실제 hook/API/consumer 조사로 범위 확정. |

## Progress Snapshot
- WT C:/Users/kinso/.codex/worktrees/mdqa-50-team-schedule-sync/matchup-sports-platform; branch fix/mdqa-50-team-schedule-sync; base de61d66c100c44d2618a14cda1ef15949aa2557a.
- 원문·선점 근거: 원 checkout tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/report50-detail-before-claim.txt, report50-claimed.txt/png.
- root claim 2026-10-08 17:26 KST. 단일 공유 hook worker의 로컬 수정·회귀 검증 완료. 아직 PR 없음.
- 실제 원인: 전역 QueryClient focus 재조회 기본값 false, 일정 list/detail hook에 개별 override 없음. 저장·RSVP mutation은 현재 탭 QueryClient만 invalidate한다. 참석 목록·집계·본인 RSVP는 detail GET에 포함되므로 별도 attendee hook 변경은 필요하지 않다.
- 최소 수정: use-v1-api.ts의 팀 일정 list/detail 조회 hook에 선택적 refetchOnWindowFocus 옵션(default false)을 추가. root가 team-schedules-client.tsx의 읽기 목록·상세 2곳만 always opt-in했다. 편집폼 enabled 호출·초안·기준 버전·전역 provider는 변경하지 않았다.
- 실제 소비자 HTTP RED: 2026-10-08 17:46:30 KST, 신규 use-v1-api.team-schedule-focus.test.tsx 5 FAIL/2 PASS(exit 1, 10.00s). 성공한 실제 PATCH·RSVP PUT과 로컬 invalidation 이후에도 다른 QueryClient의 상세·필터 캘린더 제목/참석이 유지됐고 cached 503·404 오류가 focus에서 노출되지 않았다. 편집 초안/expectedVersion 및 disabled/ID 보호 2건은 통과했다.
- 동일 회귀 GREEN: 2026-10-08 17:55:04 KST, 7/7 PASS(exit 0, 4.78s). fresh/stale 캐시의 실제 상세·필터 캘린더 제목/RSVP 갱신, 선택 달·날짜·필터 유지, edit 초안+expectedVersion 0 충돌 보호, disabled/ID guard, cached 503 재시도, cached 404 권한 exit를 검증했다.
- 명령(apps/v1_web 기준): bundled node.exe node_modules/vitest/vitest.mjs run src/hooks/use-v1-api.team-schedule-focus.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose. RED/GREEN 원문: tmp/qa/mdqa-50-team-schedule-red-20261008.txt, tmp/qa/mdqa-50-team-schedule-green-20261008.txt.
- preflight RED CPU43%/free10.79GiB/Node62/browser10/Docker0, GREEN CPU37%/free10.98GiB/Node64/browser10/Docker0. 테스트 프로세스 종료 후 serial slot 반환. touched hook 구간·신규 test의 TODO/FIXME/HACK/XXX 없음.
- 기존 제한: 실제 편집폼의 TextField action prop이 input으로 spread되어 React 경고가 출력된다(primitives.tsx); 이번 소유 범위 밖이며 억제하지 않았다. root의 type/pattern·committed scope·Changeset·독립 리뷰·dev PR·alpha 실측은 아직 대기 중이다. 이 로컬 결과만으로 alpha 해소를 선언하지 않는다.
- Root 18:00–18:04 KST: 명시5경로 commit8b94e5592 후 dev9edd47d를 무충돌 통합한 eb96dc3c3에서 committed 신규7+기존 일정29=36/36 PASS, 웹 TypeScript·기존 패턴 게이트 PASS. 최초 dirty hook의 dev 통합은 Git이 안전하게 거부했고 변경을 보존한 채 scoped commit 후 통합했다. 공유 chat 변경은 dev 그대로 보존됐다.
- Changeset·모든 import·committed5파일 범위·diff --check 확인 완료. exact final head 독립 리뷰와 PR 게시·tracker 댓글·수정 SHA 배포 후 alpha 실측은 후속 단계다. 코드 검증은 alpha 해결 PASS를 뜻하지 않는다.

### CI follow-up checkpoint — 2026-10-08 18:43 KST
- 열린 PR #1672의 c288d1c에서 dev·다른 PR과 동일한 기존 return consumer CI 실패를 조사했다. merged #45 브랜치는 수정·push하지 않았다. 실패 로그는 원 checkout의 tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/pr1672-web-failed.log:3141 이후이며, browser Back의 DOM에는 TRAINING/SCHEDULED 카드·from이 이미 맞지만 전역 client.isFetching()이 1이었다.
- 원인 근거: 상세의 실제 useV1AuthMe는 fixture 401에 재시도한다. hook의 retry:undefined가 테스트 client default retry:false를 덮고, TanStack 기본 재시도·AbortSignal 미소비 query는 unmount 후 cancelRetry만 수행하여 타이머/진행 중 HTTP가 남는다. 현재 목록의 응답 완료와 비활성 상세 요청까지 포함하는 전역 idle 관찰이 섞였다. CI 로그에는 당시 query key가 없어 아래 동일 소스의 통제 재현으로 수명을 실증했다.
- Product/shared source는 그대로 두고 기존 team-schedules-return.test.tsx에 실제 HTTP 재현 1건을 추가했다. 첫 auth 401 → 실제 두 번째 GET 재시도, observer 0 + fetching인 비활성 auth와 browser Back 후 활성 목록 GET을 각각 보류한다. fixture retryDelay:0은 재시도 대기 시간만 줄이며 401·두 HTTP 요청·query/navigation 구현은 그대로다. 목록 HTTP를 보류한 동안 완료 false, 실제 새 제목 응답이 도착한 뒤에도 global fetch 1인 상태를 확인한다.
- RED: 18:42:11 KST, 신규 1 FAIL/18 skipped, exit 1, 4.78s(test 1.40s), 원 CI와 같은 idle()의 expected 1 to be 0. tool output e4134b. API/nav/harness 실패와 unhandled request 경고 없음.
- 최소 수정: idle()가 현재 화면의 실제 활성 queries에 대해 isFetching({ type: 'active' }) === 0을 기다리도록 변경했다. 실제 응답·URL/API type/state·선택 버튼·표시/제외 카드·지연 중 미완료 assertions를 유지했다. timeout 확대·expect 제거·skip·mock success 없음.
- GREEN: 18:42:51 KST, 동일 파일 전체 19/19 PASS, exit 0, 7.74s(test 4.43s), tool output 47a533. 신규 응답 수명 회귀와 원 browser Back·no-month history·placeholder·달/날짜·오류 계약 모두 통과했다. 명령은 apps/v1_web에서 bundled node.exe node_modules/vitest/vitest.mjs run src/components/team-schedules/team-schedules-return.test.tsx [-t '상세 auth 재시도' (RED만)] --maxWorkers=1 --no-file-parallelism.
- Preflight CPU40%/free10.65GiB/Node69/Edge7/Docker0, 3013/8121 listener 없음. 직렬 검증 slot 반환 완료. worker 변경은 승인된 return spec과 이 Progress Snapshot뿐이며 Git/browser/.env/다른 source 변경 없음. touched spec TODO/FIXME/HACK/XXX 없음; root의 committed 타입/패턴·재리뷰·동일 PR 갱신·CI 확인은 후속 단계다.

### Window focus follow-up checkpoint — 2026-10-08 19:13 KST

- #41 재발 조사에서 설치된 @tanstack/query-core 5.102.8의 기본 focusManager가 visibilitychange만 듣고 window focus를 듣지 않는 실제 경로를 확인했다. #50도 always 옵션만 있어 문서가 계속 visible인 창 복귀를 검증할 필요가 있었다. 기존 성공한 visibility 회귀를 실제 window blur/focus로 확장했다.
- Source-unchanged RED(18:58:19): 승인된 hooks/use-v1-api.team-schedule-focus.test.tsx 6 FAIL/7 PASS(13), exit1,11.63s. 실제 다른 QueryClient에서 PATCH·RSVP PUT과 현재 탭 invalidation은 성공했지만 focus 복귀의 fresh/stale 상세·필터 캘린더 제목/참석 갱신2, cached list/detail503 오류2,404 권한 exit1, hidden 보호 후 visible focus 최신화1이 실패했다. visibility·edit dirty draft/expectedVersion0·disabled/emptyID는 통과했다. query/view/HTTP harness 실패는 없었다.
- Root가 #41의 generic helper prerequisite commit을 안전하게 feature-merge한 HEAD aef4053c7에서 수정했다. helper를 새로 복사·이름 변경·편집하지 않았고 기존 chat2호출/CI repair/return spec을 보존했다. Worker 제품 변경은 use-v1-api.ts의 팀 일정 list/detail2query만 const query → useV1WindowFocusRefetch → return query로 연결했다. 각 query의 동일 Boolean IDs/options.enabled와 refetchOnWindowFocus default false를 유지한다. 편집폼 호출·초안·기준 버전·provider/API 계약은 변경하지 않았다.
- 최종 GREEN(19:12:07): 6파일102/102 PASS,exit0,60.34s. team focus13 + return19 + empty14 + route29 =75건, 같은 공용 helper의 chat focus/consumer27건도 통과했다. fresh/stale×visibility/window focus에서 실제 저장 제목·RSVP·참석 및 서버 type/state filter와 캘린더 달/선택 날짜를 확인했다. cached503 실제 오류·재시도,404 권한 exit,dirty draft/expectedVersion0,disabled/emptyID,hidden,read-only unmount 후 fresh cached edit의 nofetch를 유지한다. chat 의존 회귀는 Home defaultfalse·계정 비활성화/unmount listener cleanup 및 simultaneous visibility+focus의 inflight GET1/abort없음을 증명했다.
- exact command(apps/v1_web cwd): bundled node.exe node_modules/vitest/vitest.mjs run src/hooks/use-v1-api.team-schedule-focus.test.tsx src/components/team-schedules/team-schedules-return.test.tsx src/components/team-schedules/team-schedules-empty.test.tsx src/app/teams/[id]/schedules/team-schedules.test.tsx src/hooks/use-v1-api.chat-focus.test.tsx src/hooks/use-v1-api.chat-refresh-consumer.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose. DEBUG_PRINT_LIMIT=200. RED log tmp/qa/mdqa-50-window-focus-red-20261008.txt; GREEN 전체 stdout/stderr는 Tee로 tmp/qa/mdqa-50-window-focus-green-20261008.txt에 저장했다.
- Preflight RED CPU64%/free10.26GiB/Node72/browser7/Docker0. GREEN 직전 CPU100%/free6.66GiB/Node189/browser7/Docker0,3013/8121 listener0의 급증을 root에게 먼저 보고했고 root가 명시 승인한 좁은102회귀만1worker로 실행했다. 다른 process 정리·stop은 하지 않았고 OOM/서비스 실패도 없었다. 최종 test process 종료·serial slot 반환 완료. touched team hook 구간과 spec(pure241)에 새 debt/debug marker 없음.
- Worker scope는 팀2query/spec/canonical Snapshot뿐이다. Git writes/typecheck/build/full suite/browser/.env/공용 helper 수정은 하지 않았다. 기존 TextField action prop React 경고는 억제하지 않고 보존했다. root의 committed diff/type/pattern/Changeset/최신 head 독립 리뷰/같은 OPEN PR1672 갱신 및 수정 SHA alpha 실측이 후속 gate다. 실제 alpha window focus/visibility 이벤트·serving SHA를 이번 로컬 검증에서 확인하지 않았으므로 alpha 해소 PASS로 표현하지 않는다.
