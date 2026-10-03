# Task 192: 완료 리그 참가 명단 진입 안내

Status: Review
**Owner**: issue #1538 수정 세션
**Created**: 2026-10-02

## Context
Refs #1538. 완료 리그의 경기별 명단 ‘선수 추가·빼기’ 링크는 실제 참가 명단의 읽기 전용 화면으로 이동한다. 실제 CSS402/787/1180 control crop6장/[proof](https://github.com/kim-song-jun/matchup-sports-platform/tree/aea20c6d2a1ffe26194017a1a1c71eda0a46cb6d/docs/qa/2026-10-02-completed-league-action-copy)는 모두 before이며 편집 권한/저장 결함은 아니다.

## Goal
유용한 링크·from·키보드 목적지를 유지하고 리그 전체 완료의 설명/동작명만 조회 안내로 바꾼다. 진행 중 리그의 개별 LIVE/ENDED 경기와 전체 리그 종료를 혼동하지 않는다.

## Original Conditions (must all be satisfied)
- [ ] 전체 완료 리그의 실제 안내가 조회 동작과 일치하고 추가/제거를 암시하지 않음.
- [ ] 유용한 참가 명단 조회·Enter·복귀 유지.
- [ ] 같은 fixture의 실제 alpha 수정 후3폭 원본·UTC·목적지 기록.
- [ ] 목적지 읽기 전용/명단/결과/서버 권한 상태 유지, 실제 저장 없음.
- [ ] 승인된 alpha 배포와 전체 조건 뒤만 종료. 현재 OPEN/Refs 유지.

## User Scenarios
1. 종료된 리그에서는 명단을 조회할 수 있다는 안내와 동일 목적지 링크를 본다.
2. 진행 중 리그는 경기만 LIVE/ENDED여도 참가 명단 편집 안내를 유지한다.
3. 리그 상태 조회 로딩/실패는 편집 가능으로 추정하지 않고 참가 명단에서 확인하도록 안내한다.

## Test Scenarios
### Happy path
- [x] 실제 GameRosterClient(block)·MatchTeamRosterCard(inline) + 실제 API hook/MSW에서 완료 리그 copy/href.
### Edge cases
- [x] in_progress+SCHEDULED/LIVE/ENDED, draft/open/closed, 기존 대회/팀원/신청 없는 fallback.
### Error paths
- [x] 조회 loading/403는 변경을 약속하지 않고 조회 링크 유지.
### Mock data updates needed
- 공유 game-roster MSW에 competitionKind만 독립 설정한다. 공개 tournament 상태 endpoint는 관련 두 테스트에서만 처리한다. gameState/editable/서버 저장 상태는 별도 축으로 유지한다.

## Parallel Work Breakdown
- Read-only 조사: 원본6 crop/proof 및 실제 목적지 status helper/backend gate/관련 PR1446·1470·1525 대조. 코드/테스트/로그인/데이터 쓰기 없음.
- Owned: `components/game-roster/registration-roster-entry.tsx`, `components/game-roster/match-team-roster-card.test.tsx`, `app/teams/[id]/games/[gameId]/roster/game-roster-client.test.tsx`, `test/msw/game-roster-handlers.ts`(모두 apps/v1_web/src/), 이 task, `.changeset/completed-league-roster-copy.md`.
- Forbidden: 다른 미병합 PR/worktree, API/DTO/schema/권한/eligibility/편집 gate/shared hooks, 실제 팀·가입·QA179·명단·등번호·완료 결과, merge/deploy/main/유료 리뷰 재요청.

## Acceptance Criteria
- [x] 실제 두 소비자 RED/GREEN·진행 리그 편집/개별 경기 gate 회귀·scope lint/type·6 aggregate/Changeset/diff/tech-debt.
- [ ] 명시6 pathspec 커밋·Ready/dev PR·exact-head CI/독립 리뷰 구분.
- [ ] 실제 before만 공개, after 및 전체 alpha 수용 조건은 배포 대기.

## Tech Debt Resolved
- 목적지와 달리 competition 상태 없이 참가 명단 편집을 단정하는 공유 진입 문구.

## Security Notes
- 기존 useV1Tournament와 같은 상태 조회를 리그 팀장 entry에만 추가. 게임/명단 editable 또는 권한을 수정하지 않는다.
- 실제 데이터/API 쓰기·개인 명단·인증/환경 파일/비밀값 조회 없음. 허용된 합성 control crop만 사용.

## Risks & Dependencies
- 전체 완료 리그만 실제 관측했다. 개별 종료 경기/취소 리그/실제 기기/serving SHA는 원본에서 미확보.
- 마감/잠금/신청 status의 전체 편집 권한 판정은 목적지와 서버가 계속 담당한다. 이 변경은 competition 상태에 맞는 문구이고 권한 gate가 아니다.
- 로직/기존 문구 분기만 바꾸며 새 배치/디자인 요소를 만들지 않는다. 실제 수정 after는 별도 승인된 alpha 배포까지 대기한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 조사 에이전트 | game editable=false를 사용해도 되는가? | 아니오. game editable은 개별 경기 SCHEDULED 조건. 목적지와 동일한 tournament status로 전체 리그 종료를 구별한다. |
| 2026-10-02 | 수정 세션 | 조회 상태 미확정일 때 편집 안내? | 로딩/실패를 사실대로 표시하고 유용한 확인 링크 유지. 대회·팀원은 추가 상태 조회하지 않는다. |

## Progress Snapshot
- Fresh origin/dev be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d; `/tmp/teameet-issue-1538-20261002`; branch `fix/issue-1538-completed-league-roster-copy`.
- 중복 없음. source는 공유 RegistrationRosterEntry 두 소비자; 목적지는 useV1Tournament/isTournamentRosterMutable와 서버 rosterBlockReason이다.
- 원본6 crop는 조사 에이전트가 확인. 서버 인가/실제 저장 검증으로 확대하지 않는다.
- 실제 두 소비자 신규14 RED:4 FAIL/10 PASS(39 SKIP),7.12s → 첫 GREEN 관련3 suite69 PASS(신규14+기존55),6.89s.
- 로딩 응답→완료 전환1건을 추가한 최종 두 소비자+목적지 deadline3 suite72 PASS(신규15+기존57),6.36s. 앞서 통과한 hook16과 합쳐 유일4 suite88건(신규15+기존73). 첫 hook run의 기존 act warning은 다른 권한 실패 테스트에서 나왔으며 이 변경으로 해결했다고 주장하지 않는다.
- scope frontend lint(typecheck+pattern),6 aggregate,patch Changeset policy,diff/tech-debt PASS. 단일 worker/직렬, 로컬 전체 suite/build/DB 재실행 없음. 호스트 load11.15/12.00/14.59, swap사용8262.25MB/총9216MB,Node195/browser86/Docker10,alphaHEAD200. 사용자 지속 진행 지시에 따라 최소 검증했다.
- 실제 서버 쓰기/브라우저/새 프로세스 없음. 커밋/Ready dev PR/exact-head CI·독립 리뷰는 PR 기록에 이어 남긴다. 실제 after는 별도 승인된 alpha 배포 대기, 원본 전체 조건/이슈 OPEN 유지.
