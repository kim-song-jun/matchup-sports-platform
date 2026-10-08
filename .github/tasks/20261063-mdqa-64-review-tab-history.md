# Task 20261063: QA #64 마이 리뷰 브라우저 이력의 선택 탭 복원

Status: In Progress
Owner: root / scoped frontend worker
Created: 2026-10-09

## Context
[기존 리포트 #64](https://teameet.jmandu.kr/issues/64/)에서 written → received → 브라우저 뒤로가기 후 URL은 written이나 선택 탭·내용은 received로 남는다. 새로고침하면 일치한다. root가 현재 미배정·접수·댓글0, 대응 task/branch/WT/열린 PR 없음과 peer의 별도 대진 QA를 교차 확인한 뒤 UI 내가 처리하기로 김성준·확인 중을 저장하고 실제 표시를 확인했다.

## Goal
유지된 마이 리뷰 소비자가 URL/서버의 탭 변경을 받아 선택 표시·실제 데이터·내용을 함께 복원하고 기존 낙관적 탭 선택과 권한·오류 경로를 보존한다.

## Original Conditions
- [x] 같은 consumer가 유지되는 written → received → written 이력 복귀를 복원한다(local consumer 검증).
- [x] pending/written/received 탭과 실제 조회 계약을 유지한다(local consumer 검증).
- [ ] 실제 소비자·HTTP 회귀 RED→GREEN, 독립 리뷰, 커밋 검증, dev PR, 기존 리포트 댓글까지 진행한다.
- [ ] dev 머지/배포 후 실제 alpha AFTER를 별도 기록한다.

## User Scenarios
1. written에서 received 선택, 브라우저 뒤로가기·앞으로가기 시 주소와 선택 표시/내용이 일치한다.
2. pending 및 기본/잘못된 tab URL은 기존 서버 정규화와 일치한다.
3. 탭 조회 실패는 기존 오류·재시도를 제공하고 다른 탭 전환 후에도 실제 데이터를 요청한다.

## Test Scenarios
- [x] 실제 ReviewsPageClient + QueryClient/MSW로 mounted route/initialTab 변경과 선택 표시·HTTP tab 검증.
- [x] populated/empty 데이터, received 분기 및 pending/written 복귀, 빠른 선택과 stale route 업데이트 검증.
- [x] 실제 조회 오류 및 retry 경로 보존, fixture cleanup.
- [x] 기존 관련 review consumer/view 테스트 최소 영향 회귀.
- API/DTO/schema/MSW shared 계약 변경 없음. test-only inline 또는 own fixture만 사용.

## Parallel Work Breakdown
- Frontend worker Phase2: unchanged source RED → 최소 구현 → narrow GREEN → task evidence/Changeset.
- Root Phase3: types/pattern/committed scope/imports/dev drift/exact-head independent review/Git/PR/tracker/SSOT.
- Owned: apps/v1_web/src/components/reviews/reviews-api-clients.tsx; new reviews-page-history.test.tsx and own test-only fixture if necessary; this task; one .changeset/mdqa-64-review-tab-history.md.
- Forbidden: hooks/types/sharedMSW/API/DTO/schema/other routes/tokens/shared components/policies/state/Git mutation. Not alone; never revert others or self-commit. Root alone owns Git/integration.

## Acceptance Criteria
- [x] URL 복귀의 선택 표시·내용·실제 조회가 일치한다(local consumer 검증).
- [x] API/auth/period/error/retry 계약 유지, global fallback/polling 없고 새 dependency 없음.
- [ ] RED evidence is actual failing contract, GREEN committed-tree evidence, Critical0/Warning0 exact-head review.
- [x] 기존 DESIGN.md·v1 reference·tokens 준수, markup/style 새 디자인 없음.
- [ ] 한국어 base-dev PR 및 같은 #64 댓글 저장/실제 표시 확인.

## Tech Debt Resolved
초기값에만 연결된 local tab의 이력 복귀 drift를 현재 URL과 함께 저장하는 선택 상태로 수정했다. 클릭의 즉시 반영을 유지하고 URL 변경 렌더부터 실제 조회도 맞추며, 늦은 RSC 초기값은 최신 선택을 덮지 않는다. touched-path TODO/FIXME/HACK/XXX 0개, 새 marker 없음.

## Security Notes
조회 권한·인증·리뷰 작성/전송은 변경하지 않는다. 테스트 데이터와 GET만 사용, alpha 리뷰 쓰기 금지.

## Risks & Dependencies
Next route/initialTab와 optimistic local tab의 stale acknowledgement를 구분해야 한다. Query/view/HTTP를 mock하여 오류를 숨기지 않는다. 배포 전 코드 PASS가 실제 alpha AFTER를 대신하지 않는다. 브라우저 재현은 현재 계정의 빈 상태/CSS1180×757만 보고됐으며 다른 persona/viewport 데이터는 미검증이다.

## Ambiguity Log
2026-10-09 root: 구현 초기값 useState(initialTab)은 prop 복귀를 반영하지 않음. route URL 구독·prop 동기화의 가장 작은 올바른 seam은 worker가 actual navigation consumer/HTTP RED로 검증한다. 기존 source/주요 QueryClient freshness·history을 보존한다.

2026-10-09 worker: 현재 URL의 tab을 서버 page와 같은 written/received/pending 규칙으로 정규화하고 local 선택에 URL 기준을 함께 둔다. 단순 initialTab effect는 늦은 RSC가 최신 선택을 덮을 수 있어 현재 URL을 복원 기준으로 사용한다. 화면·레이아웃·정보구조 변경이 없는 로직 수정으로 CLAUDE.md UI 착수 규칙의 로직 전용 예외에 해당한다. 실제 Next 브라우저 이력은 root alpha AFTER에서 별도 확인한다.

2026-10-09 independent followup: 실제 Next는 중복 `tab` query를 server searchParams에 string[]로 넘겨 기존 strict compare가 pending으로 정규화하지만 client get('tab')은 첫 값만 인정했다. server route/type은 수정하지 않고 client의 getAll('tab') 길이가 1일 때만 유효 scalar를 인정하여 기존 정규화를 보존한다. 실제 배열 전달을 재현하기 위해 test seam의 배열 분기에만 route의 좁은 선언 타입을 unknown 경유해 보완했으며 실제 route 실행과 DOM/HTTP assertion은 약화하지 않았다.

## Progress Snapshot
- Root Phase3 2026-10-08 20:21 UTC: duplicate-tab 보완 후 TypeScript exit0 및 원본 v1 pattern gate exit0. Windows에서는 원본 gate가 요구하는 child-process shell만 Git Bash로 지정했으며 gate SHA256 전후595985B17416A2E3990EB9027237A9E909BDECDAE5780E777E758398470D7BB4 동일, checks/source 변경 없음. `tmp/qa/mdqa-64/root-gates-result.json`, `root-types.txt`, `root-patterns.txt`; preflight CPU/free memory/Node/browser/Docker/target ports 확인 후 단일 직렬 실행 및 자연 종료.
- Root fresh fetch origin/dev 78ee726909d9fc6e4bc41a9a2d54b9952b9e03e7와 이 WT base 일치, drift0. owned4 path/import scope 및 diff-check 확인. 독립 review2·커밋 기준19·최종 exact-head review·base-dev PR·tracker 게시는 다음 단계, 실제 alpha AFTER는 pending.
- 독립 리뷰 후속 duplicate-tab 경계 수정 완료: `?tab=written&tab=received`와 `?tab=received&tab=received` 각각 실제 async server route string[]→client 최초 표시 및 같은 mount 이력 복귀를 검증했다. 최초 reviewed product 유지 상태에서 RED4FAIL/8PASS(12 consumer,3.46s,exit1); 기존8 전부 PASS, 신규4는 pending active 부재로 실패했다. `tmp/qa/mdqa-64/red-duplicate-tab.txt`, 2026-10-08T20:19:36.3407695Z~20:19:41.5158379Z(10-09 05:19KST). unchanged reviewed source SHA256 `33C5EC56F094F57C94A1366658AAFC686F5B81FB046E59A826F251416D28E03E`, head는 root task의 base78ee7269만 기록하고 Git 직접 확인 없음.
- 최소 후속 source는 client getAll('tab')와 length===1 guard/이유 주석뿐이다. duplicate는 첫 값을 고르지 않고 pending으로 맞추며 scalar/default/invalid/빠른 선택/period/기존 query 계약은 유지한다. test helper만 URL duplicate encoding와 actual server array 전달을 지원하고 new case4를 추가했다. server route·types/hooks/API/sharedMSW/markup/style/Changeset에는 후속 변경 없음.
- 후속 최종 clean GREEN19/19(consumer12+기존 impact7,7.90s,exit0,warning0). 신규 duplicate4는 pending 선택·본문·실제 GET tab=pending을 검증하고 기존15 전부 유지했다. `tmp/qa/mdqa-64/green-duplicate-tab-impact.txt`, 2026-10-08T20:20:04.7936609Z~20:20:14.3328273Z(10-09 05:20KST). RED는 아래 기존 history 1파일 명령, GREEN은 아래 기존 history+impact 4파일 명령과 동일한 --maxWorkers=1 --no-file-parallelism이다. 실제 Next URL/RSC seam만 제어하는 local consumer 증거이며 전체 Next SSR/browser/alpha PASS를 대신하지 않는다.
- 후속 preflight 2026-10-08T20:18:35.6345887Z: CPU11%, free physical14519MiB/virtual16920MiB, Node194/browser24, Docker daemon absent(exit1), 동일 대상 local listener0. `preflight-duplicate-tab.txt`와 `final-duplicate-tab-hashes.txt`에 증거 보존. 모든 테스트 자연 exit/기존 fixture cleanup, 외부 프로세스 종료 없음, serial slot 반환 완료. touched code/test markers0. root 선행 type/pattern PASS 이후 제품 추가 수정이므로 root 재검증·새 exact-head 독립 리뷰·committed/PR/alpha gate 대기.
- Phase2 local 구현/검증 완료, root committed-tree/type/pattern/exact-head 독립 리뷰·Git/PR·tracker·alpha AFTER 대기. dev 머지 또는 alpha PASS로 간주하지 않는다.
- Owned 변경 4개만: `apps/v1_web/src/components/reviews/reviews-api-clients.tsx`, 새 `reviews-page-history.test.tsx`, 이 task, `.changeset/mdqa-64-review-tab-history.md`. inline typed fixture만 사용하고 별도 fixture/shared hooks/types/MSW/API/route/tokens/state/dependency 변경 없음. Git command/mutation·browser·local server·install·fullsuite·build·tsc 실행 없음.
- source-unchanged actual RED7FAIL/1PASS(8 cases,3.24s,exit1): 실제 async `/my/reviews/page` 정규화→동일 mounted ReviewsPageClient/View/SegmentedTabs→실제 hooks/API/QueryClient→MSW 조회에서 URL 이력 변경 후 선택 탭이 이전 값에 남았다. quick-click 기존 낙관 선택은 PASS하여 그 계약도 보존한다. mount identity를 같은 nav DOM으로 확인하여 재마운트로 버그를 숨기지 않는다. 증거 `tmp/qa/mdqa-64/red-history.txt`; 2026-10-08T20:11:05.1339373Z~20:11:09.8706849Z(10-09 05:11KST).
- RED 명령(`apps/v1_web` cwd): `pnpm exec vitest run src/components/reviews/reviews-page-history.test.tsx --maxWorkers=1 --no-file-parallelism`. root task의 base/head `78ee726909d9fc6e4bc41a9a2d54b9952b9e03e7`를 로그에 기록했다(worker Git 금지로 직접 HEAD 검증 없음). unchanged source SHA256 `BE3812CEAD498E41F069C7D1CF8F5889F8644303CEA8427A085436FFAC2E6963`.
- 최소 client 수정: 현재 URL을 구독하고 선택 상태에 기준 URL 탭을 함께 저장한다. route 변경 렌더에서 active 표시와 enabled 조회를 함께 복원하고, 클릭 즉시 선택은 유지한다. initialTab을 늦게 다시 동기화하여 최신 URL을 덮지 않는다. period/teamPeriod·QueryClient freshness·권한/summary enabled·retry·markup/style은 유지한다.
- 최종 clean GREEN15/15(새 consumer8+기존 tabs2/received-empty3/wave6state2,7.45s,exit0). populated written→received→back/forward의 실제 written 재GET·내용, empty pending복귀, default/invalid URL의 실제 서버 정규화2, written/received 503→실제 retry2, 빠른 received→pending 후 stale RSC, 관리 팀/사용자 별도 summary period와 credentials include를 검증했다. hooks/view/fetch 함수를 mock하거나 요청 spy로 대신하지 않으며 모든 API 요청은 실제 v1Api fetch를 지나 MSW 응답을 소비한다. Next URL/RSC 전달만 제어한다. 실제 앱 staleTime60초를 유지하며 오류 retry 자동 반복만 test QueryClient에서 끈다.
- GREEN 명령: `pnpm exec vitest run src/components/reviews/reviews-page-history.test.tsx src/components/reviews/reviews-page-tabs.test.tsx src/components/reviews/reviews-received-empty.test.tsx src/components/reviews/reviews-wave6.test.tsx --maxWorkers=1 --no-file-parallelism`. 첫 GREEN15(7.41s,exit0)의 상대경로 client-error reporter 요청에 ancillary MSW handler 경고가 있어 own test-only log endpoint를 보완한 뒤 동일 narrow command를 1회 재검증했다. 최종 warning0, 증거 `tmp/qa/mdqa-64/green-history-impact.txt`, `green-history-impact-clean.txt`; clean 2026-10-08T20:12:38.7534298Z~20:12:47.6887548Z(10-09 05:12KST).
- Preflight 2026-10-08T20:10:56.0044791Z: CPU5%, free physical14744MiB/virtual17046MiB, Node194/browser24, Docker daemon absent(exit1), 대상 local ports3013~3029/8120~8129/8220~8229 리스너0. 이 검증은 MSW unit consumer이며 대상 실제 서버를 띄우지 않았다. `tmp/qa/mdqa-64/preflight.txt`와 `final-source-hashes.txt`에 runtime/source 기록. MSW listen/close/reset, React cleanup, QueryClient clear, localStorage/history/env/mock cleanup 완료; 생성한 테스트 프로세스 모두 자연 exit, 외부 프로세스 정리 없음. serial slot 반환 완료.
- Fresh managed WT C:/Users/kinso/.codex/worktrees/mdqa-64-review-tab-history/matchup-sports-platform; branch fix/mdqa-64-review-tab-history; fresh fetch origin/dev base78ee726909d9fc6e4bc41a9a2d54b9952b9e03e7. Creation operation691904a1-d610-4fa3-91a8-08f88fe7f70d registered.
- root claim evidence: own run1913/report64-claim-confirmed.txt/png, 김성준·확인 중 displayed05:02KST. No Done/delete/merge action. No duplicate fix/worker/PR.
- Root applied debugging/programming/git rules and frontend design/perfection routers; existing DESIGN.md/reference rule unchanged. No new token/primitive/dependency/local server or repeated full audit; user-authorized smallest bug repair and narrow checks govern scope. alpha AFTER remains pending.
- Serial validation slot granted to one worker only after preflight; other validations complete. Root concurrently completes unrelated #41 PR review/comment/state without touching owned reviews files.
