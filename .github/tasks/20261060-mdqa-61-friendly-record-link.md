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

### Independent findings and source-first repair 23:51 KST
Committed4cf2240cc0c2c412ca76709c0e705666e72f6e76 full8/8 backend review had FindingsNone; full8/8 frontend review found two actual source layout gaps: public legacy retained an empty aside under the fixed two-track desktop columns, and a hidden/unavailable score retained an empty 득점 기록 heading/card. Source-first actual HTTP consumer RED2 at unchanged4cf proves both conditions, then minimal conditional content/aside rendering reuses existing stack when only one region exists. Authorized nonempty history retains the aside; shared writing and confirmation conditions remain unchanged. No CSS/new token/style change. Updated FE GREEN78/78 (consumer16 + existing62), raw tmp/qa/mdqa-61-web/{layout-red.txt,layout-green.txt,layout-verification-summary.json}; prior76 receipts remain history. Actual pixel/viewport/network verification remains pending and is not inferred from jsdom.

Root's first committed API command executed zero tests due Windows Jest path matching; exit1 is preserved own0550/report61-api-zero-run-path-harness.{txt,json}, excluded from product RED and never marked PASS. Corrected narrow command keeps the same spec with --testMatch '**/src/**/*.spec.ts', exactly as the proven worker command; no passWithNoTests or canonical gate changes. Committed API/Web verification and latest full independent re-reviews are pending.

### Root committed validation and latest-dev checkpoint 23:55 KST
Root committed-tree9f4730dda65379c8ec1b2f1eec782f1924d9a891: API39/39 and Web78/78 (new legacy16 + existing shared62), API/Web TypeScript, unchanged primary v1 surface and pattern gates all PASS. Actual serial low-worker preflight CPU82/free12.2GiB/Node132/browser10/Docker0 and no local3013/8121 listeners recorded. Raw own0550/report61-{api-committed-tests,web-committed-tests,api-types,web-types,committed-result}; no DB integration or pixel evidence inferred. The earlier zero-run Windows command remains excluded, and the previous frontend full8 review FAIL2 is retained as history, not current approval.

Freshfetch origin/dev9f5b149dff7e042b2498c5d085d24ff462179428 integrated into this feature only. c1fbb55->9f5 dev tree content and post-gate all non-task content are identical; API/Web tests therefore still verify final product content. Independent backend/frontend full8/8 re-reviews are required at this final publication head, specifically checking both repaired layout findings and authorized-history/managed/write boundaries. Root will publish base=dev and save original comment. Exact alpha AFTER score/events/policy/persona/viewport/network and DB integration remain pending. No merge/Done/delete/promotion action.
### 2026-10-09 00:30 KST 최신 head 외부 실제 finding3 및 동일 PR repair
- aa11424 최신 외부 CODEX PR1694 실제 P2 3건을 source와 현재 v1 producer 계약으로 확인: 공식 공개 기록 불가 화면의 이유/유효한 상세 action, 합계 양수·골 상세 없음 문구, period-relative event의 period 누락·잘못된 순서.
- 실제 threads PRRT_kwDORrML2s6qbLGG / qbLGM / qbLGT (4220728106/4220728122/4220728136). own0550/new-pr-audit-0020.json full pagination 증거. 이전 aa independent FindingsNone와 Copilot0은 시점 기록으로만 보존; 현재 actual findings3/미해결3을 OK로 간주하지 않음.
- Wave A backend owns service/spec/docs3. Root 단독 shared hook use-team-match-record.ts의 readonly period?: number|null additive type. Actual known positive period only; missing/null/backfill unknown omitted; isPeriodUnknown 재사용. 기존 relative minute 유지, 임의45분 합산 금지; shared/write/PII gates 불변.
- Wave B UI owns component+legacy consumer+direct affected shared consumer3. 기존 notice/Link/periodLabel 재사용. DTO가 missing/DRAFT/VOID 원인을 구분하지 못하므로 정확히 모르는 원인 단정 없이 공개 공식 기록 불가 안내와 현재 entity detail CTA; 양수 합계와 상세 이벤트 부재 구분, 실제0:0 no-goals 유지.
- Serial root slot: API actual6 RED(2FAIL/4PASS at unchanged aa/blob1d87019) ->6 GREEN/full45 -> FE actual7 RED -> UI+root type -> narrow GREEN; type/build/install/full suite/로컬 Next 없음. 기록 tmp/qa/mdqa-61-period/{red-six.txt,red-source-receipt.json}.
- Root owns task/Changeset/Git/state/reviews/PR/comment. Not alone preserve foreign changes. 코드 수정 후 최신 dev drift 통합/명시9path commit/committed gates/독립 full9+latesthead actual review/samePR push/답변/원리포트 후속 댓글까지 계속. 기존 PR/WT/task를 재사용한다.
- #60/62 actual dev MERGED, alpha peer active. root 동일 alpha browser/scenario 중복하지 않음. 실제 alpha AFTER/DB integration은 여전히 별도 pending; no merge/Done/delete/promotion action.

### 2026-10-09 00:36 KST 실제 외부 3건 RED/GREEN 완료
API unchanged aa/blob1d870199 RED6실행(2FAIL/4PASS; old39 excluded), canonical period projection 후 focused6/6 + full45/45. FE unchanged aa/blob8611b2e77 RED7실행/7FAIL(16 excluded) 후 notice/detail CTA·aggregate-only 안내·기존periodLabel+period/minute/stable 순서 최소 수정, focused7/7 + full85/85(legacy23/shared62). 하네스 오류 없음. root optional readonly period type 및 Changeset 문구를 함께 맞췄다. Raw tmp/qa/mdqa-61-period와tmp/qa/mdqa-61-web/external-* 보존; dirty-tree GREEN을 PR-ready로 간주하지 않는다. 최신 origin/dev747b drift는 독립 #60/#62 10경로이며 #61 계약과 겹치지 않는다. root exact8 repair paths commit 후 freshdev feature 통합/커밋 기준 gates/독립 full9/같은PR 최신head push·실제재리뷰 예정. 이전117 및 reviewNone는 이 변경의 검증이 아니다. 실제alpha/DBintegration pending.
