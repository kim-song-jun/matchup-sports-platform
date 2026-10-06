# Task 20261032: 관리자 리그 체계 목록 복귀 보존 (MD-QA #25)

Status: Review
**Owner**: root → mdqa_25_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/25/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=25). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #25 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [x] 서울 풋살 커뮤니티 리그 체계 선택→리그 상세→리그 목록으로에서 해당 체계/목록 조건을 보존한다. 현재 목록이 지원하는 체계 소속·독립 리그 행과 safe return path를 유지한다(구현 완료, root GREEN 검증 대기).
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
- Owned files: apps/v1_web/src/app/admin/league-matches/ route module and local tests only; this task; .changeset/mdqa-25-admin-league-return.md.
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
- `LeagueHub` stored `seriesFilter` only in memory. Local filter draft now hydrates from `seriesId` and mirrors to the URL; tab changes merge the latest selection and retain other list query context.
- List rows now carry their list URL using existing `withFromPath()`. The existing async detail route sanitizes `from` once with `sanitizeRedirectPath()` and supplies the return href to the existing client. No shared contracts changed.

## Security Notes
- Preserve authentication/authorization; validate local return paths and untrusted query input where applicable. No secrets read/output.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |
| 2026-10-06 | builder → root | Original phrase 정규리그·팀리그 versus current route contract | Root confirmed no separate team-league route is intended; preserve existing grouped-series and independent rows only. |
| 2026-10-06 | builder | UI choice gate | `CLAUDE.md` UI 착수 규칙 excludes logic-only changes. Existing markup, styling, labels, and layout remain as implemented; URL state/return wiring is the scoped fix. |

## Progress Snapshot
- Phase: A / Implementation complete; root serialized GREEN pending.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-25-admin-league-return/matchup-sports-platform
- Branch: fix/mdqa-25-admin-league-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Exact intake verified: desktop 1182×757, existing draft league `ad210000-0000-4000-8000-000000000001`, selected 서울 풋살 커뮤니티 리그 yields 2 rows; unfiltered return showed 21 rows. Two reports observed; no data-write failure claimed.
- RED evidence: root `25-red.log`, 1/1 failed for the intended reason: returned URL `seriesId=null` versus selected SERIES_ID. Production fix followed root's RED confirmation.
- Regression: rendered `league-return.test.tsx` exercises selecting the actual chip, opening the actual table row, rendering the actual async detail page, clicking detail's return link, then mounting the returned list. Local fixtures use two grouped rows plus one independent row to prove filtering.
- Edge cases: independent rows; filter/tab/existing `from` context; external URL restoration and clearing filters; direct entry; external/protocol-relative/backslash/dot-path/script/login/duplicate return rejection; nested local context.
- Validation: root-serialized GREEN/type/pattern checks pending; builder has not run tests/typecheck/build/server. Alpha QA remains root-owned after merge.
- Builder static checks: `git diff --check` clean; no `TODO`/`FIXME`/`HACK`/`XXX` markers in touched code; untracked imports none (new test/task/changeset only). New regression 164 pure LOC, route page 13, hub 234 (warning band, no further growth planned). Existing large fixtures client only has prop/href substitutions; no new lines or unrelated refactor.
- Self-review: list state owns filter/navigation context; server route owns untrusted return parsing; fixtures client renders a supplied href. No new cast, non-null assertion, logging, dependency, input error suppression, or API/MSW contract. Existing helpers own nested-path safety.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 3 files/87 cases GREEN. Logs: "25-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (25-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-22-23-25.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 기존 wrapper의 act 경고 36건은 기록했고 오류로 숨기지 않았습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
