# Task 20261035: 리그 순위 탭 팀 전적 복귀 보존 (MD-QA #28)

Status: Review
**Owner**: root → mdqa_28_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/28/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=28). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #28 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 리그 순위 선택→순위표 팀 전적→화면 뒤로가기에서 리그 순위 탭 및 순위표 복원한다. 원 #17 일정 단계 필터 복귀와 경기 일정 direct entry 보존한다.
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
- Owned files: apps/v1_web/src/app/tournaments/[id]/bracket/ and local tests; directly used tournament bracket tab subcomponents only. NOT teams/[id]/records/; this task; .changeset/mdqa-28-bracket-tab-return.md.
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
- Encode the local selected view in the explicit return URL and parse only `tab=standings`; absent/unknown values retain the schedule default.
- Replace the selected-tab type assertion with an allowlisted selection.
- Keep explicitly seeded schedule test data fresh so awaited real actions do not replace the fixture with an unrelated failed background request. Unseeded error controls remain active.

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
- Phase: A implementation ready / root serialized GREEN and independent review pending.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-28-bracket-tab-return/matchup-sports-platform
- Branch: fix/mdqa-28-bracket-tab-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Validation: actual RED confirmed by root (1 failure / 28 skipped, final standings `aria-selected=false` after the real AppBackLink action). GREEN/lint/review pending; do not claim alpha QA from code/CI.

## Investigation / Regression Journal
- Exact report: `/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb/bracket` → select `리그 순위` → `E2E 알파 B팀` records → screen `뒤로가기` returns to `경기 일정`; observed twice, including keyboard activation. Browser Back/mobile were not verified in intake.
- Hypotheses: (1) selected view is omitted from the standings link's `from`; (2) bracket remount ignores a supplied view query; (3) records/app-back sanitization drops the view. Inspect the generated link, remounted selected tab, and actual `AppBackLink` action separately.
- Source findings: `BracketPageContent` initializes `activeTab` to `schedule` unconditionally; `bracketSelfHref` comes from `useCurrentHref()` without encoding the local selection. `AppBackLink` already follows the sanitized complete local `from` URL.
- Planned artifacts: permanent rendered/action regression in the local bracket test; no debugger instrumentation, server, browser, or temporary runtime artifacts.
- Design scope: existing markup/styles/components stay intact; CLAUDE's UI commencement rule explicitly exempts logic-only changes.
- Scope decision (root): restore the exact explicit `AppBackLink` round trip by allowlisting the view in outgoing `from` and reading it on bracket remount. Do not persist standings selection through native history or change #17's dispatch contract. Browser Back view preservation is outside this fix and remains unverified. Root approved removing an existing returned `tab=standings` marker only when switching to schedule, preventing `ScheduleContent`'s phase update from reintroducing the stale marker.
- RED command to root: `pnpm --filter v1_web test -- 'src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' -t '리그 순위의 팀 전적에서 화면 뒤로가기를 누르면 선택한 탭과 순위표를 복원한다' --maxWorkers=1 --no-file-parallelism`. Builder does not run independent validation; production unchanged while waiting for RED.
- Initial RED attempt stopped before the reported behavior: the seeded schedule was immediately considered stale, and the awaited tab click allowed its unmocked background request to fail. The local helper now keeps only an explicitly seeded schedule fresh (`staleTime: Infinity`); no-seed/error tests retain their real failure behavior. Production remains untouched; root reruns the same RED command.
- Actual RED evidence: root's serialized retry, `F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/28-red.log`; initial standings/table succeeds, actual AppBackLink action returns, then the expected standings selection fails at the final assertion (test line 894 at the RED revision).
- Implemented: selected view in explicit outgoing `from`, initial allowed query hydration, nested query/duplicate parameters/hash preserved, localized stale marker cleanup on schedule selection. Shared history/navigation/API/MSW/components remain unchanged.
- Regression coverage: actual standings→team-records-link→AppBackLink→bracket remount, returned standings→schedule→regular-stage-filter→fixture-link→AppBackLink→bracket remount, invalid tab direct entry, existing no-query schedule default. First regression also covers nested `from`, `schedulePhase`, literal `?`/space query content, duplicate tags, and hash.
- GREEN command to root: `pnpm --filter v1_web test -- 'src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' 'src/app/tournaments/[id]/bracket/bracket-schedule-permissions.test.tsx' 'src/app/tournaments/[id]/bracket/bracket-scorer-links.test.tsx' 'src/components/public-game-records/schedule-filter-return.test.tsx' --maxWorkers=1 --no-file-parallelism`.
- Changeset: `.changeset/mdqa-28-bracket-tab-return.md`; no API/fixture/MSW contract changes required. Touched bracket path has no TODO/FIXME/HACK/XXX markers. Root owns final types/patterns, committed-tree verification, PR, tracker, and post-merge alpha QA.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 4 files/51 cases GREEN. Logs: "28-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (28-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-24-28-29.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
