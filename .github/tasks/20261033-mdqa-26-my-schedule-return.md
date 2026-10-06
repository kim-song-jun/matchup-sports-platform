# Task 20261033: 내 일정 예정 상태 상세 복귀 보존 (MD-QA #26)

Status: Review
**Owner**: root → mdqa_26_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/26/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=26). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #26 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [x] 내 일정 예정 상태→기존 팀 일정 상세→화면 뒤로가기에서 예정 선택 및 다른 기존 필터를 보존한다. 참석/수정 등 write action 계약과 권한은 변경하지 않는다. (구현 완료; GREEN·alpha 검증 대기)
- [x] Preserve unrelated route/API/permission and user selection contracts.
- [x] Read exact report reproduction from intake evidence; do not substitute a different symptom.

## User Scenarios
- Follow the report's exact list/detail/return or date comparison scenario using existing v1 data; successful behavior meets Original Conditions.

## Test Scenarios
### Happy path
- [ ] Real rendered/action/formatter regression fails before fix and passes afterward.
### Edge cases
- [x] Direct entry, invalid/untrusted return/query or date input, nested context where applicable. (상태별 직접 진입·알 수 없는 상태·외부 from·빠른 연속 선택·중첩 from 회귀 준비)
### Error paths
- [ ] No silent success/fallback or unsafe external navigation.
### Mock data updates needed
- [ ] Sync only necessary local fixture contracts; global API/MSW/schema changes require root coordination.

## Parallel Work Breakdown
- Phase A: builder investigates, records exact root cause, adds narrow RED regression, implements.
- Phase B: root serializes validation; independent reviewer checks final diff; root commits/pushes/dev PR and tracker comment.
- Owned files: apps/v1_web/src/app/my/schedule/; apps/v1_web/src/app/teams/[id]/schedules/[scheduleId]/ detail if needed; respective local tests; apps/v1_web/src/components/team-schedules/team-schedules-client.tsx (MySchedulePageClient only, root-approved scope expansion); apps/v1_web/src/components/team-schedules/team-schedules.view-model.ts (my-schedule link modeling only if needed); this task; .changeset/mdqa-26-my-schedule-return.md.
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
- Removed the hard-coded all reset and bare /my/schedule detail origin in the touched my-schedule client.
- Reused MyScheduleViewModel's status union and the existing sanitized withFromPath/AppBackLink flow. Root requested the smallest existing-client fix rather than unrelated file extraction.

## Security Notes
- Preserve authentication/authorization; validate local return paths and untrusted query input where applicable. No secrets read/output.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |
| 2026-10-06 | mdqa_26_builder | Route pages are wrappers; the actual MySchedulePageClient is outside the initial owned paths. | Root approved only the my-schedule client and related link-model code. No shared navigation or API edits. |
| 2026-10-06 | mdqa_26_builder | Is UI A/B/C needed for this fix? | CLAUDE.md UI-start policy excludes logic-only changes. Existing screen structure and controls stay unchanged. |

## Progress Snapshot
- Phase: A / Investigation and implementation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-26-my-schedule-return/matchup-sports-platform
- Branch: fix/mdqa-26-my-schedule-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Root cause: MySchedulePageClient initializes its status to all on every mount, and detail links carry only /my/schedule as their from path. The existing detail AppBackLink already honors a sanitized full from path.
- RED verified by root: 26-red.log, 1/1 failed because the actual detail href had from=/my/schedule without status=scheduled. Production remained unchanged for that run.
- Implementation: allowlist URL status, maintain immediate local selection, replace the list URL without scrolling, and generate the detail from path from that current selection. No detail, attendance, write, API, permission or shared navigation code was changed.
- Regression: apps/v1_web/src/app/my/schedule/my-schedule-return.test.tsx renders the actual list, team schedule detail and AppBackLink, then remounts the returned list. It additionally covers all existing non-all status values, unknown status, external from, rapid selection before URL reflection, and unrelated/nested query preservation.
- GREEN commands submitted to root: pnpm --filter v1_web test src/app/my/schedule/my-schedule-return.test.tsx src/app/my/schedule/my-schedule.test.tsx src/app/teams/[id]/schedules/team-schedules.test.tsx --maxWorkers=1 --minWorkers=1 --no-file-parallelism; pnpm --filter v1_web lint (root schedules required pre-commit checks).
- Validation: GREEN pending; do not claim alpha QA from code/CI.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 3 files/46 cases GREEN. Logs: "26-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (26-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-26-27.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
