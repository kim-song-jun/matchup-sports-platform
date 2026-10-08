# Task 20261062: QA #63 단발 리그 대회 진행 안내

Status: In Progress
**Owner**: root / mdqa_48_recruitment_status
**Created**: 2026-10-09
**Report**: https://teameet.jmandu.kr/issues/63/

## Context
단발 대회(kind regular_tournament, format league)의 진행 안내가 시즌 주차 수를 언급한다. PR1695는 마지막 format fallback의 문구를 고쳤지만 현재 origin/dev2edc에서도 앞선 isLeagueCompetition 분기가 같은 대회를 먼저 잡는다. 실제 alpha 제보 두 대회의 설명과 새로고침 증거가 있다. 코드 누락·캐시를 원문만으로 추측하지 않고 현재 v1 조건을 확인한다.

## Goal
단발 리그 방식 대회는 기존 대진표 확인 안내를 실제로 렌더하고, 정규 시즌 리그의 기존 주차 안내를 유지한다.

## Original Conditions (must all be satisfied)
- [x] 원문 설명·재현·최근 댓글0을 읽음; UI 내가 처리하기 저장 및 김성준/확인 중 표시 확인.
- [x] 코드 소비자에서 단발 대회에 시즌 주차 수 안내가 노출되지 않음; 실제 alpha AFTER는 별도 대기.
- [x] 몇 번 맞붙는지는 대진표에서 확인하도록 기존 정확한 문구를 사용.
- [x] 실제 경기 수·결과·대진 편성·전역 competition classification은 변경하지 않음.

## User Scenarios
정규 대회 목록에서 제보 대회9d167fba-1e19-4c2f-8084-8b8bd866fef2와6504ad45-dedf-4c48-899b-fef2de7ae707을 열고 대회 진행 방식을 읽는다. 단발 대회는 대진표 안내, 실제 시즌 리그는 주차 안내가 보여야 한다. 기존 group/knockout 안내와 링크는 유지한다.

## Test Scenarios
- [x] 현재 제품 소스에서 실제 TournamentDetailPageClient 렌더 회귀 RED2/7 PASS; 원본 제품 blob 확인.
- [x] regular_tournament+league와 null+league의 올바른 안내 GREEN9/9.
- [x] regular_league mirrored format 및 기존 group_knockout/knockout 경계 유지.
- [x] clean40fb35d1 커밋 기준 consumer28+classifier8=36/36, 최소 worker 직렬, 경고0.
- [ ] 최신 head 독립 리뷰 및 외부 finding/threads/CI.
- [ ] dev 머지 후 실제 alpha 증빙; 미머지 코드 테스트를 alpha PASS로 표현하지 않음.

## Parallel Work Breakdown
### Frontend
Worker owned: apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx 및 tournament-detail-page-client.test.tsx. 좁은 진행 안내 분기와 실제 렌더 회귀만. 첫 RED 전에 제품 소스 변경 금지. root serial GO 전 테스트 실행 금지.
### Sequential
Root owns task/Changeset/SSOT/Git/committed checks/PR/기존 리포트 댓글. 독립 review는 제품 수정 후 read-only. 공유 hooks/types/MSW/API/DTO/schema/infra/design tokens/policies/다른 task는 금지. 타인 변경을 되돌리지 않는다. worker commit/push 금지.

## Acceptance Criteria
- [x] 현재 v1 kind/format 계약을 확인하고 getFlowSteps 첫 조건만 regular_league로 구분.
- [x] 실제 소비자 RED→GREEN, clean 커밋36/36, Web 타입·primary pattern 검증; task EOF 지적도 정리.
- [ ] 독립 최신 head Critical0 Warning0 FindingsNone.
- [ ] base dev PR 및 원 #63 댓글 저장·실제 표시 확인.
- [ ] 실제 alpha AFTER는 별도 증거로 검증.
UI 구조·토큰·primitive·상태는 변경하지 않는 기존 문구 선택 로직 수정이다. CLAUDE UI 착수 규칙의 로직 전용 예외를 적용한다.

## Tech Debt Resolved
진행 안내에서 format과 시즌 리그의 종류를 혼동하던 국소 분기만 정리한다. marker 없음.

## Security Notes
공개 조회 문구만 변경한다. 인증·권한·쓰기·PII·리다이렉트 계약을 변경하지 않는다. .env 미열람.

## Risks & Dependencies
전역 isLeagueCompetition의 다른 쓰임은 보존해야 한다. 실제 alpha AFTER는 dev-pr-5의 기존 시나리오와 중복하지 않고 matching SHA/로그인/viewport 근거를 검수한다. main/production/자동 머지/Done·첨부삭제 권한 없음.

## Ambiguity Log
원문의 kind=tournament는 목록 필터이고 실제 DTO kind는 regular_tournament/regular_league다. 정확한 API/consumer contract를 worker가 확인한다. PR1695와 같은 증상이지만 제품은 이미 머지됐고 정식 후속 지적만 존재하며 열린 fix PR/활성 #63 task는 없다. 별도 최신 dev fix branch에서 잔존 분기를 수정한다.

## Progress Snapshot
2026-10-08T16:59 heartbeat run1659. Root freshfetch/clean actualdev FF origin2edc863e9311b11251d89dc1318ce1fb736cff60. Managed worktree C:/Users/kinso/.codex/worktrees/mdqa-63-tournament-flow-copy/matchup-sports-platform, feature fix/mdqa-63-tournament-flow-copy, same latestdev base. UI 선점 증거 own1659/report63-claimed-confirmed.txt/png. 조사/실제 RED 준비; source patch·검증·리뷰·커밋·PR·댓글·alpha AFTER 대기. 이전 #61 및 다른 리포트 증거/실패/삭제 확인 대기는 유지한다.

2026-10-08T17:21Z: 원본 첨부2/2를 직접 읽었고 각 natural1180×757 이미지에서 시즌 주차 안내를 확인했다. 새 consumer 회귀9개에서 실제 RED2/7 PASS, RED 전후 제품 blob a06d492bdfeac92788133fd888c2daa42b3cf05f 동일. getFlowSteps 시즌 분기만 kind=regular_league로 좁힌 뒤 focused9/9 및 기존 consumer28/28 PASS. 원본 raw 검증은 ignored tmp/qa/mdqa-63/에 보존한다. dirty-tree 결과이므로 아직 PR-ready·실제 alpha PASS로 판정하지 않는다. 후속 타입·커밋 기준 검증·독립 리뷰·PR·같은 리포트 댓글은 root 단계다. PR1695의 실제 미해결 P2 discussion_r4221841571과 같은 증상이며 후속 alpha 확인까지 원 지적을 임의 종료하지 않는다.

2026-10-08T17:24Z: 커밋 직전 freshfetch origin/dev2edc863e와 drift0. Web TypeScript(noEmit, incremental false) EXIT0. primary v1-pattern-check.mjs는 Windows find.exe 셸 충돌의 EXIT1 원본을 보존한 뒤, 설치된 Git Bash를 해당 프로세스 ComSpec/PATH에만 지정해 동일 스크립트 EXIT0; 게이트 소스 변경·우회0. 제품 GREEN blob77c1ee3ccf1d88fe84f9383992a151fe222e60a4. owned2파일+task+Web patch Changeset 총4경로만 커밋하며 이후 실제 커밋 기준 consumer 및 독립 리뷰를 수행한다. alpha AFTER·dev 머지는 계속 PENDING.

2026-10-08T17:28Z: clean40fb35d1540bab45205575fa9614e6dcf6c359d7 기준 상세28+전역classifier8=36/36 PASS(6.43s), dirtyAfter0, source77c1ee3c/test66e0130a blob 고정. 독립 리뷰는 제품·consumer에 실제 기능 finding을 발견하지 않았으며 새 task EOF 공백 1건을 지적했다. committed-diff-initial.log의 실패를 보존하고 task EOF만 정리했다. 제품·테스트·Changeset은 같은 blob이므로 검증을 중복하지 않으며 최종 SHA에서 독립 리뷰·전체 PR diff를 재확인한다. 외부 리뷰·CI·dev 머지·실제 alpha AFTER·원 리포트 PR 댓글은 아직 PENDING.

2026-10-08T17:32Z concurrent merge reconciliation: PR1698 게시17:29 뒤 실제 dev FF에서 외부 PR1697의 merge a7c15b54ebf4686e7da820773d0af43648e3876a(17:30:10Z)를 확인했다. 같은 getFlowSteps 종류 분기 수정과 실제 공개 상세2개 회귀가 이미 머지됐다. peer 원본 제품 blob을 그대로 유지하고 root 중복 제품 diff·중복 Changeset을 제거한다. 동일 열린 PR1698은 추가 실제 페이지 소비자9경계(null 및 시즌 league/group/knockout 거울·기존group/knockout·라벨3단계)와 canonical task만 보강한다. root가 PR1697을 머지하거나 peer branch에 push하지 않았다. 기존 제품 RED2→GREEN9와36커밋 근거는 역사로 유지하며 새 통합 SHA에서 좁은 consumer/peer regression·독립 리뷰를 확인한다. 원 증상 수정 머지는1697, 회귀 보강 머지는1698로 별도 추적하고 alpha AFTER는 PENDING이다.
