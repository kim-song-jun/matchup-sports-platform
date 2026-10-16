# MD-QA #161: Alpha 캠페인 FAQ 신청 마감 일시 표기

Status: In Progress
**Owner**: QA root → dedicated backend data owner
**Created**: 2026-10-16

## Context
https://teameet.jmandu.kr/issues/161/ 의 설명·재현·최근 댓글과 담당 상태를 실제 인증 IAB에서 읽었다. Alpha 추천 캠페인 FAQ에 시드의 ISO 문자열이 그대로 표시된다. 769×757 및 500×757 첨부는 제보자의 원 증상 증거이며 수정 후 검증이 아니다. 날짜 값 불일치를 다룬 이전 #1403/PR1416과 구분한다. root는 SSOT·task·worktree·열린 PR을 대조해 중복 작업이 없음을 확인하고 실제 UI에서 김성준 담당·확인 중 저장 성공을 확인했다.

## Goal
Alpha 시드 캠페인의 신청 마감 FAQ가 같은 instant를 한국 시간의 읽기 쉬운 한국어 일시로 표시한다.

## Original Conditions
- [x] 담당자 제한 없는 목록에서 새 미배정 접수를 발견하고 선점 저장을 확인한다.
- [x] fetch origin dev 직후 managed origin/dev a264 기반 전용 worktree와 feature branch를 사용한다.
- [ ] 실제 실패 회귀 → 최소 수정 → committed GREEN → 독립 리뷰 → dev PR → 같은 리포트 댓글.

## User Scenarios
공개 캠페인 alpha-qa-futsal-recruiting의 ‘신청 마감은 언제인가요?’를 펼치면 2026-09-29T14:00:00.000Z 대신 ‘2026년 9월 29일 (화) 오후 11:00 (한국 시간)’처럼 같은 일시를 이해할 수 있어야 한다. 연결된 대회 상세의 마감 instant는 바꾸지 않는다.

## Test Scenarios
- 실제 Alpha campaign builder의 FAQ 소비 계약에서 ISO 출력 RED 및 한국어 KST GREEN.
- UTC→KST 날짜·연도 경계, 오전/오후, 분 표기 및 host timezone 독립성 대조군.
- 시드 콘텐츠 생성·재실행 경로를 확인하되 실제 DB seed/reset은 실행하지 않는다.

## Parallel Work Breakdown
Phase A: backend data owner는 현재 v1 seed와 기존 좁은 테스트의 실제 builder seam을 조사하고 tests-only RED를 준비한다. root가 실행해 동작 RED를 확인한 뒤 최소 production 수정만 승인한다. Phase B: root 단일 검증 슬롯에서 committed regression·필요 타입 및 source/debt/path gate를 실행하고 별도 독립 리뷰를 받는다. Root가 Git/PR/브라우저/SSOT/댓글을 맡는다. 다른 작업자가 있으므로 타인 변경을 되돌리지 않는다.

Owned 후보: apps/v1_api/prisma/seed-alpha-tournament-qa.ts, 기존 src/tournaments/seed-alpha-tournament-qa.spec.ts, 이 task, 필요 patch Changeset. Forbidden: shared hooks/types/MSW/DTO/schema·다른 seed·정책·타인 task·다른 worktree·.env·비밀·runtime·브라우저·subagent Git.

## Acceptance Criteria
- [x] 같은 instant를 한국어 KST로 표기하며 production/shared date renderer에 영향이 없다.
- [x] 실제 builder 경계의 RED/GREEN과 경계 대조군, committed diff 검증 및 독립 C0/W0.
- [x] 제품·fixture·문서 drift를 현재 범위에서 정리하고 필요한 Changeset을 포함한다.
- [ ] 최신 PR CI/리뷰·배포·실제 alpha·원 리포트 댓글·이미지는 확인한 상태만 기록한다.

## Tech Debt Resolved
Alpha 시드의 사용자 노출 FAQ에 직렬화용 ISO를 쓰던 콘텐츠 혼동만 바로잡는다.

## Security Notes
읽기 쉬운 표기로만 바꾸며 날짜 값·인가·결제·등록·개인정보를 변경하지 않는다. Alpha DB 직접 seed/reset·프로덕션·main 작업 및 .env 읽기는 금지한다. 배포 이미지의 prisma 모듈은 src를 import하지 않는 기존 경계를 유지한다.

## Risks & Dependencies
관리형 생성은 성공했고 등록은 채팅 attachment identity100 한도로 실패했다. 동일 실제 checkout을 보존했고 attach_worktree 재시도는 Server overloaded로 실패했으며 중복 생성하지 않는다. Alpha 배포의 기존 fixed scenario 캠페인 재생성 경로는 확인했으나, 코드 수정만으로 기존 DB/alpha 화면이 해결됐다고 말하지 않는다. IAB 캡처는 오류/빈 화면으로 실제 증거 미확보 상태다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-16 | root | 일반 날짜 렌더러 오류인가 | 원 리포트와 현재 seed는 Alpha FAQ 문자열의 가독성 문제로 한정한다 |

## Progress Snapshot
- 2026-10-16 root: report161-claimed-verified.txt 실제 UI 선점 확인. base a2647c89982bfc6acfbdaa209b80f8d11601a6f2, branch fix/mdqa-161-alpha-faq-deadline, worktree mdqa-161-alpha-deadline. 구현·RED/GREEN·PR·수정 후 alpha는 NOT RUN. 기존 FAQ의 toISOString 경로를 확인했고 tests-only 독립 조사·준비를 dispatch한다.
- 2026-10-16 backend Phase A: 기존 `src/tournaments/seed-alpha-tournament-qa.spec.ts`에 실제 builder → JSON round-trip → 실제 campaign parser의 FAQ 답변 회귀 5개(제보 instant·다음 날 자정·연도 경계·오전·정오/분)와 실제 `createScenario`의 campaign create payload 회귀 1개를 준비했다. 원래 Date instant와 대회 update의 마감 필드 보존도 단언한다. 테스트 이름 필터는 `신청 마감 FAQ를 한국 시간으로 저장한다|재실행 시 보존된 신청 마감 instant`. Tests-only freeze이며 production·test 실행·tsc/lint·Git·DB·seed·브라우저는 NOT RUN; root의 실제 RED 실행을 기다린다.
- 2026-10-16 backend read-only contract: `V1Tournament`(`v1_tournaments`)의 기존 complete schedule을 보존한 채 fixed scenario id로 `V1TournamentCampaign`(`v1_tournament_campaigns`)을 tournamentId 범위 delete/create하며 builder의 새 content를 저장한다(seed `createScenario`/`clearScenarioLeaves`). Alpha deploy는 `deploy/deploy-alpha.sh`에서 flags와 함께 `node dist/prisma/seed-alpha-tournament-qa.js`를 실행하며 이 seed 실패는 배포를 중단한다. 다음 성공 배포의 실제 콘텐츠 갱신은 미검증이다. Schema/migration 변경은 필요 없다. Jest config의 UTC 고정에서 KST 경계를 검증하며 별도 다른 host TZ 실행은 하지 않았다. 최소 production 후보는 해당 FAQ answer의 ISO 직렬화만 explicit `Asia/Seoul` 한국어 Intl 일시 + `(한국 시간)`으로 치환하는 것이다.
- 2026-10-16 root RED: `mdqa161-deadline-real-red.log`에서 6 FAIL / 기존 18 PASS / 총 24, 17.594s, exit 1을 확인했다. 5개 경계 사례와 실제 createScenario 저장 경로 모두 기대한 한국어 일시 대신 실제 ISO 답변 때문에 실패했다. 이 동작 RED 확인 뒤 root가 최소 production 수정을 승인했다.
- 2026-10-16 backend 수정 freeze: 일반 QA FAQ answer 한 곳을 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })`와 `(한국 시간)`으로 치환하고 fixed API/Web patch Changeset을 추가했다. 새 import/helper·schema·마감 값·공유 renderer·다른 seed 변경은 없다. GREEN·tsc/lint·committed diff·독립 리뷰·PR·배포·alpha 화면은 아직 NOT RUN이며 root 단일 검증 슬롯으로 넘긴다.
- root committed `633f000eba544f64961dbd925264cb9a2796140c`의 첫 GREEN 시도는 `mdqa161-633-seed-green.log`에서 6 FAIL / 18 PASS / 24, 127.944초, exit1이었다. ISO 대신 한국 시간으로 표시됐으나 현재 ICU가 요일 괄호를 생략해 `...일 화 오후...`로 출력했다. 테스트 기대를 바꾸지 않았으며 API 타입·surface 단계는 이 실패 때문에 미실행이다.
- 2026-10-16 02:51Z 재개: 기존 실행·작업트리를 복원했고 별도 활성 worker는 없었다. 최신 실제 dev는 `e89556ad7a8c7240d5180420fb1e7446a0551cd1`로 FF 완료했다. root가 동일 FAQ의 `formatToParts`에서 요일만 괄호로 표시하고 기존 literal 괄호를 제거해 ICU 차이에 따른 괄호 누락·중복을 막는 최소 수정을 했다. 명시 KST·원래 instant·기존 6개 회귀는 그대로다. 최신 dev 통합·committed GREEN·독립 재리뷰·PR은 이어서 수행한다.
- 2026-10-16 root committed 검증: 최신 dev e895를 정상 merge한 `19c557a9d70c441bcedeb7d3d5d3a7313ed6032c`에서 실제 FAQ·createScenario 24/24 PASS(87.168초), API tsc --noEmit exit0, v1 surface 685개 스캔 PASS를 확인했다. 기존 API 의존성 실행 파일이 사라져 offline/frozen/API-only 설치(817개 재사용, 다운로드 0)와 Prisma client generate만 수행했으며 .env·DB seed/reset은 읽거나 실행하지 않았다. 복구된 Jest의 Windows .codex 경로 testMatch 정규화로 초기 두 실행은 No tests found/exit1이었다. 해당 로그를 NOTRUN으로 보존했고 동일 unit glob을 상대 경로 `**/src/**/*.spec.ts`로 지정하고 exact spec path만 실행해 실제 24개를 실행했다.
- 별도 backend-review가 e895...19c의 4/4 committed 파일, 실제 공개 소비·JSON/parser·일정 보존·Intl 경계·보안과 배포 seed 경로를 직접 검토해 Critical0/Warning0를 기록했다(.omo/evidence/mdqa161-19c-independent-review.md). 리뷰어는 테스트·DB·브라우저를 실행하지 않았다. 원 ISO RED와 첫 633의 요일 괄호 실패는 삭제하지 않았다.
- 원 리포트 선점은 실제 UI로 확인했으나 현재 turn의 tool inventory에서 인증 IAB 제어 도구가 제공되지 않는다. 새 unfiltered census·원 리포트 진행 댓글·이미지 첨부·390/768/1440 alpha FAQ·console/network는 아직 미검증이다. PR 생성·CI·dev 머지·성공 배포 후 데이터 반영과 실제 alpha를 계속 추적하며 완료·영구 삭제는 하지 않는다.
