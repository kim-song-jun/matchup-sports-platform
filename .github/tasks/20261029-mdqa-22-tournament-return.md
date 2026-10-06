# Task 20261029: 공개 대회 목록 유형·상태 복귀 보존 (MD-QA #22)

### Root Phase C validation — 2026-10-06
- Actual Web CI old bare-link expectation repaired in this same PR/worktree. Current delta verified; source/test scope preserved.
- Root serialized narrow GREEN: SSR seed5/5 PASS. Evidence: 22-ci-green.log.
- Changed-tree TypeScript and existing v1 pattern checker PASS (22-review-type-pattern.log). Independent delta review4/4, Critical0/Warning0; root inspected actual diff.
- Commit/push/new-head review/tracker follow-up pending below; no merged, deployed or alpha browser success claimed.

Status: Review
**Owner**: root → mdqa_22_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/22/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=22). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #22 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 정규 대회(kind=tournament)+진행 중(status=in_progress) 선택 후 기존 상세의 화면 뒤로가기에서 동일 query/selected controls/results로 복귀한다. 빠른 입력 local draft와 안전한 from 검증을 보존한다.
- [x] Preserve unrelated route/API/permission and user selection contracts.
- [ ] Read exact report reproduction from intake evidence; do not substitute a different symptom.

## User Scenarios
- Follow the report's exact list/detail/return or date comparison scenario using existing v1 data; successful behavior meets Original Conditions.

## Test Scenarios
### Happy path
- [ ] Real rendered/action/formatter regression fails before fix and passes afterward.
### Edge cases
- [ ] Direct entry, invalid/untrusted return/query or date input, nested context where applicable.
### Error paths
- [ ] No silent success/fallback or unsafe external navigation.
### Mock data updates needed
- [ ] Sync only necessary local fixture contracts; global API/MSW/schema changes require root coordination.

## Parallel Work Breakdown
- Phase A: builder investigates, records exact root cause, adds narrow RED regression, implements.
- Phase B: root serializes validation; independent reviewer checks final diff; root commits/pushes/dev PR and tracker comment.
- Owned files: apps/v1_web/src/app/tournaments/page.tsx; apps/v1_web/src/app/tournaments/tournaments-list-client.tsx; apps/v1_web/src/app/tournaments/tournament-card.tsx; apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx; local tournament list/detail regression tests; this task; .changeset/mdqa-22-tournament-return.md. Root approved the actual route-local client/card paths before editing on 2026-10-06.
- Forbidden: all other modules, shared hooks/types/MSW/DTO/schema/navigation helpers, other tasks/state, dev/main, browser/tracker actions, commit/push. Date utility exception belongs only to #27.
- You are not alone. Preserve others' changes and coordinate scope expansion with root.
- Do not run tests/typecheck/build yet: report exact commands to root for serial validation scheduling. No local Next server.

## Acceptance Criteria
- [x] Reported contract fixed with real regression evidence.
- [x] Narrow tests and required types/patterns pass.
- [ ] Independent review Critical=0 / Warning=0; scope and committed tree verified.
- [x] Changeset and relevant contracts synchronized.
- [ ] dev PR / latest-head review / tracker comment linked; actual browser QA recorded separately after merge.

## Tech Debt Resolved
- Fixed the missing list-origin handoff in the route-local tournament card. Existing shared back navigation and filter update behavior remain the contract; no broad refactor or debt markers were introduced.

## Security Notes
- Card origin uses existing `withFromPath`, which validates every return-chain level through `sanitizeRedirectPath`; actual detail `AppBackLink` validates again before navigation. Direct and unsafe external/protocol-relative origins retain the safe `/tournaments` default. No authentication/authorization or shared API contract changed. No secrets read/output.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |

## Progress Snapshot
- Phase: A / Investigation and implementation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-22-tournament-return/matchup-sports-platform
- Branch: fix/mdqa-22-tournament-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Investigation: the list card points to a bare `/tournaments/:id`, so the shared `AppBackLink` receives no `from` and uses `/tournaments`. Detail already validates and honors a complete local `from` query; no shared helper change is needed.
- Regression: `tournaments-list-return.test.tsx` renders actual list/card/detail/back components with actual API hooks and local MSW transport. It asserts the reported kind/status URL, selected controls, and six filtered results after clicking detail back. Additional cases preserve a valid parent `/home` chain, drop an unsafe nested origin, and cover safe direct entry for missing/external/protocol-relative detail `from`.
- RED: root serialized run recorded in `22-red.log` (2026-10-06), 1 failed / 3 passed. The actual detail back action produced `/tournaments` instead of `/tournaments?kind=tournament&status=in_progress`; direct/unsafe defaults passed.
- Implementation: list client passes its current query through an optional route-local `TournamentCard.fromPath`; card uses existing `withFromPath`. Detail/shared helpers/filter synchronization were not changed. Changeset added.
- GREEN attempt: root serialized new regression and compatibility files in `22-green.log`: 80 passed / 4 failed. All six return regressions passed. Four pre-existing `tournaments-list-kind.test.tsx` card-link assertions expected a bare href and failed on the correctly added list origin.
- Compatibility adjustment: root approved only this local test assertion update. It now keeps the exact same-origin `/tournaments/swimming-control` destination without a hash, and asserts the entire decoded query is one `from` equal to the current sport/gender/status list URL. Product code remains unchanged after GREEN attempt.
- Validation: compatibility rerun pending; root owns serialized execution and required lint/PR verification. No independent test/typecheck/build/server process run. Do not claim alpha QA from code/CI.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 6 files/84 cases GREEN. Logs: ["22-green.log","22-green-compat.log"] (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (22-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-22-23-25.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.

## Phase C — PR #1633 CI SSR Compatibility
- Root supplied actual Web CI evidence: run `37413898366`, job `112108159843`, 596 files / 6475 tests passed and one failure in `tournaments-page-seed.test.tsx:82`. The stale SSR assertion expected a bare detail href, while the actual card correctly includes `from=/tournaments`.
- Checked current `page.tsx`, list client, and route-local card: server seed eligibility, actual seeded HTML rendering, and JSON-LD canonical detail paths remain unchanged. Only rendered card links now preserve the full current list URL through the existing safe origin helper.
- Owned follow-up scope is only `apps/v1_web/src/app/tournaments/tournaments-page-seed.test.tsx` and this task. Product/shared/API code remains unchanged. Touched-test search found one obsolete bare href expectation.
- SSR link assertions now parse the actual first card from the HTML DOM, assert same origin, exact detail pathname, empty hash, and the entire decoded query equal to one `from` with the exact current list URL. Both unfiltered `/tournaments` and existing `kind=league` seed cases exercise that contract. Existing HTML title/order, ItemList names/order, loading/error, filter seed suppression, and canonical metadata assertions remain intact.
- Validation: narrow SSR GREEN pending root serialization: `pnpm --filter v1_web exec vitest run src/app/tournaments/tournaments-page-seed.test.tsx --maxWorkers=1 --no-file-parallelism`. No worker test/build/browser/Git process run. Root owns commit/push and latest-head CI/review.
