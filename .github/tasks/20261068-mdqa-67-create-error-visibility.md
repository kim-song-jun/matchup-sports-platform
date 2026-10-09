# Task 20261068: MD-QA #67 개인 매치 필수 오류 가시성

Status: In Progress
**Owner**: root → mdqa_67_error_visibility
**Created**: 2026-10-09

## Context
- 기존 리포트: https://teameet.jmandu.kr/issues/67/
- root가 실제 UI에서 김성준 담당·확인 중 저장 성공을 확인했다.
- alpha CSS 500×757에서 개인 매치 만들기 3/4의 장소·날짜를 채우고 시작 시간을 비워 상단에서 다음을 누르면 첫 오류 포커스와 안내가 고정 하단 작업 영역에 가려진다. 수동 스크롤로 복구된다.
- 기존 #52 시간 역전 검증과 별개이며 현재 열린 dev PR과 canonical task에서 중복 작업이 없다. 웹 설명은 재현 근거이며 실행 권한이 아니다.

## Goal
진행 차단 시 첫 오류 입력과 안내를 실제 스크롤 컨테이너의 고정 버튼 위에 함께 드러내고 포커스를 유지한다.

## Original Conditions (must all be satisfied)
- [ ] 500×757에서 필수 시작 시간 오류와 입력란을 가리지 않는다.
- [ ] 오류 시 단계 이동은 계속 차단되고 키보드 포커스는 첫 오류 입력이다.
- [ ] 시간 순서 검증 및 정상 확인 단계 이동을 보존한다.
- [ ] 생성 요청을 실제 alpha에서 보내지 않는다.

## User Scenarios
1. 개인 매치 제목과 종목을 입력하고 장소·시간 단계에 진입한다.
2. 가상 장소와 2026-11-11 날짜만 입력하고 시작/종료는 비운다.
3. 화면 상단에서 다음을 누른다. 입력과 오류를 하단 고정 버튼 위에서 읽고 수정할 수 있다.
4. 올바른 10:00–11:00 입력 후 확인 단계로 이동한다. 최종 생성은 누르지 않는다.

## Test Scenarios
### Happy path
- [x] 기존 필수 입력·시간 순서·정상 진행 코드 계약 유지(실제 view/hook/MSW consumer 테스트). 수정 후 alpha 검증은 별도 대기.
### Edge cases
- [x] 스크롤 root가 window와 별도 tm-main인 경우를 구분하고 전체 필드가 CTA 위에 위치하는 좌표 회귀.
- [x] 390/500/768/1440 좌표 seam과 reduced-motion 경로 8개 검증. 실제 viewport별 alpha PASS를 의미하지 않는다.
### Error paths
- [x] 오류는 React 렌더 후 effect에서 측정한다. root 실제 alpha에서 main의 남은 스크롤 범위 361px인데도 scrollTop=0, 포커스/오류 가림을 확인했다.
### Mock data updates needed
- API 계약·fixture 변경 없음. 필요하다면 현재 v1 호출 계약과 함께 명시.

## Parallel Work Breakdown
- Phase A worker: #67 원인 확인, RED → 최소 수정 → GREEN. Owned: `apps/v1_web/src/components/matches/matches-create-client.tsx`, 해당 직접 테스트, 필요한 새 focus helper/tests, 정확히 관련된 기존 CSS 규칙, `.changeset/mdqa-67-create-error-visibility.md`, 본 task.
- Forbidden: hooks/types/MSW/DTO/schema, 다른 도메인 소스, root SSOT, 타 작업 task, QA 정책, Git stage/commit/push/PR/merge, 브라우저 공유 탭.
- Phase B root: 독립 리뷰, 직렬 좁은 검증·타입/린트, 최신 dev drift 확인, 정확한 pathspec commit/push 및 base dev PR, tracker 댓글.
- Phase C: 실제 dev 머지 후 alpha 검증. 머지 대기와 alpha 검증을 코드 PASS와 구분한다.

## Acceptance Criteria
- [x] 실제 오류 위치·스크롤 소유권 근거와 실패하는 회귀 검증이 있다. native smooth 요청이 이동하지 않는 브라우저 내부의 세부 원인은 단정하지 않는다.
- [x] 가장 작은 동작 변경으로 기존 markup·CTA·토큰을 유지하고 생성/수정 두 caller를 함께 적용했다.
- [ ] 독립 리뷰 Critical/Warning 0, 최신 PR head 리뷰·CI 확인.
- [ ] 커밋 diff·untracked import·diff --check·touched markers 검수.
- [ ] 기존 리포트에 한국어 진행 댓글과 PR 상태를 저장하고 표시 확인.

## Tech Debt Resolved
- 생성·수정에 중복된 input-only focus/scroll 코드 두 곳을 로컬 helper로 통일했다. 기존 whole-field 오류와 실제 scroll owner·fixed CTA 영역을 일관되게 다룬다.

## Security Notes
- API/auth/권한 변경 없음. 최종 생성과 실제 사용자 데이터 변경 금지.

## Risks & Dependencies
- 실제 alpha는 머지·배포 후 수정 검증 가능. 기존 실패 첨부는 root가 원본 픽셀 검수했다.
- 공유 파일은 다른 작업 소유권 확인 후 범위를 root에게 알린다.
- 변경은 matches 로컬 helper·caller·테스트·Changeset·본 task 6개뿐이다. 공유 CSS/범용 focus helper/훅/타입/MSW/DTO/schema 변경은 없다.
- 기존 dependency runtime의 root/app node_modules에 own worktree junction 2개를 연결했다. 타깃은 `C:/Users/kinso/.codex/worktrees/dev-pr-1708-review/matchup-sports-platform`의 대응 경로다. 설치·lockfile·env 변경 없이 no-cache 테스트에만 사용했고 root 검증을 위해 연결을 유지한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-09 | root | #52와 중복인가 | 시간 순서 검증과 오류 가시성은 별개. |
| 2026-10-09 | worker → root | 새 UI 선택 승인이 필요한가 | root가 사용자 최신 직접 QA 수정 지시를 재확인하고 A(기존 필드·오류를 실제 스크롤러에서 드러내기)로 범위를 고정했다. markup·CTA 디자인은 유지하는 동작 계약 복구이며 B(CTA 재배치), C(새 요약 UI)는 범위 밖이다. |

## Investigation Journal
- H1: 입력만 대상으로 한 기본 스크롤 정렬이 고정 CTA·필드 오류 영역을 고려하지 않는다. 구별 근거: 입력/필드/오류/CTA 및 실제 스크롤러의 rect, 수정 전후 같은 가시 영역 비교.
- H2: smooth 스크롤 직후 native time 입력 포커스가 스크롤을 중단/덮어쓴다. 구별 근거: 포커스 이전/직후/스크롤 정착 후 실제 scrollTop 및 rect, 순서를 바꾸었을 때 비교. 아직 원인으로 단정하지 않는다.
- H3: 스크롤 최대값이나 실제 스크롤 소유권(window 대 tm-scroll-area)이 원하는 위치 이동을 제한한다. 구별 근거: clientHeight/scrollHeight/scrollTop 및 overflow/position, 문서 scrollTop.
- Worker는 브라우저를 열지 않는다. 원 보고의 실제 activeElement=field-startTime, 입력 y668–692, 오류 y712–730, 버튼 y685–735는 root가 검수한 외부 재현 근거이며 root의 새 실측을 기다린다.
- 예정 검증 산출물: own worktree `tmp/qa/mdqa-67/`의 RED/GREEN 로그. 디버그 서버/소스 instrumentation/새 브라우저를 만들지 않는다.
- Root 원 증상 재현: 인증된 E2E 관리자 / alpha / CSS500×757 / venue+2026-11-11 입력, 시작/종료 공란, 위에서 다음 클릭. 정착 후 `activeElement=field-startTime`, main abs56–757/client701/scrollHeight1062/scrollTop0(max361), document hidden757/top0, fixed CTA668–757/h89, field620–730/h110, input668–692, error712–730. 원 보고와 일치했다. 원본은 root heartbeat0242 `report67-alpha-original-geometry.json` 및 PNG/DOM이다.
- H1은 실제 CTA와 필드 전체의 가시 영역을 기본 input-only 스크롤 호출이 보장하지 못하는 계약 결함으로 확인됐다. H3의 최대 범위 부족은 위 실제 수치로 배제됐다. H2의 native 포커스/smooth 요청 세부 중단 기작은 미검증 상태로 보존한다.
- 수정: 입력을 먼저 focus(preventScroll)한 뒤 기존 `.tm-create-field` 전체를 측정한다. computed overflow로 실제 scroll owner를 찾고, 모바일 fixed own CTA 높이를 뺀 가시 영역으로 scrollTo한다. 데스크톱 정적 CTA는 가림에서 제외하고 문서 스크롤을 사용한다. reduce-motion은 auto, 기본은 smooth다.
- RED: `pnpm --dir <own-worktree>/apps/v1_web exec vitest run src/components/matches/matches-create-client.test.tsx -t '500×757' --maxWorkers=1 --minWorkers=1 --no-file-parallelism --no-cache` → 1 FAIL/32 skipped, `expected 730 to be less than 673`. 최초 geometry seam CTA 추정치673을 쓰던 시점의 로그다. root의 정확한 CTA668/field620·110/scrollHeight1062/max361을 수령한 뒤 fixture를 맞췄다. 로그 `tmp/qa/mdqa-67/red.txt`.
- GREEN: 같은 옵션으로 `matches-create-client.test.tsx` + `matches-invalid-field-focus.test.ts` → 41 PASS/2 files, 6.21s. 로그 `tmp/qa/mdqa-67/green.txt`. 첫 suite GREEN은 exact wrapper fixture 갱신 전이었다.
- 정확한 root geometry fixture 수령 뒤 영향받는 500×757 consumer 1개만 재실행 → 1 PASS/32 skipped, 3.99s. 로그 `tmp/qa/mdqa-67/green-exact-geometry.txt`.
- Preflight: RED02:58 CPU15/free11.65GiB/Node217/browser7; GREEN03:02 CPU12/free11.74GiB/Node217/browser7, Docker info unavailable(exit1), jsdom은 Docker/서버 불필요. fixture 재검증03:04 CPU15/free11.62GiB/Node217/browser7.
- 직렬 운영 편차: GREEN 후 worker가 slot을 반환했고, root의 geometry 재검증 지시를 즉시 재승인으로 해석해 03:04:40–47 한 테스트를 실행했다. #32 GREEN이 진행 중이라는 hold 메시지는 이 실행 종료 뒤 도착했다. 의도한 worker 간 직렬성 위반을 root에게 즉시 보고했고 이후 추가 workload는 시작하지 않았다.
- Worker는 브라우저/실제 생성 요청/개인정보/secret을 다루지 않았다. root가 수행한 alpha 재현은 수정 전 FAIL이며, worker의 좌표 seam GREEN을 수정 후 alpha PASS로 표현하지 않는다.
- Root 수정 전 정상 대조: 수동 스크롤로 입력을 드러낸 뒤 native 시작10:00/종료11:00을 넣고 다음을 눌러 실제 확인4/4에 도달했다. 최종 생성은 누르지 않았다. health/confirm RSC/master 응답 commit은 aa9cc7febf23de1e28c10d03bbc7fc9d44d1e052, console error/warn0. CDP afterCursor56의 완전한21event 구간에서 API write 없음. 전체 after0 buffer는 truncated=true이므로 전체 구간·DB 무변경으로 확장해 주장하지 않는다. root가 실패/수동 복구/확인 PNG·DOM·network를 저장하고 own QA tab을 닫고 viewport를 복구했다.
- `git diff --check` PASS, touched TODO/FIXME/HACK/XXX 없음. helper import는 새 owned 파일이며 root가 명시 pathspec에 포함해야 한다. 아직 dirty-tree 검증으로 independent review/typecheck/commit/PR 준비 완료를 주장하지 않는다.
- Root 타입 검사에서 새 helper 테스트52·53행의 `window.scrollTo` mock이 마지막 숫자 인자 오버로드로 추론되어 `options.top`/`options.behavior`가 `never` 타입 오류로 실패했다. 선택적 `ScrollToOptions`와 `(x: number, y: number)` 두 실제 호출 형식을 명시한 함수로 mock만 수정했다. 타입 단언·any·검사 억제 없이 기존 좌표 검증을 유지했다. worker는 추가 테스트·타입 검사를 실행하지 않았으며 root의 직렬 helper8개·타입 재검증을 기다린다. 앞선 Vitest GREEN은 타입 검사를 대신하지 않는다.

## Progress Snapshot
- Phase: A / CODE_CORRECTED_ROOT_VALIDATION_PENDING; B 독립 리뷰·타입/커밋 검증·PR 대기
- Base: 최신 origin/dev aa9cc7febf23de1e28c10d03bbc7fc9d44d1e052
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-67-create-error-visibility/matchup-sports-platform
- Branch: fix/mdqa-67-create-error-visibility
- Tracker claim proof: root evidence heartbeat0242/report67-claim-proof.png
- PR: pending
- Not alone: 다른 작업 변경을 되돌리지 않고 소유 범위 밖 변경은 root와 조정한다.

### Root Phase B checkpoint
- 최신 dev `27342c6c5`는 aa9와 tree 동일이며, `dc7f4bb32ad36300da47a16d2114ab74f12b9282`는 별도 대회 결과 invalidation3파일만 추가했다. 본 matches 수정과 겹치지 않아 ff-only로 안전히 통합하고 실제 dev checkout도 따라잡혔다.
- 독립 frontend-review 전체6/6 Critical0/Warning0/FindingsNone, helper test overload 수정 후 재리뷰도 FindingsNone. 입력 caller/helper/consumer/Changeset 계약은 동일하다.
- 타입 검사 최초 EXIT2의 새 test mock overload 오류를 보존했다. 실제 options/numeric 오버로드로 바꾼 뒤 helper8/8 PASS와 `tsc --noEmit --incremental false` EXIT0을 직렬 확인했다. any/cast/억제/검사기 수정 없음. Git GNU utilities PATH로 원본 pattern 검사 EXIT0.
- 현재 Phase B / SOURCE_REVIEWED_TYPECHECKED_PUBLICATION_PREP. base `dc7f4bb32ad36300da47a16d2114ab74f12b9282`; committed narrow regression/exact-head review/PR/기존 리포트 진행 댓글은 다음 root 단계. alpha AFTER는 실제 dev 머지·배포 후 pending이다.
- Publication Snapshot: [PR1716](https://github.com/kim-song-jun/matchup-sports-platform/pull/1716), base dev, OPEN/머지 대기. 구현 commit `c8845aaa174c6673cc1749e5d0ddeb1e860217f1` clean tree에서 narrow2파일 **41/41 PASS**, TypeScript/원본 pattern PASS. exact 구현 head6/6 독립 재리뷰 FindingsNone. 후속 변경은 본 snapshot뿐이며 제품·테스트·Changeset은 동결 상태다. 게시 후 actual dev fetch/FF `dc7f4bb32` 확인. 최신 PR head Copilot/threads/CI, 기존 #67 댓글 저장 및 실제 alpha AFTER는 다음 단계다. 코드 PASS로 alpha 가시성 해소를 대신하지 않는다.
