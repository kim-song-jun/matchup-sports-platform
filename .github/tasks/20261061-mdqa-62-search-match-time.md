# Task 20261061: MD-QA #62 통합 검색 경기 시각 일치

Status: In Progress
Owner: root / frontend owner
Created: 2026-10-08

## Context
https://teameet.jmandu.kr/issues/62/ 검색 서울 나이트 → 성수 아틀레틱 팀매치 결과10/11 07:57 → league ad100000-0000-4000-8000-000000000001 fixture ad400000-0000-4000-8000-000000000006 상세23:57, reload repeat. CSS1180×75722:56–22:57; c62 deploy gate후 servingSHA unknown; syntheticpublic/read only. 제목3주차vs5주차 데이터 정합성은미확인별도범위. #49My/#58home pathsdistinct; search-experience.tsx private Intl formatter currentv1 unchanged. No matching task/branch/openPR; root Kim/확인중 actualsaved23:01.

## Goal
검색 실제 경기 카드와 상세가 동일 KST 시작 시각을 표시한다.

## Original Conditions (must all be satisfied)
- [x] Actual unchanged-source consumer RED → minimal correct shared-KST reuse → narrow GREEN.
- [ ] Native search filter/results/navigation/error/SSR/query/upstream/permissions unchanged.
- [ ] Root committed gate, independent latesthead review, base dev PR attached, original comment saved.

## User Scenarios
Search results personal/team match startsAt ISO → matching detail same KST regardless device TZ; malformed/missing real data behavior preserved. No match data mutation.

## Test Scenarios
Actual SearchExperience+HTTP/API-shaped fixture+real result rendering under America/Los_Angeles, UTC, Asia/Seoul. Genuine source RED distinct from harness failure. Invalid/missing date path existing omission contract. Existing search spec narrow once; no fullsuite/build/local Next.

## Parallel Work Breakdown
Owned product apps/v1_web/src/components/search/search-experience.tsx formatter only, new actual consumer timestamp spec and directly related assertion if root approves. Shared lib/date-utils.ts readonly reuse. Forbidden other search flows/helpers/types/hooks/MSW/API/DTO/schema/policy/task/state/Changeset/browser/Gitmutation/selfcommit/install. Not alone preserve others. Root docs/Changeset/integration/Git/review/PR/comment. Serial test root GO only.

## Acceptance Criteria
- [x] Test fails actual timestamp source unchanged; all threeTZ verify intended KST contract.
- [x] Current committed diff scope/type/pattern/independent fullreview FindingsNone.
- [ ] Actualalpha AFTER separate pending exactdeployment/login/viewports; noDone/delete/automerge.

## Tech Debt Resolved
Duplicate device-dependent timestamp formatter removed; the existing KST format helper is reused without editing shared contracts or helpers. Touched TODO/FIXME/HACK/XXX: zero; no untracked production import dependency.

## Security Notes
No query/API/auth/write/newexternaldestinations. No env/secrets. Currentv1 only.

## Risks & Dependencies
Actualsameentity API storedISO/browserTZ originalunconfirmed; demonstrate sourcecause and don'tclaim datarepair. Shared formatter remains single owner readonly.

## Ambiguity Log
Title/week syntheticdata mismatch unverified/outofscope; originalUI servingSHA unknown. CI/code != actualalpha PASS.

## Progress Snapshot
Fresh fetch then managed ref origin/dev base c88c57a2a3980b3059b4ae3856e947435260240b. Workdir C:/Users/kinso/.codex/worktrees/mdqa-62-search-match-time/matchup-sports-platform; branch fix/mdqa-62-search-match-time. Own0550 report62-initial-detail/claimed-confirmed txt/png.

Worker unchanged-product source SHA256 B4F1ABA5F057DA18F874290EA0D1658DCD879CBE7DD235DCD041DF347695C099: isolated actual America/Los_Angeles consumer RED 4 failures / 5 passes. Both personal/team cards rendered 07:57 for the ISO that the existing detail model renders 23:57; KST midnight rollover was also wrong. CLI zero-run and initial navigation-expectation harness failures are excluded from RED evidence. Raw: tmp/qa/mdqa-62/red-la-isolated.txt.

Minimal product change: existing formatTournamentDateTimeShort import alias; remove private Intl formatter. Shared date-utils/hook/types/MSW unchanged. Actual process timezone guard passed. GREEN: America/Los_Angeles 9/9, UTC 20/20 (new time9 + existing search8 + state3), Asia/Seoul 9/9, total38/38. Raw: tmp/qa/mdqa-62/green-{la,utc,seoul}.txt and green-matrix-result.json. Missing/invalid dates remain omitted; real HTTP query and detail navigation retain the existing contract. diff --check PASS. Root committed gate, independent full diff review, PR and original comment pending. Actual alpha AFTER remains pending; no source test is claimed as alpha verification.

### Root committed checkpoint 23:43 KST
Fresh remote dev advanced to c1fbb55d3d12d85fc56e32872b51f6d85ce374af via independent withdrawal fix. Root preserved that work and safely FF-integrated it; the changed hook function was withdrawal-only, with no search contract drift. Actual dev checkout branchdev clean and FF synchronized.

Initial commit f7e2b0b277a672778e32048b11dbff08b646d599 passed the committed3TZ38 matrix but failed typecheck TS2322: a V1Match fixture spread inherited broader displayState into V1TeamMatch. That failure is preserved in own0550/report62-f7e2b0b-gate-failure.json and f7e2b0b logs; it was never marked PASS. Corrected spec uses explicit V1TeamMatch fields without casts or contract weakening. Commit65858a94e4a04eb567ab59d97c2ac094ea3f026f then passed the committed3TZ38 matrix, web typecheck and unchanged primary v1 pattern gate. Evidence own0550/report62-committed-{la,utc,seoul}-tests.txt, report62-committed-types.txt, report62-committed-pattern.txt, report62-committed-result.json.

Independent frontend review of exact65858a94 full4/4 paths: Critical0 Warning0 FindingsNone. Final task-only checkpoint keeps product/spec/Changeset blobs identical to the validated commit; pinned final head review and prepublication remote drift check remain required. PR creation/attachment, original report comment, CI/Copilot monitoring and actual alpha AFTER are pending. No dev merge or Done action was executed by root.
