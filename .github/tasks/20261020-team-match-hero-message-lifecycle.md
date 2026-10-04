# Task 20261020: 팀매치 상세 안내 timer 수명

Status: Review
**Owner**: Codex root → independent review → parent alpha QA
**Created**: 2026-10-04

## Context

이슈 [#1604](https://github.com/kim-song-jun/matchup-sports-platform/issues/1604). PR1603 CI37189594399 attempt1은 Web6233테스트 PASS 뒤 team-matches-page.test.tsx 환경 종료 후 team-matches-page.tsx:337 timeout의 setHeroMessage에서 window undefined로 실패했다. attempt2는09:01:59 UTC 성공했으나 원인 해결이 아니다. PR1603은09:03:32 UTC 외부 병합됐으므로 그 브랜치는 수정하지 않는다. 사용자는 별도 CI 원인 안정화를 명시 승인했다.

## Goal

실제 상세의 성공·실패·팀 선택 신청 안내가 자체2초를 유지하고, unmount 및 늦은 액션 완료에서 안내 timer가 남지 않도록 한다.

## Original Conditions (must all be satisfied)

- [x] 최신 안내의 TTL2초 보존, 이전 timer 취소.
- [x] unmount에서 실제 안내 timer 정리, 늦은 resolve/reject/신청 완료 후 새 timer0.
- [x] 안내 문구·API/권한/status gate·신청 결과 및 TTL 계약 유지.
- [ ] 실제 renderer RED/GREEN와 좁은 회귀·lint/typecheck·guard·exact head CI·독립 리뷰.
- [ ] fresh origin/dev 독립 WT·전용 branch·명시 pathspec·Ready/base dev 후속 PR.
- [ ] alpha 후속은 별도 승인된 배포 뒤 실제 이동/연속 액션으로 검증.

## User Scenarios

팀매치 상세에서 공유 성공/실패 안내를 본 뒤 다른 페이지로 이동한다. 연속 공유에서 최신 안내는 자체2초를 유지한다. 팀 선택 신청 후 이동하거나 액션 중 이동했을 때 뒤늦은 완료가 떠난 화면의 안내를 예약하지 않는다.

## Test Scenarios

### Happy path
- [x] 실제 TeamMatchDetailPageView/model/QueryProvider와 실제 팀 선택 sheet를 실행. Next/API 동작 경계만 synthetic callback.
- [x] 성공·실패 각각1999ms 표시,2000ms 종료. 안내 없는 이동 액션은 timer0.
### Edge cases
- [x] 성공→성공/성공→실패/실패→성공 최신TTL.
- [x] 성공·실패·신청 안내 unmount 취소와 늦은 action resolve/reject/신청 완료.
### Error paths
- [x] 실제 실패 문구 유지, 오류를 성공으로 숨기지 않음.
### Mock data updates needed
- [x] 신규 local test synthetic fixture만 사용. 실제 팀/QA179/DB/seed/API 변경0.

## Parallel Work Breakdown

Root는 제품·task·changeset·commit/PR/CI를 소유한다. 독립 child는 신규 회귀 test만 작성했으며 제품 수정/커밋/브라우저0. 모든 test/lint는 root가1worker 직렬 실행한다. 부모 browser는 타 작업자 전용이므로 건드리지 않는다.

### Owned files

`apps/v1_web/src/components/team-matches/team-matches-page.tsx`, `team-match-hero-message.test.tsx`, 이 task, `.changeset/team-match-hero-message-lifecycle.md`.

### Forbidden files

PR1602 range/다른 미병합 PR 변경, merged PR1603 branch, shared WIP, API/DTO/schema/권한/status gate/신청 계약, CSS/layout/alpha 실제 data/QA179/완료 결과. merge/deploy/paid review0.

## Acceptance Criteria

- [ ] Original Conditions의 local/remote 검증과 exact commit 리뷰를 PR에 기록.
- [ ] committed tree clean/pathspec4/diff check/debt markers0.
- [ ] alpha before는 미확보로 표시, after는 승인 배포 후속. local jsdom은 화면 증거가 아님.
- [ ] 이슈는 Refs만 사용하고 실제 alpha 수용 조건 전에는 종료하지 않음.

## Tech Debt Resolved

관리되지 않은 세 hero 안내 timeout을 하나의 컴포넌트 수명으로 관리한다. 이전 timer의 최신 안내 조기 삭제와 늦은 액션의 떠난 컴포넌트 업데이트를 정리한다.

## Security Notes

권한/API/점수/가입/결제/실제 상태 변경0, .env/비밀 접근0. 서버 실패 결과를 숨기지 않는다. 외부 전체 로그를 출력하거나 저장하지 않고 공개 CI의 필요한 오류만 인용한다.

## Risks & Dependencies

jsdom test는 실제 네트워크/물리 키보드/viewport/CSS 검증이 아니다. 이 CI 오류의 실제 alpha before 이미지는 확보하지 못했다. UI 배치/문구/TTL 변경은 없으나 실제 alpha 이동·신청/공유 성공실패와 console/network 확인은 승인 배포 후 부모 QA 범위다. 관련 없는 timer를 모두 취소하는 test hack/전역 오류 suppression/typeof window silent fallback을 사용하지 않는다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-04 | Parent | attempt2 CI 성공이 원인 해결인가? | 아님. 실원인 cleanup과 좁은 회귀를 별도 승인. |
| 2026-10-04 | Root | PR1603이 수정 준비 중 병합됨 | fresh origin/dev117fa596에서 후속 WT/branch, 기존 merged branch 수정0. |
| 2026-10-04 | Root | 첫 timer test global timer count에 unrelated timers 혼입 | 관측을 계약TTL2000ms의 실제 timer로 분리 후 제품 수정 전 재현. 초기10FAIL중 가짜 global count 실패를 원인 RED로 세지 않음. |

## Progress Snapshot

- Fresh fetch origin/dev117fa596b6246b25565de5c675119e7eb59b09f2. WT `/tmp/teameet-team-match-hero-message-20261004`, branch `fix/team-match-hero-message-lifecycle`. 현재 다른 열린 PR은1602뿐으로 원인 수정 중복0.
- 기존 FAB WT에서 child가 작성한 신규 timer test파일만 복사. 제품/미병합 range 코드는 복사하지 않았다.
- 첫12테스트 실행2PASS/10FAIL 중 연속 안내3FAIL은 실제 DOM 조기 종료를 재현했다. 남은 count 단언은 unrelated timer 혼입으로 관측 수정 중이며 아직 cleanup RED/GREEN으로 세지 않는다.
- 사용자는 승인된 tests 실행을 명시했고 root는 높은 host load를 보고1worker 직렬. 타 세션 프로세스 종료0.
- 수정된 관측의 제품 변경 전 RED9FAIL/3PASS: 연속 안내3, unmount cleanup3, 늦은 resolve/reject/신청 완료3이 실제 DOM 또는 남은 계약TTL2000ms timer에서 실패했다. unrelated0/120/2200ms timer는 집계하지 않는다.
- 제품 수정 후 실제 view/model/QueryProvider/picker 신규12와 기존 team-matches-page135 **2files147/147 GREEN**,13.23초,1worker 직렬. 기존 팀 선택 신청/실패/상태·UI 문구 경로를 함께 실행했다. full suite/DB/browser/CSS 검증은 아니다.
- effect는 StrictMode 재설정에서 mounted=true로 복원하고 cleanup에서 false 및 실제 안내 timer를 취소한다. 공유/신청 성공과 실패가 같은 showHeroMessage를 사용하며, 이전 timer를 취소하고 새로운2초를 시작한다. 떠난 컴포넌트의 늦은 결과는 새 timer를 만들지 않는다. 전역 window 가짜 fallback/오류 suppression0.
- Host preflight12cores/load59.49·75.23·88.18, swap10092.06/11264MB, Node215/browser38/Docker8up5healthy. 명시 사용자 지시로 최소 worker 직렬 진행했다.
- 내부 독립 product reviewer는 root 제품1파일과 실제 client/picker/actions를 읽고 신규 P1/P2 지적0을 보고했다. test 작성자 본인의 test를 독립 검증으로 세지 않았고 실행0/alpha0이다. reviewed product diff SHA2560ee67d08631ee95d0985fd53f87d3539d441b28e133d6edad375cac4094f1bee. StrictMode setup/cleanup/setup는 정적 검토이고 실제 StrictMode/remount 브라우저는 후속 범위다.
- 필수6guard PASS(Android Play/v1 DB/prod security/compose parity/alpha seed/alpha immutable). lint/typecheck·exact commit CI·외부 전체 diff 재리뷰는 다음 PR 기록으로 고정한다.
- 첫 lint는 새 test instrumentation의 DOM/Node 전역 timer overload 타입 충돌3개로 실패했다. window 객체를 실제 DOM Window 타입으로 좁혀 제품 변화 없이 정리했다. actual timer12/12 재검증 PASS(4.40초), lint(typecheck+v1-pattern) 재실행 PASS. 기준 full renderer147 결과는 제품이 동일하며 type-only test 수정 전이고 최종12 재실행을 별도 기록한다.
- root가 신규 test의 실제 timer 위임/DOM TTL/취소 ID/늦은 추가예약0 단언을 검토했다. 강제 afterEach cleanup은 각 assertion 뒤에만 수행되며 fake-pass 오류 suppression은 없다.
