# MD-QA #156: 참가 선수 재추가 때 과거 경기 빠짐 상태 재등장 방지

Status: In Progress
**Owner**: QA root → dedicated backend owner
**Created**: 2026-10-16

## Context
https://teameet.jmandu.kr/issues/156/ 의 실제 설명·재현·최근 댓글을 읽었다. 경기별 빠짐 저장 후 리그 참가 명단에서 제외→재추가하면 이전 경기의 빠짐이 조용히 부활한다. 다른 시작 전 경기는 출전인데 해당 경기만 빠짐이며, 추가 안내는 시작 전 경기 반영을 약속한다. 전체 열린 dev PR5건에 이 수정은 없고 #146은 별도 기본 명단 계약이다. 실제 UI 김성준 담당·확인 중 저장을 확인했다.

## Goal
참가 제외·재추가가 시작 전 경기의 출전 상태와 실제 안내에 일관되게 반영되며 과거 공식/진행 경기 이력을 보존한다.

## Original Conditions
- [x] 실제 UI 선점 저장과 담당/확인 중 표시 검증.
- [x] fetch 직후 managed origin/dev57c6097 기반 전용 checkout.
- [ ] 실제 결함·좁은 RED·최소 수정·committed GREEN·독립 리뷰·dev PR·기존 댓글 완료.

## User Scenarios
시작 전 경기에서 A를 이번 경기만 제외한 뒤 리그 참가 명단에서도 제외하고 다시 추가한다. 추가 안내대로 시작 전 경기 출전에 반영되거나, 계약상 유지되는 제외가 있으면 이를 정확히 안내한다. 이미 시작/종료된 경기와 공식 이력은 손대지 않는다.

## Test Scenarios
- 실제 제외→재추가→경기 roster consumer/worker 경로의 좁은 회귀.
- 다른 선수/팀/경기, 진행·종료 경기, 취소/거부 요청, 멱등/권한 경계.
- stale 경기별 제외를 정리할 경우 대상 상태·선수·팀 범위를 정확히 제한하고 공식 이력 보존.

## Parallel Work Breakdown
Phase A owner: v1 규칙·현재 소스를 읽고 exact owned production/test 경로와 최소 정책 일치를 제안한 뒤 테스트만 준비. Root actual RED 전 production 변경 금지. Shared hooks/types/MSW/DTO/schema 금지. Root owns serial validation, Git, PR, independent review integration, browser, SSOT. Worker self-commit/tests/runtime/browser 금지. 다른 에이전트의 작업을 되돌리지 않는다.

## Acceptance Criteria
- [ ] 원 증상과 실제 안내의 일치, 과거/다른 사용자 이력 보존 대조군.
- [ ] 실제 RED→최소 수정→committed GREEN과 독립 C0/W0.
- [ ] 필요한 API 문서/fixture/Changeset과 diff/debt/import 검수.
- [ ] base dev PR·실제 CI/스레드, 배포 SHA alpha·댓글·이미지 저장 확인.

## Tech Debt Resolved
확인된 범위 내 상태 drift만 정리한다.

## Security Notes
기존 권한·행 잠금·CAS·멱등을 유지하고 참가자 개인정보/비밀은 출력하지 않는다. 과거 경기/감사/공식 결과 삭제 금지.

## Risks & Dependencies
#155와 같은 roster 영역이어도 별도 worktree와 경로 소유권으로 조정한다. #146의 미제출 기본 명단과 중복하지 않는다. Attachment100 제한은 기록하고 중복 checkout을 만들지 않는다. 고부하 검증과 브라우저는 root 단일 슬롯.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-16 | root | 제외 정리 시점·범위 | 현재 v1 코드와 리포트 기대를 대조해 가장 작은 올바른 경계 확정 |

## Progress Snapshot
- root: report156-claimed.png 실제 담당·확인 중 보존. base57c6097. 조사 시작 전, 구현/RED/GREEN/PR/alpha NOTRUN.
- backend Phase A: `TournamentPlayersService.insertPlayerIntoRoster`는 같은 registration/user 행의 `removedAt`을 되돌리지만 경기별 `V1GameRosterAdjustment`는 userId 기준 활성 상태로 남는다. `loadGameRosterForContext`와 resync worker가 이를 다시 적용하는 경로를 독립 read-only audit으로 대조했다.
- TEST ONLY: `apps/v1_api/src/tournaments/tournament-players.roster-readd.service.spec.ts` 준비. 실제 service → outbox payload → worker → roster loader/제출 명단 소비와 다른 선수·팀·리그/진행·종료·취소/늦은 이벤트·멱등 대조군. root RED 대기; production·테스트 실행·Git mutation 없음.
- 제안 owned production: `tournament-players.service.ts`, `games/roster/roster-resync-events.ts`, `games/roster/game-roster-sync.ts`. 재추가 시 기존 제외 ID를 snapshot하고 기존 lock 순서의 worker에서 대상 SCHEDULED 경기만 SYSTEM revoke하는 최소 변경을 제안했다. 새 제외·감사 이력·과거 공식 결과 보존. schema/migration/DTO/frontend 변경 불필요.
- root actual RED: `mdqa156-roster-readd-red.log`, 7 cases = 2 FAIL / 5 PASS, 29.126s. 실제 소비 명단에서 returning 누락(`[]`)과 SYSTEM 되돌림 ID 부재로 실패. root가 이 증거 후 제안한 세 production 경로와 인접 unit fixture seam 동기화를 승인했다.
- 구현 후보: 기존 제외 ID만 담은 `competitionPlayerReadded` outbox target을 추가했다. 등록 트랜잭션은 ID 조회·enqueue만 하고 경기 잠금은 기존 worker 순서를 유지한다. worker는 잠근 뒤 현재 상태·사이드·공식 결과·미이관 팀 제출본 가드를 재검사하고 해당 ID만 SYSTEM revoke 후 명단을 계산한다. 진행·종료·취소/다른 선수·팀·리그/늦은 이벤트·새 제외/멱등 보존. 기존 unit fixture의 typed `v1GameRosterAdjustment.findMany`/default `[]` 두 줄만 추가했다.
- GREEN/타입/통합 검증은 root 단일 슬롯 대기. 작업자 테스트·Git mutation·runtime/browser 실행 없음.

- 2026-10-15 root final committed gate: HEAD80a2c4acab7140bcbb9c050c3e0af225f3a718b2 integrateddev a264, independent9/9 C0/W0 with production/spec fingerprints unchanged. Actual re-add7 plus existing players spec2files129/129PASS143.752s; API tsc --noEmit --incremental false exit0; surface683/rawSQL32 baseline32/directlookup0/leagueallow34 PASS after correcting Windows FIND executable selection. Initial surface enumeration failure is NOTPASS and retained. New source has no added debt markers/untracked app imports. Root prepares dev PR; actual PostgreSQL race/CI/deployment/alpha390/768/1440/comments/images remain pending, never inferred from unit/type PASS.
- PR #1944 P2 재리뷰: 미이관 팀 제출 명단의 조기 반환이 캡처된 제외 되돌림까지 건너뛰는 순서 결함을 실제 서비스·이관 계약과 대조했다. 제외/되돌리기는 미이관 상태에서도 허용되며 이관은 활성 제외를 입력으로 보존한다.
- root actual P2 RED: `mdqa156-legacy-guard-red.log`, 8 cases = 1 FAIL / 7 PASS, 128.117s, exit 1. `미이관 팀 제출 명단은 그대로 두고 재추가 전의 캡처된 빠짐만 되돌린다`에서 기대 `revokedAt=NOW`, `revokedByRole=SYSTEM` 대비 실제 `null/null`로 정확히 실패했다.
- 승인된 최소 P2 수정: `game-roster-sync.ts`에서 기존 미이관 명단 반환만 캡처 ID 되돌림 뒤로 옮겼다. context/state/base/currentOfficial·현재 game/side/team/user·고정 ID 조건과 잠금 순서는 유지한다. 기존 팀 제출 명단·참가자·감사 기록은 다시 쓰지 않고, 새 제외 ID 및 과거·공식 경기 보호를 유지한다.
- P2 GREEN·타입·독립 재리뷰·Git은 root 단일 슬롯 대기, 작업자 실행 없음. P2 작업자 변경 범위는 기존 회귀 spec, `game-roster-sync.ts`, 이 Progress Snapshot뿐이다.

- root P2 committed gate: 수정 커밋 f4a848706의 실제 service→outbox→worker→loader 회귀 8/8 PASS(93.752초), API TypeScript --noEmit --incremental false 종료 코드0, surface683 기존 baseline 일치 PASS. 기존08 통합본129/129 PASS는 이전 검증 이력이며 이8건과 합쳐 같은 실행의130건으로 표시하지 않는다. 구현자 외 적대적 재리뷰 C0/W0, 정확한 source/spec fingerprints는 mdqa156-legacy-guard-review.md에 보존한다. 명단 이관·현재 저장 스냅샷 쓰기를 확대하지 않았고 이후 명시적 이관이 새 제외 ID를 만들 수 있는 기존 정책은 보호한다. 최신 PR CI·정식 재리뷰·실제 alpha는 대기다.

- 2026-10-16 root: 원격 d186 PR1944에 최신 dev e895를 정상 merge해 1eda59878을 만들었다. games.md의 유일한 충돌은 #156 재추가 문단과 #146 미제출 친선 명단 문서를 함께 보존하고 폐기된 제출 필수 설명만 제거했다. 9개 intended 파일과 diff-check를 확인했다.
- 별도 독립 리뷰가 1eda의 9/9 파일에서 inline registration mock의 _count.players 누락을 실제 결함(C1)으로 찾았다. 같은 committed tree의 실제 서비스→outbox→loader 회귀는 5 FAIL/3 PASS/8, 30.887초, exit1로 실패했다. 누락 필드를 optional fallback으로 우회하지 않고 실제 relation count 계약대로 제거 이력까지 포함한 players.length를 mock에 제공하는 한 줄만 고쳤다. 기존 captured EXCLUDE ID·시작/공식 결과/팀/사이드/멱등 계약과 모든 기대값은 유지한다. 초기 공유 .bin 상대 경로 launch 실패는 NOTRUN 별도 보존했으며 RED로 계산하지 않았다. 새 immutable head의 GREEN·독립 재리뷰·같은 PR normal push를 이어 수행한다.