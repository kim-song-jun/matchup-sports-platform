# MD-QA #19: 문의 검색 입력 직후 상세 왕복의 검색어 보존

Status: Review
**Owner**: Codex MD-QA monitor / mdqa_19 worker
**Created**: 2026-10-06

## Context
리포트: https://teameet.jmandu.kr/issues/19/ (김성준 할당).
`/admin/inquiries`에서 QA 입력 후 300ms debounce 전에 기존 문의 상세로 이동하고 실제 browser Back으로 돌아오면 검색어가 사라진다. q=QA와 1건 반영을 기다린 대조군은 정상이다. 최초 조사 당시에는 후보 검증 기록만 있었다. 이후 PR #1626가 dev에 머지됐고 아래 Progress Snapshot에서 사후 QA를 추적한다.

## Goal
검색 API debounce와 별개로 사용자가 입력한 검색어를 빠른 상세 왕복 뒤에도 보존하고 dev PR 및 머지 후 alpha QA로 연결한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev의 전용 워크트리에서 작업.
- [x] 300ms 이전 상세 왕복에서도 QA 입력을 보존(Vitest 및 실제 alpha 왕복 검증 통과).
- [x] 검색 반영 후 대조군 및 browser Back/Forward와 URL 계약 유지(Vitest 및 실제 alpha 왕복 검증 통과).
- [x] 기존 검색 debounce와 문의 읽기·답변/상태 권한 유지(관련 테스트 통과; API/권한 계약 변경 없음).
- [x] 한국어 dev PR #1626 생성 및 Changeset 포함.
- [ ] dev 머지 후 리포트는 QA로 변경; Done/완료 처리는 하지 않음.

## User Scenarios
관리자가 문의 검색에 QA 입력 직후 기존 합성 문의를 읽고 browser Back으로 돌아와도 이미 입력한 검색어를 유지한다.
기존 읽기 대상: `/admin/inquiries/3b0f769f-bd5a-4f26-94ac-b2c27374d3c8`. 답변·문의 상태 변경은 하지 않는다.

## Test Scenarios
### Happy path
- [x] debounce 전에 상세 진입·복귀할 때 검색 입력 유지(Vitest).
- [x] debounce 이후 q=QA 반영한 대조군 유지(Vitest).
### Edge cases
- [x] 빠른 연속 입력과 필터 토글에서 stale URL overwrite 없음(Vitest).
- [x] browser Back/Forward, 직접 URL 진입, 검색 비우기 계약 유지(Vitest).
### Error paths
- [x] API/권한 실패를 성공으로 숨기지 않음(Vitest).
### Mock data updates needed
- [x] 직접 테스트/fixture가 변경 계약과 일치(API/MSW/공유 fixture 변경 불필요).

## Parallel Work Breakdown
- Builder owns admin/inquiries list/detail and inquiry-only state helper/tests, this document, `.changeset/mdqa-19-inquiry-search-return.md`.
- Forbidden: tournament/campaign/events, use-v1-api.ts shared contract, main checkout, other worktrees.
- 공통 UI/helper 변경이 꼭 필요하면 root와 먼저 조율.
- Root handles Git/PR/browser QA; builder must not commit or push.

## Acceptance Criteria
- [x] 실제 빠른 왕복 계약 회귀 테스트와 관련 기존 테스트 통과(root GREEN: 4파일 37/37).
- [x] 타입/패턴 검사와 committed diff 검토.
- [x] reviewer 실결함 0; API/권한/mock drift 및 신규 부채 0.
- [x] 머지/alpha 배포 확인 후 390/768/1440에서 빠른 왕복과 정상 대조군 재검증.

## Tech Debt Resolved
- URL 저장을 API debounce에 묶어 입력이 unmount 시 유실되는 결합을 제거했다.
- 문의 전용 helper에서 최신 draft를 병합하여 빠른 입력/필터 토글의 오래된 router query 덮어쓰기를 방지했다.
- 초기값만 URL에서 읽던 상태를 mounted Back/Forward에서도 복원하고 이전 debounce timer를 취소하도록 정리했다.
- 기존 URL 테스트의 router mock 호출 기대를 실제 history URL 기대값으로 바꾸었다. API/mock/fixture 계약 변경은 없다.

## Security Notes
문의 개인정보/답변을 증거에 노출하지 않음. .env/비밀은 읽거나 문서·PR에 적지 않음.

## Risks & Dependencies
- 실제 alpha 관리자 로그인 QA는 기존 dev-pr-5가 완료했으며 root가 같은 serving SHA의 증거를 검증해 재사용했다.
- 현재 tracker 메뉴에서 QA 상태 전환 항목을 찾지 못해 사용자 확인 대기다. dev 머지 후 QA 전환은 미완료로 남기고 Done은 사용하지 않는다.
- [dev PR #1626](https://github.com/kim-song-jun/matchup-sports-platform/pull/1626) dev 머지 및 alpha 사후 QA PASS. tracker QA 메뉴 부재만 미완료로 추적한다.

## Ambiguity Log
- 화면/스타일/API 계약을 바꾸지 않는 로직 전용 수정이다. `CLAUDE.md` UI 착수 규칙의 로직 전용 예외를 적용한다.
- 인접 v1 매치 목록의 native History 즉시 저장 + 최신 draft 병합 + API만 debounce 패턴을 문의 전용 helper에 적용한다(root 승인).
- 문의 목록의 기존 계약대로 `page`는 URL에 저장하지 않는다. 신고 사유는 신고 분류에서만 적용하고 팀 딥링크 필터는 계속 유지한다.

## Investigation / Validation Ledger
- H1(timing): URL 쓰기가 `debouncedSearch`에 종속되어 300ms 전에 상세로 이동하면 URL에 `q`가 기록되지 않는다. ROOT RED 실행에서 0ms Back 후 `Expected QA / Received empty`가 확인되었고 300ms 대조군은 통과했다.
- H2(router boundary): 설치된 Next history 경계와 실제 jsdom Back/Forward 회귀가 GREEN 통과했다. native replace가 내부 Next state를 보존하며 unmount 뒤 debounce가 상세 URL을 덮지 않는 계약을 확인했다.
- H3(URL restoration): mounted 복원 회귀의 RED `Expected QA / Received 오래된 검색`을 확인했고 GREEN에서 URL 입력/필터 복원 및 이전 debounce 취소가 통과했다.
- 회귀 파일: `apps/v1_web/src/app/admin/inquiries/page-search-return.test.tsx`. ROOT RED: 7개 중 5 실패 / 2 통과(0ms 복귀, 빠른 draft 병합, mounted 복원, 즉시 clear, Next 경계의 즉시 q 저장 실패). 증거 `tmp/qa/mdqa19/red.log`는 비커밋 QA 산출물이다.
- root 직렬 GREEN 통과: 4파일 37개 테스트 모두 통과(37/37). 실행 명령: `pnpm --filter v1_web exec vitest run src/app/admin/inquiries/page-search-return.test.tsx src/app/admin/inquiries/page.test.tsx src/app/admin/inquiries/guest-inquiry-purge-panel.test.tsx 'src/app/admin/inquiries/[id]/page.test.tsx' --maxWorkers=1 --no-file-parallelism`.
- root가 기존 manifest+lockfile 의존성 설치를 완료했다. 신규 패키지는 없다. `git diff --check` 및 touched-path 부채 marker 검사는 통과했다.
- root TypeScript 검사(`pnpm --filter v1_web exec tsc --noEmit`) 및 기존 v1 패턴 검사 모두 통과했다. Unix 명령을 실행하는 패턴 검사는 해당 Node 프로세스의 자식 shell을 기존 Git Bash로 지정했다. 로그: `tmp/qa/mdqa19/typecheck.log`, `tmp/qa/mdqa19/patterns-gitbash.log`.
- 별도 reviewer가 의도된 6/6파일, Next native History 경계와 기존 문의 계약을 검토했다. Critical 0 / Warning 0. 권한/API/MSW 계약 변경 없음.
- alpha QA(root 담당): synthetic 문의를 읽기만 하며 390/768/1440에서 입력 직후 상세→Back, 300ms 대조군, Back/Forward·검색 비우기를 확인한다. 문의 답변/상태 mutation은 실행하지 않는다. tracker는 머지 후 QA로만 변경하고 Done 처리하지 않는다.

## Progress Snapshot
- [x] 할당·상세·기존 PR 중복 확인.
- [x] 로컬 dev 먼저 fetch/FF 최신화; 시작 SHA `4e1c14bb9cd089da10e1dae0088dfea6deb5b72d`.
- [x] 구현·회귀 검증(RED 5실패/2통과 → GREEN 4파일 37/37).
- [x] 리뷰·PR: [dev PR #1626](https://github.com/kim-song-jun/matchup-sports-platform/pull/1626) 게시 및 채팅 attach. 최신 head의 Gates/API/Web 성공, Copilot Findings None, 미해결 스레드 0을 확인했다.
- [x] 2026-10-06 dev 머지 확인: `768bb0d5c02473842629bdad83fc3b6d183cd5f3` (2026-10-05 22:51:30 UTC). 실제 dev 체크아웃을 fetch/FF 동기화하고 #18/#19 머지 커밋의 ancestry를 확인했다.
- [ ] MD-QA #19 상태를 QA로 변경: 현재 로그인한 김성준 UI에 QA 선택이 없어 BLOCKED. 완료·보류 등 다른 상태로 대체하지 않는다.
- [x] alpha 배포 [37385091187](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37385091187) 성공, 실제 serving `768bb0d5c02473842629bdad83fc3b6d183cd5f3`와 merge 일치, 실제 dev FF 동기화 확인.
- [x] [기존 dev-pr-5 사후 QA 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/1626#issuecomment-6005150275)를 재사용 검증: 실제 관리자/합성 문의만 사용,390×844/768×1024/1440×900에서 QA→QA 대회 입력 직후 상세→Back 후 입력과 URL 보존. 별도 input-to-click83ms(<300ms); 일반 검색 왕복, 빠른 status/category 조합, Back/Forward, q 초기화 후 나머지 필터 유지도 통과.
- [x] 두 독립 post-QA reviewer가 #19 capture3/3와 matching before를 모두 검수해 디자인/기능 및 시각/CJK PASS. 원본 네트워크51응답/잘림 없음, 문의 목록·조회HTTP200, console 오류/경고0, 비취소 실패0. 탐색 취소5와 기존 `/favicon.ico`404×3은 별도 관찰이며 전체 network 오류0으로 주장하지 않는다. reply/status/delete mutation,team/report 전용 진입,invalid enum 브라우저,독립 DB는 미검증.
- [x] reviewer 6/6파일 Critical 0 / Warning 0, 타입·패턴 검사 통과.
- [x] root committed diff 6파일 검토, 미추적 의존성 없음, clean 작업트리 확인.
- alpha Chrome 관리자 로그인 및 GitHub 로그인이 해소된 사실은 기존 dev-pr-5의 진행 기록과 관리자 문의 목록 탭으로 확인했다. tracker QA 메뉴 부재는 계속 사용자 확인 대기이며 Done 전환 금지.
