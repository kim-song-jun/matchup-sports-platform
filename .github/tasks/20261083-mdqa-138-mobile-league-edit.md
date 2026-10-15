# MD-QA #138 모바일 리그 템플릿·구조 편집

Status: In Progress

## Context
기존 리포트 https://teameet.jmandu.kr/issues/138/ 의 모바일 첫 진입에서 템플릿·구조 편집 출구가 사라지는 증상을 현재 v1 코드와 대조한다. root가 김성준 담당·확인 중을 실제 UI에서 확인했다.

## Goal
사용자가 선택한 A: 기존 템플릿·상세 편집을 모바일에서도 열고 목록형 구조 편집을 보완한다. 완료·결과 경기 보호와 실제 저장 계약을 유지한다.

## Original Conditions
- [x] 2026-10-13 직접 사용자 A 선택
- [x] 관리형 전용 워크트리와 feature branch, 최신 origin/dev 기준 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [x] 실제 첫 모바일 진입 결함을 좁은 실패 테스트로 확인
- [ ] 수정·검증·독립 적대적 리뷰·dev PR·기존 리포트 댓글

## User Scenarios
리그 관리자가 390px 화면으로 처음 진입하여 템플릿을 열거나 기존 미시작 경기 구조·상세를 편집한다. 결과가 있는 경기와 완료된 리그에서는 기존 보호와 오류 안내를 유지한다.

## Test Scenarios
- Happy: 초기 모바일 렌더에서 실제 템플릿·경기 상세 편집 버튼을 통해 기존 저장 경로에 도달한다.
- Edge: 넓은 화면으로 시작하지 않아도 모바일 기능이 작동하며 390/768/1440 전환에서 맥락을 유지한다.
- Error: 완료·결과·권한 제한과 실패 응답을 성공처럼 숨기지 않는다.
- Mock: 좁은 컴포넌트 회귀에서 실제 consumer/콜백 계약을 사용한다. alpha 실측은 배포 SHA 확인 후 별도다.

## Parallel Work Breakdown
Phase A 단일 frontend owner: bracket-canvas-mobile 및 실제 league fixtures consumer, 직접 관련 테스트·fixture만. hooks/use-v1-api.ts, types/api.ts, shared MSW, API/DTO/schema, 다른 버그 worktree, Git mutation, 정책 문서는 Forbidden. root가 task·Changeset·통합·Git·직렬 테스트·브라우저를 소유한다. Phase B 독립 reviewer는 읽기 전용으로 적대적 반례와 실제 도달성·보호 경계를 검토한다.

## Acceptance Criteria
- 초기 좁은 viewport에서 템플릿과 구조/상세 편집에 도달하고 노출한 액션은 실제 저장 경로를 사용한다.
- 기존 완료/결과/권한 gate와 데스크톱 동작을 보존한다.
- 실제 RED→GREEN, committed diff/typecheck, 최신 head 독립 FindingsNone과 PR base dev를 확인한다.
- 실제 alpha screenshot/console/network/viewport verdict를 기록하기 전 시각 QA 완료로 표시하지 않는다.

## Tech-Debt Resolved
조사 중. 기존 모바일 dead-end 안내를 실제 편집 출구와 정합하게 바꾼다.

## Security Notes
관리자·리그·경기 상태 권한을 넓히지 않는다. 비밀/실제 개인정보를 읽거나 출력하지 않는다.

## Risks & Dependencies
#137의 이미 머지된 타이밍/경기 수 설정을 중복 구현하지 않는다. shared 계약 변경 필요 시 root와 단일 소유자를 먼저 고정한다. alpha 배포·로그인·실제 권한은 독립 게이트다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | 모바일 편집 방식 | A: 기존 템플릿/상세 + 목록 구조 편집 |

## Progress Snapshot
- 2026-10-13 09:55Z: 최초 모바일 실제 소비자9건에서6 FAIL/3 PASS RED를 확인했다. 실제 API의 취소 이력 유지·기존 경기 전부에 대한 replaceExisting 계약으로 fixture를 대조한 추가10건은2 FAIL/8 PASS RED였고, 최소 parent 수정 후10/10 GREEN (`mdqa138-mobile-editor-final-green.log`). 390px 최초 진입,768/1440 전환, GET→템플릿POST→새 경기GET→상세PATCH, 완료/결과 보호, readonly, 취소 이력 보존과 새 경기 포커스를 검증한다. jsdom viewport 시나리오는 실제 alpha 스크린샷 PASS가 아니다. 최신 committed head 타입·독립 리뷰·dev PR·댓글·머지·alpha 검증은 남아 있다.
- 2026-10-13 root: 관리형 생성/등록 완료, feature branch 준비. Phase A 회귀 준비 중; 새 테스트·PR·alpha는 NOT RUN.

- 2026-10-13 11:11Z root: 기존 완료 경기 상세 편집 C1의 실제 소비자 회귀는 1 FAIL/10 PASS RED 후 canWrite && !leagueEnded 최소수정으로 11/11 GREEN (mdqa138-completed-existing-fixture-green11.log). 현재 기준 ee7은 최신 peer1901 dev06a7과 부모 파일이 겹치므로 이 결과를 최신 dev 검증으로 재사용하지 않는다. 원 모바일 편집 진입 결함은 실제06a 코드에 남음을 독립 확인했고, peer mobileFocusFixtureId/수동추가/징계/공식결과 보호를 보존해 정상 merge 통합 후 영향 검증을 갱신한다. PR/alpha는 NOT RUN.

- 2026-10-13 11:25Z root: origin/dev06a7를 정상 merge한 committed864882에서 실제 모바일 소비자11/11 GREEN (mdqa138-dev06-integrated-mobile-editor-green11.log). peer1901의 mobileFocusFixtureId와 템플릿 양쪽 포커스 연결은 이미 보존되어 중복 수정하지 않았다. 타입·최신head 독립 리뷰·PR·alpha·tracker 완료는 남아 있다.

- 2026-10-13 F3: 최신 dev79d1744를 통합한 ef91e093에서 완료 리그의 실제 공식 경기(ENDED, non-null game, hasLiveRecords=true, console OFFICIAL revision)까지 결과 정정 출구가 숨겨지는 C1을 확인했다. root가 실제 parent→HTTP 조회→모바일 시트 회귀를 1 FAIL/10 SKIP RED로 실행했다 (`tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa138-completed-official-correction-red1.log`). 기존 완료 경기/readonly 사례를 강화해 전체 11건을 유지했다. root 승인 후 parent의 canWrite 결과 권한을 복원하고, league-mobile-schedule-board 전용 canEditFixture로 새 경기 편집 콜백만 종료 제한과 분리했다. shared BracketCanvasMobile/sheet, peer1901 포커스·수동추가·기존 결과 보호 소스는 변경하지 않았다. GREEN·타입·committed-head 독립 재리뷰·PR·alpha 검증은 PENDING이며 subagent는 테스트/Git을 실행하지 않았다.

- 2026-10-13T12:52:50.394Z root F3: 완료 리그 non-null ENDED+hasLiveRecords+공식 console 결과의 실제 parent HTTP 회귀는 정정 링크 누락1FAIL/10skip였다. 결과 canWrite 유지와 wrapper 전용 canEditFixture 분리 후 동일파일11/11 실제GREEN (mdqa138-completed-official-correction-green11.log). 공식/voided/읽기전용/템플릿/저장실패/390→768→1440 사례를 보존했다. 마지막 committed ef91 tsc는 PASS였지만 Windows find 패턴 wrapperFAIL을 기록한다. 새 source commit 타입·독립재리뷰·PR·alpha는 아직pending이며11tests를 실제alphaPASS로확대하지 않는다.

- 2026-10-15 current-dev integration: root가 origin/dev d11455b7eb5bf96e45c778f2555a9d49c13bc040를 `merge --no-commit`으로 자동 충돌 없이 통합 중이다. 현재 v1 API `detail()`의 deletedAt:null 조회와 `replaceLeagueFixturesInTx()`의 기존 대진 전체 soft-hide 계약을 확인해 전용 HTTP fixture를 정합화했다. 숨긴 취소 이력은 별도 hiddenFixtures에 보존하고, 현재 GET의 fixtures에는 신규 경기만 반환한다. 취소 이력 교체 시 구 경기 카드 부재·새 1주차 시트 포커스·이력 보존을 함께 검증하도록 기존 사례를 갱신했다. 새 CompetitionFieldPicker의 정확한 GET `/tournament-ops/tournaments/{leagueId}/fields` → `{items:[]}` handler를 추가하고, 실제 부모가 leagueId를 전달해 편집 모달의 필드 선택기가 활성화되는 조건도 기존 편집 사례에 연결했다. 기존 11건과 공식 결과 정정·readonly·390 최초 편집·템플릿·저장 실패·viewport 전환 경계를 유지했다. 생산·공유·API 소스와 upstream staged 파일은 수정하지 않았고, subagent는 Git/테스트를 실행하지 않았다. 현재 통합 결과의 직렬 회귀·committed tsc/pattern·독립 리뷰·PR·alpha는 PENDING이며 이전 GREEN을 이번 통합 PASS로 재사용하지 않는다.

- 2026-10-15 root 재개: actual dev d11455b7e로 정상 merge(충돌0) 후 current API의 deletedAt 숨김/필드 GET 계약에 전용 fixture를 동기화했다. 초기 missing vitest 실행 실패는 환경 실패로 구분했고, 기존 동일 의존성 checkout을 읽기 전용 재사용한 뒤 실제 11/11 GREEN(exit0)을 확인했다(2026-10-15-resume/mdqa138-d114-integrated-11.log). narrow run 77.63초/실제 테스트3.41초이며 전체 suite/DB reset/local Next는 실행하지 않았다. 현재 변경7파일, diff-check0; committed 타입/패턴·최신 head 독립 리뷰·dev PR·alpha 화면과 갤러리는 남아 있다.

- 2026-10-15 current-shell integration: PR #1923/#1924가 포함된 dev8c 통합 head a276a9f1145e91aed5a006725d899581c63566c1에서 root가 기존 11건을 실행해 실제 10 FAIL/1 PASS RED를 확인했다 (`mdqa138-a276-committed-11.log`). 헤더·상태 변경이 새 LeagueAdminShell로 이동했는데 테스트가 fixtures client 단독 렌더 후 이전 h1을 기다린 것이 원인이다. 실행 뒤 pnpm의 vitest-not-found tail은 실제 Vitest 실패 뒤 wrapper 표기이며 의존성 누락으로 재분류하지 않는다. root 실행 종료·쓰기 슬롯 해제 후, 실제 `[leagueId]/layout.tsx`와 `schedule/page.tsx`의 반환 조합을 함께 렌더하도록 전용 회귀 harness를 정합화했다. 실제 admin/me GET의 query 성공을 기다려 권한 hydration을 확인하고, writable 상태 변경과 readonly 상태 변경 부재·공개 전환 disabled를 기존 공식 경기 읽기 전용 사례에 연결했다. 셸의 운영 빠른 링크가 소비하는 정확한 staff GET `{items:[]}`만 전용 HTTP fixture에 추가했다. 헤더·권한 hook을 mock하지 않았고 기존 11건의 편집·템플릿 POST·PATCH 거절·soft-hide·포커스·공식 결과 정정·viewport 검증을 제거하지 않았다. 생산·공유 소스는 수정하지 않았으며 subagent Git/테스트/브라우저/SSOT 실행은 없다. 수정 후 11건 GREEN, committed tsc/pattern, 최신 독립 리뷰·PR·alpha는 PENDING이다.

- 2026-10-15 PR #1931 CI repair: current published aac6e8f3c04de31c58ed3bffd474fcc6a2e6bdc9에서 Web CI는 9130건 중 기존 tm-btn-size.test.ts 1건이 실패했다. root job evidence `2026-10-15-resume/pr1931-web-job.log:3774`가 mobile schedule board:45와 shared mobile canvas:206의 size modifier 누락을 특정한다. 실제 globals.css의 tm-btn는 크기를 제공하지 않고 tm-btn-md가 높이44px·패딩·글자 크기를 제공함을 확인해 두 class list에 tm-btn-md만 추가했다. 기존 size-touch-min, 클릭 동작, canWrite/canEditFixture·완료/readonly·결과 정정 분기는 보존하고 scanner/tests는 수정하지 않았다. root의 기존 size scan·실제 consumer 재검증과 새 immutable head 독립 리뷰는 PENDING이다.

- 2026-10-15 PR #1931 review RED preparation: 실제 Codex thread4282874525/4282874539를 현재 v1 계약과 대조했다. template replace는 revisionCount>0를 거절하지만 팀 배정은 SCHEDULED·공식 포인터 없음일 때 미확정 리비전이 있어도 허용하므로 기존 공용 fixtureHasStartedOrResult의 권한 범위를 넓히지 않고 모바일 template 전용 gate를 고칠 예정이다. 현재 상세는 revisionCount를 노출하지 않으며 최신1건을 직렬화한 game.latestRevision이 null/nonnull로 결과 이력 유무를 제공한다. 기존 HTTP consumer11건을 보존하고 scheduled draft/SUBMITTED/CHANGE_REQUESTED의 템플릿 교체 제한 3건을 추가해 총14건을 준비했다. pristine SCHEDULED·latestRevision=null은 허용하고 cancelled+draft는 교체 허용을 유지하도록 fixture를 강화했다. 기존 수정/템플릿 사례는 입력 뒤390→768→1440→390 전환마다 값·선택 날짜를 확인한 후 최종 PATCH/POST를 검증하도록 바꿨다. 전용 fixture의 POST 보호는 실제 BRACKET_LOCKED 계약과 일치시켰다. root RED 실행 전이므로 production template gate는 아직 수정하지 않았고, subagent의 테스트/Git/브라우저 실행은 없다. root RED→GREEN·committed 검증·fresh review·같은 PR push·alpha는 PENDING이다.

- 2026-10-15 PR #1931 review minimal fix: root가 실제 `mdqa138-revision-actual-red14.log`에서 미확정 리비전3건 FAIL·기존 consumer11건 PASS·기존 버튼 크기 스캔1건 PASS(합계3 FAIL/12 PASS,11.43초)를 확인했다. 세 실패는 모두 서버가 거절할 템플릿 교체 CTA가 노출된 동일 실제 증상이었고 두 작성 도중 viewport 전환 사례는 PASS였다. root 승인 후 모바일 templateBlockedReason의 non-cancelled fixture 조건에만 실제 game.latestRevision non-null 보호를 추가했다. 공용 fixtureHasStartedOrResult와 팀 배정·경기 정보 편집 권한은 바꾸지 않았다. pristine SCHEDULED·latestRevision=null과 cancelled 이력은 기존 조건을 유지한다. 소스·task 쓰기를 종료했으며 subagent 테스트/Git 실행은 없다. root의 수정 후14 consumer+size scan GREEN, committed 타입/패턴·새 immutable head 독립 리뷰·같은 PR push·alpha는 PENDING이다.
