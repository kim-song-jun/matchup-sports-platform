# Task 20261030: 공지 안내 유형 상세 복귀 보존 (MD-QA #23)

Status: Review
**Owner**: root → mdqa_23_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/23/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=23). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #23 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 안내 공지 유형을 선택한 목록→기존 공지 상세→화면 뒤로가기에서 선택 유형을 유지한다. direct entry 기본 복귀와 안전한 local return path를 보존한다.
- [x] Preserve unrelated route/API/permission and user selection contracts.
- [ ] Read exact report reproduction from intake evidence; do not substitute a different symptom.

## User Scenarios
- Exact report scenario: `/notices`에서 `안내` 선택 → 기존 `/notices/48cb17a3-3c43-4079-9825-ad13eefe6bae` 상세 → 데스크톱 화면의 뒤로가기 → 같은 목록에서 `안내` 유지.
- Report scope: 유형 선택 초기화만 확인됐으며 전후 링크 수는 1건으로 동일했다. 기록 누락·건수 변화·잘못된 목적지 이동은 관측하지 않았다.

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
- Owned files (root-approved 2026-10-06):
  - `apps/v1_web/src/components/notices/notices-client.tsx`
  - `apps/v1_web/src/components/notices/notices-page.tsx`
  - `apps/v1_web/src/components/notices/notices.types.ts`
  - `apps/v1_web/src/components/notices/notices-client.test.tsx` and directly affected notices local tests
  - `apps/v1_web/src/app/notices/page.tsx` / `apps/v1_web/src/app/notices/[id]/page.tsx` only if required
  - `.github/tasks/20261030-mdqa-23-notice-return.md`
  - `.changeset/mdqa-23-notice-return.md`
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
- Root cause confirmed: list category is only `useState('전체')`, and notice rows always link to an id without the selected list context. Returning mounts the default category again.
- Existing `AppBackLink` already reads and sanitizes `from`; reuse that contract without changing the shared helper.
- Selected category now hydrates from the whitelisted `category` query and remains a local draft for immediate interactions; a query-only route change resynchronizes the draft.
- Detail links carry the list query and bounded/sanitized nested origin through existing `withFromPath`. Default `/notices/:id` links remain unchanged when the list has no query.
- Removed the unused `NoticeModel` import. Touched-path marker scan: no TODO/FIXME/HACK/XXX.

## Security Notes
- Preserve authentication/authorization; validate local return paths and untrusted query input where applicable. No secrets read/output.
- Category accepts only existing `전체` / `업데이트` / `안내` controls. Detail return paths remain protected by existing `withFromPath` and `AppBackLink` sanitization; no shared helper or API contract changed.

## Risks & Dependencies
- Current base origin/dev 858a710aabccc1ffb18f06c0df4b27df5356c0bd. Root handles newer dev drift.
- Shared contracts owned separately; report any needed shared edit before changing it.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-06 | root | Intake scope | Latest user instructs project-wide unassigned intake, then own assigned fixes; others' active work is preserved. |
| 2026-10-06 | mdqa_23_builder | Notices view/model ownership | Root approved the directly used notices-page.tsx, notices.types.ts, notices-client.tsx and local tests. |
| 2026-10-06 | mdqa_23_builder | A·B·C UI gate | CLAUDE.md UI 착수 규칙 excludes logic-only changes (line 337). This fix changes category/return URL logic without changing layout, copy, styling or components. |

## Progress Snapshot
- Phase: A / Product fix and changeset ready; awaiting root's serialized GREEN and type/pattern validation.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-23-notice-return/matchup-sports-platform
- Branch: fix/mdqa-23-notice-return
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- RED: root reported `23-red.log`, 3 failed / 6 passed. Selected-category return, URL hydration and nested origin failed; default/direct and unsafe-return cases passed. Builder did not independently run validation.
- GREEN command: `pnpm --filter v1_web test -- src/components/notices/notices-client.test.tsx src/components/notices/notices-page.test.tsx src/app/notices/notices-page-seed.test.tsx src/app/notices/[id]/page.test.tsx --maxWorkers=1 --minWorkers=1 --fileParallelism=false`.
- Regression: actual list/detail clients, views, AppBackLink, query hooks and API envelope parsing run against local MSW; only the browser router boundary is substituted. Coverage includes the selected-category round trip, URL hydration, safe nested origin, default/direct destination, unknown category and unsafe return paths.
- Additional cases cover direct-detail click navigation, rapid category changes before router query synchronization, and incoming query changes on the existing list instance (12 regression cases total).
- Static checks by builder: `git diff --check` passed; exact changed/untracked files match Owned scope; production source pure LOC 95 / 131 / 23 and regression 160, all below the skill warning band. No browser/server/test/typecheck/build process started.
- Alpha QA: pending root after merge; code/unit evidence cannot establish alpha behavior.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 4 files/19 cases GREEN. Logs: "23-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (23-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-22-23-25.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 관련 회귀 실행에서 미처리 MSW 요청이나 act 경고가 없습니다.
- 실제 렌더링된 제어·상세 복귀 경로와 결과를 검증했습니다. 배포된 alpha에서 원문 시나리오를 다시 확인해야 합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
