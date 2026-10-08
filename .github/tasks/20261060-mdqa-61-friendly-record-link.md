# Task 20261060: MD-QA #61 공개 친선 전적 기록 연결

Status: In Progress
Owner: root / domain owner
Created: 2026-10-08

## Context
https://teameet.jmandu.kr/issues/61/ 공개 팀ab300000-0000-4000-8000-000000000001 친선+2026 2경기, 한강로버스1:3/4goal events→/team-matches/ad400000-0000-4000-8000-000000000103/record→sameID?view=detail 일반 상세, score/events/recordCTA 없음. Reloadrepeat. CSS1180×75722:37–22:39, servingSHA unknown/datawrites0. #12공식리그공개/#29recordfilterback distinct; nativeBack filters PASS. 날짜9/26vs9/28 causesunconfirmed notscope. Root fullunfilteredactive21/intake3/detailcomments0 read/no active matchingtask/branch/openPR. Kim/확인중 saved22:48.

## Goal
현재 v1 공개 친선 전적의 점수·이벤트와 일치하는 실제 읽기 상세 계약으로 연결하거나 실제 제한의 정확한 이유를 노출한다.

## Original Conditions (must all be satisfied)
- [ ] 표시된 기록을 실제 상세에서 읽을 수 있는 정당한 경로/정책 검증.
- [ ] 공개조회/권한/게임결과 source·league/tournament handoff·participant writing contract 유지.
- [ ] 합성 점수/가짜fallback/서버권한우회·source 없는 success 없음.
- [ ] ActualRED/GREEN→committed narrow→fullindependentreview→devPRattach→originalsavedcomment.

## User Scenarios
친선2026 row1:3/goal4→record detail읽기→기존팀records filter/fromback. Direct/openpublic viewers and correctlyrestricted/404/service error behavior.

## Test Scenarios
Actual v1 controller+DTO+service+hooks/types and shared record route consumer crosscheck. HTTP realendpoint-shaped narrow regressions, originalsource unchanged RED. Backend neededmust notifyrootbeforeediting; minimal scope then API docs/fixtures sync ifcontract changes. No alpha/pixel inferred fromcode.

## Parallel Work Breakdown
Phase A/B initial owner: apps/v1_web/src/components/team-matches/team-match-shared-record.tsx and scopedactualconsumer spec, apps/v1_web/src/app/team-matches/[id]/record route onlyifnecessary. FIRST diagnosecurrentphase=legacy v1 reading/redirect and legitimatepublicofficialrecordAPI without productpatch; report to root exactAPI/source scope. Backend/API/type/hooks/MSW/schema are read-only until oneowner approval. Existing159friendlyparticipation task is different backend hydration; reuse evidence notchangeitsdoc.
Forbidden: otherteam/routes/sharedhooks/types/MSW/helpers/API/DTO/schema/edit beforeapproval, task/state/.env/browser/Gitmutation/selfcommit/install. Notalonepreserveothers. Root task/changeset/integration/Git/reviews/PR/comments. SERIAL testsNO EXEC until GO; noforce/noMergedbranchpush.

## Acceptance Criteria
- [ ] Smallestcorrectcontract and genuineREDGREEN/nofakefallback.
- [ ] Latestcommitted/types/pattern/full reviewFindingsNone; API docs/fixtures sync ifneeded.
- [ ] Actualalpha originalrepro/deploySHA/permission outcomes separate; Donependinghumanattachmentdelete.

## Tech Debt Resolved
예정: publicfriendlyrecord destination/phase handling gap after actualcauseverified.

## Security Notes
Onlycurrentv1 sources. phaselegacy is currentv1 response enum, no removedv0source use. Publicrows don'tauthorizeprivatewrite/PII, retainOptional/V1guards andservice gates. Secrets unread.

## Risks & Dependencies
Existing managed/shared-record write journey must notregress. LegitimateAPI detail contract may require backend Wavefirst; never manufacture4goals. No datescope expansion.

## Ambiguity Log
Original date inconsistency remains unconfirmed and out of scope. Current v1 friendly fixture103 has currentOfficialRevision score1:3, JSON goalEvents=null and four actual GOAL events, while no sharedRecord exists. The shared record read projected only sharedRecord goals; the public legacy route then redirected to the generic detail. The actual service and route regressions confirm these source causes. Public detail limitations follow the current policy; no fabricated score/event or write authority is introduced.

## Progress Snapshot
Freshfetch immediatelybeforemanagedoriginDevWT, C:/Users/kinso/.codex/worktrees/mdqa-61-friendly-record-link/matchup-sports-platform branchfix/mdqa-61-friendly-record-link baseb84a2288cab0449c173fee9ef29fe2d740f86d4e. Installeddepsjunctions reused, noinstall. own0550/report61-initial-detail.txt andclaimtxt/png. Investigatecurrentv1 thenactualREDGREEN/fix/review/PR/comment; alphaAFTER PENDING/noDone/delete/automerges.

### Root-approved Wave A/B ownership 23:06 KST
Wave A backend-data-dev mdqa_47_league_reviews owns apps/v1_api/src/team-matches/team-match-record.service.ts + service.spec.ts + docs/api/domains/team-matches.md. Existing shape and OptionalV1AuthGuard retained; currentOfficialRevision.state OFFICIAL only, RepeatableRead snapshot, public policy gates. Official JSON first; current v1 producer JSON-null uses valid unreversed GOAL/OWN_GOAL public projection. phase legacy/canEdit false/write409 preserved; no participant/history/edit goals/confirmation PII exposure. No DTO/schema/migration/seed/controller/hooks/types/MSW edits. Real read consumer current103-shaped RED required before productpatch; serial validation slot root GO only; DB integration excluded because Docker unavailable.
Wave B frontend-ui-dev separate owner owns team-match-shared-record.tsx and actual consumer spec only; must consume same approved API shape and display public read-only official result, retain managed fixture handoff/detailOnly loop protection/source-back/no legacy write controls. Wait API projection agreed; no shared contracts edits. Root task/Changeset/Git/committed gates/independent fullreviews.

### Proven regression checkpoint 23:33 KST
Backend unchanged-product RED13 failures/25 passes/38: official1:3 and four current game goals were absent, missing/DRAFT/VOID/malformed official results incorrectly fell back to0:0. Additional private stale regression RED1 (38 deliberately excluded) proved old shared goals/submatches could override the current official result. Minimal approved suppression fixes only this legacy projection. Full backend GREEN39/39; raw tmp/qa/mdqa-61/{red.txt,red-private-stale.txt,green.txt}. Current OFFICIAL pointer, JSON-first/authoritative empty/malformed handling, JSON-null event-based result, reversed-event filtering, policy and nickname/consent gates are covered. Existing actor identity, private history exception, canEdit=false, legacy write409 and managed write denial remain unchanged. No DB integration was run because Docker was stopped.

Frontend unchanged-product actual HTTP consumer RED11 failures/2 passes/13; exact HEAD blob equality restored the source-hash receipt after correcting a wrong relative evidence path. No product change preceded RED. Raw tmp/qa/mdqa-61-web/{red.txt,red-classification.json,red-source-verification.json}. Managed league/tournament handoff controls passed. Approved source scope is the shared record component, new team-match-legacy-record.test.tsx, and only the old redirect assertion in team-match-shared-record.test.tsx. The existing renderer now reads legacy official results without redirect; legacy-only writing/confirmation promises are hidden while authorized nonempty history is kept. A null score does not falsely assert that no goals exist. The separate read-only heading regression RED1 (13 deliberately excluded) proved the legacy title still promised shared writing; only the legacy heading now uses 경기 기록. FE GREEN76/76 (new actualconsumer14 + existing shared-record62), logs tmp/qa/mdqa-61-web/{title-red.txt,green.txt,green-result.json}. Root committed gates and full independent reviews remain pending. Changeset includes both v1 packages; no shared schema/DTO/hooks/types/MSW or styles were changed. Exact alpha deployment/login/scenario/viewport verification remains separate and pending.
