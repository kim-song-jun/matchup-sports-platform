# Task 20261031: 팀 목록 검색 상세 복귀 보존 (MD-QA #24)

### Root Phase C validation — 2026-10-06
- Actual Web CI old bare-link expectation repaired in this same PR/worktree. Current delta verified; source/test scope preserved.
- Root serialized narrow GREEN: first HTML23/23 PASS. Evidence: 24-ci-green.log.
- Changed-tree TypeScript and existing v1 pattern checker PASS (24-review-type-pattern.log). Independent delta review4/4, Critical0/Warning0; root inspected actual diff.
- Commit/push/new-head review/tracker follow-up pending below; no merged, deployed or alpha browser success claimed.

Status: Review
**Owner**: root → mdqa_24_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/24/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=24). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #24 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] E2E 알파 A팀 검색 query가 반영된 목록→팀 상세→뒤로가기에서 검색어와 필터/결과를 보존한다. 기존 팀매치/프로필/멤버 경유 복귀 문맥을 손상하지 않는다.
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
- Phase C: Web CI follow-up for PR #1635. Builder owns only the `/teams` seed-success case in `apps/v1_web/src/app/list-pages-first-html.test.tsx` and this task; root owns serialized validation, review, commit and push. All other route cases, product code, shared helpers/API and browser work remain excluded.
- Owned files: apps/v1_web/src/app/teams/page.tsx and list client; apps/v1_web/src/app/teams/[id]/page.tsx and team detail client; apps/v1_web/src/components/teams/teams-client.tsx (TeamListPageClient); apps/v1_web/src/components/teams/teams-page.tsx (public TeamListPageView/TeamCard only, root approved 2026-10-06); apps/v1_web/src/components/teams/teams-search-return.test.tsx; corresponding local tests (NOT records/schedules subdirectories); this task; .changeset/mdqa-24-team-return.md.
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
- Public TeamCard used a fixed detail href, losing the confirmed list URL before the existing sanitized AppBackLink could consume it. The list client now passes the confirmed URL (without transient filter-sheet state) through TeamListPageView/TeamCard with the existing sanitized from-chain contract.
- No new TODO/FIXME/HACK/XXX markers in the touched paths. No API, fixture, shared helper or shared type contract change.

## Security Notes
- Preserve authentication/authorization; validate local return paths and untrusted query input where applicable. No secrets read/output.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |
| 2026-10-06 | mdqa_24_builder | Public list/Card view ownership | root approved the exact teams-page.tsx public list/Card lines; records/schedules/create/edit remain excluded. |
| 2026-10-06 | mdqa_24_builder | UI option gate | Existing href/return logic only, with no layout, information architecture, style or copy change. CLAUDE excludes logic-only changes from A·B·C screen design options. |

## Progress Snapshot
- Phase: A / Minimal implementation ready for root's serialized GREEN validation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-24-team-return/matchup-sports-platform
- Branch: fix/mdqa-24-team-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Exact report read: synthetic E2E 알파 A팀, confirmed `/teams?q=E2E+%EC%95%8C%ED%8C%8C+A%ED%8C%80`, team id `00620e9d-b432-4a59-98ef-68afcac31c8b`, 1 filtered result returns to unfiltered 20-team list via app back. Search-before-URL-settles observation is explicitly excluded.
- Investigation: public TeamCard drops the source query; detail AppBackLink already reads a sanitized `from`. Alternatives checked: submit timing excluded by report and regression waits for q; list remount correctly hydrates q; no shared helper change needed.
- Regression prepared before product edits: real TeamList/Detail/Members views, API hooks with local HTTP MSW responses and actual AppBackLink click behavior. Next URL adaptation alone is in-memory. Covers query, other filters, nested member/profile/team-match hrefs, direct and unsafe external source.
- RED command (root serial execution only): `pnpm --filter v1_web test -- src/components/teams/teams-search-return.test.tsx --maxWorkers=1 --no-file-parallelism`.
- RED evidence (root serial run): 3 failed / 2 passed. Both primary search scenarios reproduced the report: actual return `/teams` versus expected confirmed `/teams?q=...` (plus selected filters in the second case). The third failure was a test's exact member accessible-name mismatch, separately corrected to the actual row name; missing league-matches HTTP fixture is now explicit rather than suppressed.
- Product patch: only TeamListPageClient and public TeamListPageView/TeamCard href propagation. No detail/member/profile/team-match navigation mechanism was changed. Changeset added.
- GREEN command (root serial execution only): `pnpm --filter v1_web test -- src/components/teams/teams-search-return.test.tsx --maxWorkers=1 --no-file-parallelism`.
- Validation: GREEN-ready, not yet passed; no independent validation launched. Do not claim alpha QA from code/CI.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 1 files/5 cases GREEN. Logs: ["24-green.log","24-final-green.log"] (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun 5/5 + final tsc PASS. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (24-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-24-28-29.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.

## Phase C — First HTML Contract Sync (2026-10-06)
- PR: #1635. Actual CI run `37413928418`, Web job `112108254172`: 596 test files / 6474 tests passed, 1 test failed at `list-pages-first-html.test.tsx:186`, expecting the old bare `href="/teams/team-1"` after the Card began adding a list return source.
- Evidence read: root's `tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/24-ci-failure-summary.txt`. This is an assertion-contract drift, not a new production navigation change.
- Changed only the existing `/teams` real SSR seed-success test. Parse actual script-free card markup, require one same-origin `/teams/team-1` link with empty hash, and require decoded query entries to be exactly `[['from', '/teams']]`. Duplicate/extra params and a wrong origin/path remain failures.
- Preserve actual body seed name, sport chip, no loading state, canonical JSON-LD team path/name and card-to-JSON-LD path correspondence. Other route cases and the shared `detailPaths` helper are unchanged.
- Exact affected command for root: `pnpm --filter v1_web test -- src/app/list-pages-first-html.test.tsx --maxWorkers=1 --no-file-parallelism`.
- Status: ready for root's serialized affected-test/type/review gates; builder launched no tests, builds, Git mutations or browser actions.
