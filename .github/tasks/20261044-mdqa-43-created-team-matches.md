# Task 20261044: MD-QA #43 생성한 팀매치 조회 실패

Status: In Progress
**Owner**: root → implementation worker
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/43/

## Context
alpha 로그인 E2E관리자의 /my/matches/created에서 팀매치 조회가 retry/새 탭에서도 실패한다. 개인 목록은 정상 빈 목록이다. 전체 탭은 부분 오류와 동시에 '만든 매치가 없어요'를 확정 표시한다. Root 원 설명/재현/댓글0 확인, 미배정 접수 선점 김성준·확인 중 성공. 현재 실제 중복 작업 없음.

## Goal
실제 API/query 계약의 실패 원인을 고쳐 생성한 팀매치가 조회되게 하고, 부분 실패를 빈 목록 확정으로 안내하지 않는다. 좁은 회귀/리뷰/dev PR/기존 댓글까지 완료한다.

## Original Conditions (must all be satisfied)
- [x] 실제 원 리포트 상세와 UI 선점 성공 확인.
- [ ] HTTP 오류 원인을 v1 controller/DTO/service/frontend hook과 교차 검증.
- [ ] 가장 작은 올바른 수정, 실제 실패하는 좁은 회귀, 오류/권한 보존.
- [ ] 독립 리뷰/committed 검증/dev PR와 원 리포트 댓글.

## User Scenarios
로그인 계정의 생성한 팀매치 목록과 전체/팀/개인 필터를 조회한다. 부분 실패 시 조회하지 못한 목록의 실제 오류와 retry를 보되 전체 0건을 확정하지 않는다. 오류 회복 후 실제 목록/정상 빈 상태를 표시한다.

## Test Scenarios
- Happy path: created scope 실제 query/API 계약과 반환 목록.
- Edge cases: 팀 없는 계정, 개인 정상0+팀실패, 일부 실제 행+다른 실패.
- Error paths: 인증/권한/API 오류 숨기지 않으며 retry 실제 refetch.
- Mock data updates needed: 수정된 계약과 좁은 regression fixture를 같은 변경에서 맞춘다.

## Parallel Work Breakdown
- Owned: `apps/v1_web/src/components/my/my-matches-client.tsx`/test 및 필요한 `my-page.tsx` 좁은 consumer; backend 원인 있으면 team-matches 관련 서비스/DTO/test. 수정 전 root에 exact scope 보고.
- Root: browser 실제 오류/네트워크, Git/PR/task/Changeset 및 문서 sync.
- Forbidden: 공유 `hooks/use-v1-api.ts` (#41 단일 owner), types/MSW/schema, global provider/history, 타인 WT/state, .env. 공유 hook 원인이면 root에게 지적하여 선행 owner를 조율한다.
- No stage/commit/push; 혼자가 아니므로 타인 변경 되돌리지 않는다. 테스트 실행은 root 직렬 허가 후 최소 worker.

## Acceptance Criteria
- [ ] 원인과 실제 RED → GREEN 증거.
- [ ] created/all/personal/team 오류 및 정상 상태 일관성.
- [ ] 실제 권한과 user-visible API 오류 보존.
- [ ] 독립 리뷰0, explicit committed scope, dev PR/원 리포트 댓글 확인.
- [ ] 실제 alpha scenario/viewport/console/network (미머지는 대기로 남김).

## Tech Debt Resolved
불완전한 목록을 전체 0건으로 안내하는 거짓 빈 상태를 정리한다.

## Security Notes
기존 인증/권한/계정 scope를 우회하지 않는다. 사용자 데이터를 테스트 fixture로 복사하지 않는다.

## Risks & Dependencies
원 제보 API status는 미확인. 실제 root browser 네트워크 증거를 기다리되 독립 코드 조사 진행. Origin/dev 5948dfd6 전용 managed worktree.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report #43 | 팀 목록은 실제 0인가? | 조회 실패이므로 미확정. 정상 빈 상태를 확정 표시하지 않는다. |

## Progress Snapshot
- Worktree `C:/Users/kinso/.codex/worktrees/mdqa-43-created-team-matches/matchup-sports-platform`, branch `fix/mdqa-43-created-team-matches`.
- Root ignored 0550 report43-before/claimed DOM와 screenshot 보존. 실제 API 원인/수정/검증/PR 대기.
- Root actual alpha before: same authenticated E2E관리자, 1280×720, GET `/api/v1/me/team-matches?scope=created&limit=50` returns 409 `TEAM_MATCH_OPERATIONAL_DATA_INVALID`; 개인0/팀오류 동시 false empty 확인. Public platform match `7b63bb6e-8949-4aa4-8731-b901b79b17a6` is 200/platformManaged=true/hostTeam=null/startsAt present/manageRoute=null. Public response has no creator field, so exact offending row is not established.
- Implementation: shared public/my read invariant supports standalone platform recruitment before host approval, requires startAt and valid host relation, keeps non-platform/league/tournament null-host 409 and strict write operational guards. Nullable team fields preserve applied team context and owner/manager management permissions. Partial error suppresses full-list empty conclusion. Domain docs and existing platform fixture synced; hooks/types/global MSW/schema unchanged.
- RED: narrow service new5 cases 2 failed (valid platform created/applied),3 invalid data cases passed; real hooks+HTTP web wire6 cases 1 failed (false empty),5 passed. Initial Jest invocation found no tests due Windows mixed slash `.codex` path glob, then CLI `--testMatch '**/src/**/*.spec.ts'` corrected selection; no config gate changes.
- GREEN: actual service spec 94/94 (10.958s), single runInBand; web real-query6 + existing client8 + view11=25/25 (7.83s), single worker. Old createApplication platform fixture flag corrected after one invalid fixture failure; final invalid3 still pass. Host preflight CPU26%, free14GiB/Node27/browser10/Docker off; no Next server or DB mutation.
- Worker scope: service.ts/spec.ts, my-page.tsx, NEW my-matches-client.query.test.tsx, docs/api/domains/team-matches.md. git diff --check PASS, touched markers0. Independent review, type/lint, committed verification, PR/tracker and actual after-alpha pending root.
- Root precommit: fetch origin/dev5948dfd6/no drift; API and web tsc --noEmit PASS; unchanged API surface and web pattern gates PASS via Windows Git Bash adapter. Actual root before data response documented without identifying opaque row. Source unit result is not alpha-after PASS.
