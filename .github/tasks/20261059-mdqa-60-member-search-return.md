# Task 20261059: MD-QA #60 공개 멤버 검색 복귀

Status: In Progress
Owner: root / frontend owner
Created: 2026-10-08

## Context
https://teameet.jmandu.kr/issues/60/ 공개 서울 나이트FC ab300000-0000-4000-8000-000000000001 members15에서 정재원 검색1→player profile→페이지 Back 후 query blank/all15. Full reload 후 반복; alpha CSS1180×757/22:21–22:23, servingSHA 미확인. Browser Back/mobile/scroll/admin search 미검증. Current #24 team directory and #15 wrongdestination are distinct. Root unfiltered active21/intake3 full onepage/detail/comments0 read; no actual matching active task/branch/openPR. root UI claim Kim/확인중 saved22:48.

## Goal
실제 공개 멤버 검색을 해당 목록 URL/draft에 보존해 프로필 왕복 후 검색1을 복원한다.

## Original Conditions (must all be satisfied)
- [ ] 실제 search→profile→pageBack 검색어/결과 보존.
- [ ] 직접/query 없는 기본·검색0·clear·등번호·same-team/upstream/hash/tab·연속 입력/Next stale/history 계약 유지.
- [ ] 관리 권한/actions/불러오기/오류·다른 팀/다른 탭 검색 범위 유지.
- [ ] 실제 RED/GREEN→committed check→full independent latesthead→dev PR attach→saved original comment.

## User Scenarios
공개15명에서 정재원1 검색→프로필확인→같은 목록에서 계속 찾기. clear→전체15, direct default전체. Native history는 추가 회귀이며 원문 실측 주장과 분리.

## Test Scenarios
Actual consumer/hooks/HTTP/query/shell Back/history regressions; old member filtering/client/permission controls unchanged. SSR 첫URL/빠른draft와query/hash/upstream preservation. No fake output/pixel claims.

## Parallel Work Breakdown
Phase B Owned: apps/v1_web/src/components/teams/team-members-section.tsx, teams-client.tsx ONLY TeamMembersPageClient/profile link scope, teams-page.tsx ONLY TeamMembersPageView prop wiring if necessary; one dedicated actual consumer return spec plus existing directly affected assertion. Report exact neededfiles before expanding.
Forbidden: shared hooks/types/MSW/DTO/schema/helpers/shell/backend, otherteams/directory/detail flows except explicitsource propwire, task/state/.env/browser/Gitmutation/selfcommit/install. Not alone; preserve others. Root owns task/changeset/Git/PR/reviews/comment. Minimal tests SERIAL NO EXEC until root GO; prepareREDbeforeproductpatch.

## Acceptance Criteria
- [ ] 원 조건과 old action/permission contracts; smallestcorrectcode/debt/fixturescope sync.
- [ ] root committed tests/types/pattern, latestfullreview Critical0Warning0 FindingsNone.
- [ ] Exacthead externalfindings/review/CI monitored, dev merge elsewhere; alphaAFTER pendingexactdeploy.

## Tech Debt Resolved
Local-only 검색을 member URL/draft와 연결하고 profile sourceURL에 현재 검색어·탭을 보존한다. Shared helper를 그대로 재사용하며 touched TODO/FIXME/HACK/XXX는0건이다.

## Security Notes
Query is UI context, neverpermission. Safe from helpers retained; API/auth/datawriting unchanged, secrets unread.

## Risks & Dependencies
Shared teamsclient includes manyflows; smallest member-only scope. No alpha dataset writes. Date/score61 is independent2ndWT.

## Ambiguity Log
Original is pageBack/search retention, nowrongdestination/permission/scroll/nativeBack failure claimed. UI style unchanged logicfix; no newdesignchoice.
The numeric task prefix20261059 is also used by the independent store-withdrawal-session task on current dev. The canonical identity here is the full path above plus MD-QA report60 and its dedicated worktree/branch; that independent task/source is unchanged.

## Progress Snapshot
Freshfetch before managed origin/dev WT creation; absolute C:/Users/kinso/.codex/worktrees/mdqa-60-member-search-return/matchup-sports-platform, branchfix/mdqa-60-member-search-return/baseb84a2288cab0449c173fee9ef29fe2d740f86d4e. Existing installeddepsjunctions only. Root own0550/report60-initial-detail.txt and claimtxt/png. Investigation/codeREDGREEN/review/PR/comment pending; alphaAFTER PENDING, Done/attachmentdelete/auto merge forbidden.

### Proven consumer regression checkpoint 23:37 KST
Corrected unchanged-product HTTP/route/shell consumer RED13 failures/3 baseline passes/16. Actual15-member GET→name1 control passed; profile PageBack/native Back/direct query/SSR lost search; same-instance team changes and operator tab remount also failed. Initial harness status/SSR/delayed-ready failures were excluded. Raw tmp/qa/mdqa-60/member-return-red-corrected.txt. A separately added owner requests→members→search→profile→PageBack case failed because destination incorrectly retained tab=requests (RED1 executed/16 intentionally excluded); raw member-tab-red.txt.

Minimal product scope is TeamMembersSection optional controlled search with standalone local fallback, TeamMembersPageView prop wiring, and TeamMembersPageClient local per-team draft/query hydration guarded against late Next snapshots. Same-entry native replace preserves otherquery/hash/upstream and selected member tab; the profile source uses the existing safe helper. No extra history entry, shared contract/style change or permission widening. GREEN5 exactspecs190/190: return17, member-section3, teams-client98, teams-page63, public-profile9. Real HTTP/auth401, restricted access,503, query/name/jersey/zero/clear/staleNext/team isolation/tab/native Back and SSR controls passed. Raw tmp/qa/mdqa-60/member-return-green.txt. No existing assertion was modified. Root committed gates, independent full review, devPR and original comment remain pending. Pixel/scroll/mobile and exact alpha AFTER remain separate pending scenarios.

### Root committed validation and latest-dev checkpoint 23:55 KST
Root committed-tree936299559d342c0ab94214eabc4c54113baee7cc gate: four exact specs187/187, then the initially omitted existing team-members-section.test.ts (the first command incorrectly named .test.tsx)3/3, totaling190/190 on the same unchanged commit. No omitted test is represented as executed in the first run. Web TypeScript and unchanged primary v1 pattern gate passed with immediate exit-code guards; raw own0550/report60-{web-committed-tests,members-section-committed-tests,committed-result}. Root clean-tree, diff/check, intended six paths and source markers checked. Independent full6/6 at936 had Critical0/Warning0/FindingsNone.

Freshfetch origin/dev9f5b149dff7e042b2498c5d085d24ff462179428 integrated into this feature only. c1fbb55->9f5 dev tree content was identical, and post-gate all non-task content is identical to936; no repeat heavy test is needed. Final full6/6 review is required at this new final publication head. Root will publish base=dev and save the original report comment. Exact alpha AFTER/login/nativeBack/mobile/scroll/network remain pending; code tests do not establish actual alpha completion. No merge/Done/delete/promotion action.