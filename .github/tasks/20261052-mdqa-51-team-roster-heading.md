# Task 20261052: MD-QA #51 경기 명단 관리 제목·팀 맥락·복귀 복구

Status: In Progress
**Owner**: root → frontend-ui-dev
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/51/

## Context
alpha E2E관리자의 팀 f39f5962-38e9-4a41-9553-6156924c56d1 game-rosters 데스크톱 CSS1188×760에서 팀명·제목·화면 내 팀 상세 복귀가 보이지 않는다. DOM Back 링크는 존재하나 비표시이며 h1/h2/h3이 없다. 원문은 다가오는 경기0개, browserBack 정상, 동일 팀 멤버 관리 헤더 정상이다. 모바일·경기가 있는 상태·serving SHA 미검증.

## Goal
기존 팀 관리 UI 패턴과 토큰으로 실제 팀명·경기 명단 관리 제목·팀 상세 복귀를 데스크톱에 제공하고 모바일 중복 헤더 없이 유지한다.

## Original Conditions (must all be satisfied)
- [x] 원문·재현·댓글0·미배정 접수 및 task/worktree/branch/열린PR·활성실행 중복 없음 확인.
- [x] root UI 선점 성공·김성준 확인 중 실제 표시 확인.
- [ ] 실제 결함 최소 수정 → 좁은 RED/GREEN → 독립 리뷰 → dev PR → 기존 리포트 댓글.

## User Scenarios
- 팀 상세 운영 메뉴 → 경기 명단 관리 → 실제 팀명·현재 페이지 제목 확인 → 화면 내 팀 상세 복귀.
- 경기0개/목록이 있는 상태·긴 팀명·모바일/태블릿/데스크톱에서도 맥락·현재 권한/오류 유지.

## Test Scenarios
- 실제 route consumer + 기존 실제 hooks/HTTP fixture를 사용해 heading/team/backHref를 검증한다.
- 현재 CSS breakpoint 규칙을 실제 stylesheet와 함께 평가하는 기존 responsive 테스트 패턴으로 RED/GREEN. 단순 class 문자열이나 jsdom visible만 주 증거로 쓰지 않는다.
- 기존 roster API/load/error/권한/조작 흐름을 유지. alphaBefore와 수정 SHA 배포 후 viewport별 after를 구분한다.

## Parallel Work Breakdown
- UI Owned: apps/v1_web/src/app/teams/[id]/game-rosters/team-game-rosters-client.tsx 및 좁은 responsive 회귀 test(기존 동일client spec 또는 새 spec). root exact 승인 없이 shared component/hooks/types/API/다른route 변경 금지.
- Forbidden: shared hooks/types/MSWhandler/API/DTO/schema/roster mutation logic/다른 WT/state/task/.env/Git/browser. Root task/Changeset/브라우저/통합/Git/PR 소유.
- 혼자가 아니다. 타인 변경 보존. 테스트는 root serial slot 승인 후 최소 worker, 자체 stage/commit/push·전체suite/build/localNext 금지.

## Acceptance Criteria
- [ ] 실제 팀 데이터 heading과 desktop in-page 팀 복귀, 모바일 중복 제목 없음.
- [ ] empty/loaded/error/permission/long title·viewport 계약 유지.
- [ ] 실제 responsive RED/GREEN, committed scope/type/pattern, exacthead Critical0Warning0 독립리뷰.
- [ ] base dev PR·원문 댓글 저장 성공, alpha배포 전 해결 PASS로 표현하지 않음.

## Tech Debt Resolved
모바일 전용 숨김에 의존해 desktop 팀 관리 맥락이 사라지는 문제를 기존 이웃 관리 패턴으로 정리한다. 장식/새 디자인 체계는 추가하지 않는다.

## Security Notes
현재 팀 route 엔티티로만 hydrate하며 다른팀mockfallback/권한확대/쓰기변경 없음. .env와 비밀 읽기·출력 금지.

## Risks & Dependencies
managed WT는 즉시 fetch origin/dev9edd47d07606e5920cd28f1cd80b70e88857278a 기준. 기존 #5명단 데이터·#29전적 복귀·#46플랫폼 제목은 별도 증상이다. DESIGN.md와 v1 reference·현재tokens 우선.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report51 | 로딩/실경기/모바일? | 원문범위밖. 현재consumer/adjacentpattern 계약을 조사하고 좁은회귀로 보완. |

## Progress Snapshot
- WT C:/Users/kinso/.codex/worktrees/mdqa-51-team-roster-heading/matchup-sports-platform; branch fix/mdqa-51-team-roster-heading; base9edd47d07606e5920cd28f1cd80b70e88857278a.
- 원 checkout0550/report51-detail-before-claim.txt, report51-claimed.txt/png. root17:36KST UI 선점 확인.
- Phase B 최소 구현과 좁은 RED/GREEN 완료, root serial slot 반환. Phase C Changeset·committed-tree/type/pattern 검증·독립 리뷰·dev PR·원문 댓글·alpha after는 root 담당으로 남아 있다.
- 기존 TeamMembersPageView의 desktop heading/AppBackLink 패턴과 useV1TeamDetail(teamId)를 재사용했다. 현재 route 팀명만 표시하며 팀 정보 loading/error/retry를 명시하고, 기존 roster 읽기·권한·저장/토글 흐름은 유지했다. 공유 hook/type/MSW/component/API 변경 없음.
- source unchanged RED: 신규 heading spec 15개 중 9 FAIL / 6 PASS. 최소 source patch 후 GREEN: 신규 heading 15 + 기존 roster 소비자 17 = 32/32 PASS, 2 specs, 9.19초, exit 0. 로그: tmp/qa/mdqa-51/red.txt, tmp/qa/mdqa-51/green.txt.
- GREEN command: `pnpm --filter v1_web exec vitest run 'src/app/teams/[id]/game-rosters/team-game-rosters-client.heading.test.tsx' 'src/app/teams/[id]/game-rosters/team-game-rosters-client.test.tsx' --maxWorkers=1 --fileParallelism=false`. RED는 같은 옵션으로 신규 heading spec만 실행했다. 추가 test/type/lint/build/Git/browser 실행 없음.
- 실제 AppShellFrame·route consumer·기존 HTTP hooks 및 roster MSW factory를 사용하고 현재 desktop stylesheet의 media 규칙을 평가했다. 390/502/768/1188/1440 폭의 empty/loaded, 긴 실제 팀명, 팀 정보 loading→성공 및 503→재시도 성공, roster 403/503, 현재 route back 클릭을 검증했다. 팀 재시도 시 team GET만 2회이고 roster matrix GET은 1회임을 확인했다.
- preflight: CPU 47%, logical CPU 12, free RAM 11154/32677 MB, pagefile 478/17408 MB, Node 64·Edge 10. Docker daemon unavailable, local 3013/8121 listener 없음; 이 좁은 unit 검증의 HTTP는 MSW로 처리했다. Vitest 종료 후 deferred 응답·QueryClient·server·style·navigation history·timer/env를 정리했고 slot을 반환했다. touched source/tests TODO/FIXME/HACK/XXX 및 trailing whitespace 0.
- 증거 한계: 위 결과는 HTTP fixture와 jsdom에서 실제 CSS 규칙을 평가한 소비자 회귀 증거이며, 실제 브라우저 배치나 원문 팀 API/alpha 실측을 대신하지 않는다. 원문의 alphaBefore는 E2E 관리자 1188×760, serving SHA 미확인이고 mobile/live-game before는 미검증이다. 수정 SHA의 viewport별 alpha after·console/network 확인은 아직 남아 있다. RED 로그 말미 pnpm의 `Command "vitest" not found` 문구는 실제 Vitest assertion 실패 뒤의 wrapper 출력이며, RED 본문에 15개 실행 및 9개 assertion 실패가 기록되어 있다.
