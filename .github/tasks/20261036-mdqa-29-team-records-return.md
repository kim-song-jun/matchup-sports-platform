# Task 20261036: 팀 전적 경기 종류·시즌 상세 복귀 보존 (MD-QA #29)

Status: Review
**Owner**: root → mdqa_29_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/29/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=29). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #29 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 리그+2026시즌 팀 전적→경기 상세→화면 뒤로가기에서 종류/시즌 및 집계 조건을 보존한다. nested from=bracket 유지, 기존 team-match record→league fixture 정상 연결 보존한다.
- [x] Preserve unrelated route/API/permission and user selection contracts.
- [ ] Read exact report reproduction from intake evidence; do not substitute a different symptom.

## User Scenarios
- Follow the report's exact list/detail/return or date comparison scenario using existing v1 data; successful behavior meets Original Conditions.

## Test Scenarios
### Happy path
- [x] Root retry captured genuine RED: 5 FAIL / 1 PASS. The full rendered/action route chain returned with 리그 aria-selected=false at the restored records screen; direct type/season entries and rapid URL preservation also failed.
- [ ] The same rendered/action regression passes after the fix (root serial validation pending).
### Edge cases
- [ ] Direct entry, invalid/untrusted return/query or date input, nested context where applicable.
### Error paths
- [ ] No silent success/fallback or unsafe external navigation.
### Mock data updates needed
- [ ] Sync only necessary local fixture contracts; global API/MSW/schema changes require root coordination.

## Parallel Work Breakdown
- Phase A: builder investigates, records exact root cause, adds narrow RED regression, implements.
- Phase B: root serializes validation; independent reviewer checks final diff; root commits/pushes/dev PR and tracker comment.
- Owned files: apps/v1_web/src/app/teams/[id]/records/ and local tests only; report blocking external detail change to root; this task; .changeset/mdqa-29-team-records-return.md.
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
- Root cause: `TeamRecordsPageClient` always initializes local type/season to 전체 and omits both from the `selfHref` passed to real record links. Returning from detail remounts those defaults, changes the server query and changes 1경기 into 6경기.
- Existing managed team-match record handoff already preserves its incoming `from` on the regular-league fixture URL. No external detail or shared hook/navigation change is needed.
- The existing local tests now reset browser URL alongside mocked search params, use complete typed record fixtures instead of a double assertion, and model the production `isPending` loading contract.

## Security Notes
- Preserve authentication/authorization; validate local return paths and untrusted query input where applicable. No secrets read/output.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |

## Progress Snapshot
- Phase: A / Investigation and implementation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-29-team-records-return/matchup-sports-platform
- Branch: fix/mdqa-29-team-records-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Validation: pending; do not claim alpha QA from code/CI.
- Real regression: `team-records-return.test.tsx` renders real `TeamRecordsContent`, clicks league/season, follows the existing real `TeamMatchSharedRecord` managed redirect, clicks real `AppBackLink`, and remounts records to verify controls, query arguments, KPI/item counts and nested bracket source. Additional cases cover direct query entry, consecutive selection and invalid filters/external source.
- Root RED command: `pnpm --filter v1_web exec vitest run 'src/app/teams/[id]/records/team-records-return.test.tsx' --maxWorkers=1 --no-file-parallelism`.
- First root-run attempt exposed a test locator collision between the 경기 KPI label and its 경기 unit. The harness scopes the exact label to `div.tm-text-micro` and the exact numeric value to `div.tab-num`. That initial harness failure is not counted as bug RED evidence.
- Root retry confirmed genuine RED 5 FAIL / 1 PASS and authorized the confined production fix.
- Implementation ready: validated query initialization, team-scoped local selection, current URL merge for consecutive actions, stale query guard and both selected filters in the sanitized nested return address. No markup/style/API/MSW/permission contract change.
- GREEN ready command: `pnpm --filter v1_web exec vitest run 'src/app/teams/[id]/records/team-records-return.test.tsx' 'src/app/teams/[id]/records/team-records-page-client.test.tsx' --maxWorkers=1 --no-file-parallelism`.
- Regression coverage also reuses the installed-Next native history boundary helper read-only, verifies stale vs actual URL changes, and clicks the final records back link to the original bracket query. Touched-path debt-marker grep: 0 matches. Builder has run no tests/typecheck/lint/build/browser or Git mutation.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 2 files/13 cases GREEN. Logs: "29-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (29-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-24-28-29.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
