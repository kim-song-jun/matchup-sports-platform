# Task 20261032: 관리자 리그 체계 목록 복귀 보존 (MD-QA #25)

### Progress Snapshot — publication cursor 2026-10-06
- Phase C: code and initial validation committed; dev PR https://github.com/kim-song-jun/matchup-sports-platform/pull/1636 OPEN.
- Source/head: fe05210e49deeba101ce75d9c54e75733e34adcf; base: dev; merge: pending. Root exact committed scope verified; source was clean after publication.
- Tracker: 김성준 / 확인 중. Saved visible fix/PR comment is recorded in root ignored saved-pr-comments.json (report 25); no duplicate comment or closed-state claim.
- Latest head Copilot requested once; latest audit 2026-10-06T04:38:56.765Z: result pending; no clean review inferred.
- Latest head CI audit: Gates=IN_PROGRESS, API=SUCCESS, Web=IN_PROGRESS. PR open/CI success does not establish merged or deployed alpha QA.
- Root code tests/type/pattern/independent review evidence is in committed Root Validation above. Actual deployed report scenario verification remains pending.
- Resume exact mapping/head/merge/latest comments from root own tmp/qa/mdqa-assigned-monitor/state.json. Next loop starts at project-wide unresolved MD-QA UI and handles same-ticket recurrence and real latest PR findings.

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

### Progress Snapshot — final publication/review cursor 2026-10-06T05:15:28.2283409Z
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1636, base dev, state OPEN, latest head fe05210e49deeba101ce75d9c54e75733e34adcf, merge .
- Latest head Copilot: FINDINGS_PRESENT, submitted 10/06/2026 04:40:29, unresolved threads 1, complete pagination read. Latest direct reviews and full bodies preserved in root pr-final-audit.json.
- CI: Gates COMPLETED/SUCCESS, API COMPLETED/SUCCESS, Web COMPLETED/SUCCESS. GitHub Advanced Security provider-model failure remains a separate external blocker; no security success or merge claim.
- Existing tracker comment cursor: https://teameet.jmandu.kr/issues/25/#comment-44, save/visible verified True, exact head fe05210e49deeba101ce75d9c54e75733e34adcf. Earlier comments and initial/followup RED/GREEN are preserved.
- Implementation and serial narrow tests/type/pattern/independent reviews are complete. Final code/test snapshots are committed and scoped; this publication cursor is retained as an owned local task update.
- Actual alpha acceptance, post-merge outcome and tracker completion remain pending. No new alpha QA, Done, unassignment, hold or Slack action occurred.

## Phase D — PR #1636 direct finding followup (2026-10-06)
- Direct finding verified against current head `fe05210e49deeba101ce75d9c54e75733e34adcf`: [discussion_r4191718389](https://github.com/kim-song-jun/matchup-sports-platform/pull/1636#discussion_r4191718389), thread `PRRT_kwDORrML2s6pU3JS` unresolved/not outdated. Exact full finding read from root `pr-final-audit.json` / `data.repository.p1636`; this is separate from the earlier Copilot result.
- Root cause: URL-sync effect accepts every delayed query without comparing the actual same-route browser URL, overwriting both `filters` and `latestFilters.current`. The next tab click then merges the obsolete selection.
- RED-ready regressions retain the actual mounted Hub: series → independent followed by the previous series snapshot checks the active chip, actual independent-only rows, next tab-change merging and detail `from`; reverse tab selection followed by the previous tab snapshot checks the latest tab and rows.
- Test harness now uses actual `window.history`/`window.location` for navigation while independently controlling only the delayed `useSearchParams` snapshot. Existing 12 regression assertions remain meaningful; no product changes made before root RED.
- Phase D exact ownership: `page.tsx`, `league-return.test.tsx`, this task only. All validation processes, independent review, Git/PR/tracker/browser actions remain root-owned. Root publication cursors above are preserved.
- Root serialized command: `pnpm --filter v1_web exec vitest run src/app/admin/league-matches/league-return.test.tsx --maxWorkers=1 --minWorkers=1` (14 cases total, 2 new expected intended RED failures).
- Root confirmed Phase D RED at 14:24:54 KST in `25-phase-d-red.log`: new delayed series/tab snapshots fail the intended newest `aria-pressed`/`aria-selected` contracts; existing 12 cases pass. Root then authorized the product fix.
- Root approved exact fourth path `page.test.tsx` to keep its four tab/create/list/direct-entry contracts while changing the router-call assertion to actual browser URL + visible tab; fixtures now reset actual URL and align direct-entry query snapshots.
- Minimal product fix: filter/tab changes synchronously replace native history; delayed snapshots only restore state/ref when they match the actual same-route URL. List href construction uses the actual same-route query/hash with an SSR-safe fallback, preserving current nested context and merging latest filter draft.
- Additional regression exercises native Back/Forward on the retained Hub, actual matching restored queries, exact row counts, hash/nested detail return context, and the installed Next history `replaceState`/copyState boundary (existing shared helper reused unchanged). It asserts history length and Next internal tree preservation. Browser race/alpha integration coverage is still separate.
- SSR regression renders the real Hub with `window` undefined; no browser global is required for list rendering. Current regression count: 16 (original 12 plus stale series/tab, native history traversal/boundary, SSR).
- Phase D GREEN-ready: `pnpm --filter v1_web exec vitest run src/app/admin/league-matches/league-return.test.tsx src/app/admin/league-matches/page.test.tsx 'src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx' --maxWorkers=1 --minWorkers=1`; all test/type/pattern processes remain root-owned, no builder execution.

## Root Phase D Validation — 2026-10-06
- 실제 direct P2의 지연된 체계·탭 snapshot 회귀 RED: 2 FAIL / 기존 12 PASS (`25-phase-d-red.log`). 수정 전 원인을 재현했고 테스트 실패를 CLI 진입 실패와 혼동하지 않았습니다.
- 최소 수정 후 실제 허브·상세 복귀·native Back/Forward·설치된 Next history 경계·SSR 및 기존 fixtures 관련 3파일 91/91 PASS (`25-phase-d-green.log`). 기존 PersistQueryClientProvider act 경고 36건을 보존·기록했습니다.
- 최종 TypeScript 및 기존 v1 패턴 검사 PASS (`25-phase-d-type-pattern.log`); 직렬·최소 worker, 전체 suite/build·로컬 Next 서버 중복 실행 없음.
- 독립 delta 리뷰 functional/structure/standards/security 4/4, Critical 0 / Warning 0 (`review-25-phase-d.md`). 실제 리뷰 지적·RED·GREEN·Next history helper와 source/test 해시를 교차 검수했습니다.
- 본인 exact 4 paths만 변경합니다: hub page, 기존 page test, 기존 return regression, 이 task. shared helper/API/DB/MSW/fixture 계약 변경과 새 의존성/부채 marker 없음. 기존 Changeset 범위에 포함됩니다.
- PR1636은 같은 feature branch의 후속 커밋으로 갱신합니다. 최신 head 리뷰/CI/dev 머지는 아직 별도 게이트이며 이 코드 검증은 실제 alpha QA나 리포트 완료를 뜻하지 않습니다.
- Matching history restore also covers a previously rejected snapshot whose query string is unchanged when Back reaches it. A same-route `popstate` listener restores the actual URL draft/ref and removes itself on unmount; the retained-component regression exercises native Back/Forward with that prior snapshot held constant.
- Phase D static review: scoped four-file diff, no new imported production dependency, no touched-code debt markers, `git diff --check` clean. Hub 245 pure LOC and regression 249 are in the warning band; no further growth or broad abstraction planned. No type casts, unsafe navigation, API/mock contract change or browser/server process added. Builder source frozen for root GREEN/review.
