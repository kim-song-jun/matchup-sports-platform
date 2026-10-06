# Task 20261034: 관리자 대회 목록·개요 날짜 KST 통일 (MD-QA #27)

Status: Review
**Owner**: root → mdqa_27_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/27/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=27). Read this entry before analysis.
- Existing tasks/worktrees and latest dev PRs checked; no MD-QA #27 implementation/PR exists.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 같은 scheduledAt/scheduledEndAt/registrationDeadline을 관리자 목록·개요에서 제품 Asia/Seoul 정책으로 일관되게 표시한다. UTC 등 host TZ 회귀와 invalid/null 값 계약을 실제 테스트한다. API 원본 불일치는 별도로 대조한다.
- [x] Preserve unrelated route/API/permission and user selection contracts.
- [x] Read exact report reproduction from intake evidence; do not substitute a different symptom.

## User Scenarios
- Follow the report's exact list/detail/return or date comparison scenario using existing v1 data; successful behavior meets Original Conditions.

## Test Scenarios
### Happy path
- [x] Real formatter regression fails before fix: root `27-red.log`, UTC/LA 2 failures, Seoul/input contracts 5 passes (13 other tests skipped). LA reproduces the report's exact visible 16-hour difference on the same synthetic ISO input; GREEN pending.
### Edge cases
- [ ] Direct entry, invalid/untrusted return/query or date input, nested context where applicable.
### Error paths
- [ ] No silent success/fallback or unsafe external navigation.
### Mock data updates needed
- [ ] Sync only necessary local fixture contracts; global API/MSW/schema changes require root coordination.

## Parallel Work Breakdown
- Phase A: builder investigates, records exact root cause, adds narrow RED regression, implements.
- Phase B: root serializes validation; independent reviewer checks final diff; root commits/pushes/dev PR and tracker comment.
- Owned files: apps/v1_web/src/lib/date-utils.ts and date-utils.test.ts (single owner); admin tournaments list/overview formatter use and their local tests only if required; this task; .changeset/mdqa-27-admin-date-kst.md.
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
- 관리자 목록의 짧은 날짜 포맷터가 기기 로컬 getter를 사용해 KST 개요와 날짜·시각이 달라지는 결함을 확인했다. `formatAdminDateTimeShort`가 기존 `getTournamentKstParts` 헬퍼를 재사용하도록 최소 수정했다. 출력 `M.D HH:MM`, 빈 값 `—`, invalid 원문 계약은 유지한다.
- 화면 마크업·레이아웃·새 디자인 상태를 변경하지 않는 로직 전용 수정이다. `CLAUDE.md` UI 착수 규칙의 로직 전용 예외가 적용된다.

## Investigation Evidence
- 재현 대상: `/admin/tournaments`에서 `12팀` 검색 → 기존 진행 중 대회 행 일정·접수 마감 확인 → `/admin/tournaments/ad120000-0000-4000-8000-000000000001/overview` 비교 → 목록과 개요 재방문.
- 신고 표기: 목록 `10.11 09:24 ~ 10.11 17:24` / 개요 `2026. 10. 12. 오전 01:24 ~ 2026. 10. 12. 오전 09:24`; 마감 목록 `10.4 08:24` / 개요 `2026. 10. 5. 오전 12:24`.
- v1 생산 경로 대조: `TournamentsAdminController.list/get` → `TournamentsAdminService.list/get` 모두 동일 `serialize` 사용. `scheduledAt`, `scheduledEndAt`, `registrationDeadlineAt`은 해당 `V1Tournament` row 날짜의 `toISOString()` 또는 `null`. 목록 status query는 row 선택만 바꾸며 시각을 변환하지 않는다. 두 경로 모두 `V1AuthGuard`와 `getActiveAdmin` 보호를 유지한다.
- v1 소비 경로 대조: `useV1AdminTournaments`는 `/admin/tournaments`, `useV1AdminTournament`는 `/admin/tournaments/:id` 응답을 그대로 사용한다. 목록은 `formatAdminDateTimeShort`의 로컬 getter, 개요는 `tournament-admin-shared.formatDate/formatDateRange`의 `Asia/Seoul` formatter를 사용한다.
- 한계: intake에는 실제 두 API 원본·DB 값·브라우저 TZ·serving SHA가 없다. 생산 경로의 공통 serializer와 formatter 불일치는 소스로 확인했지만, 라이브 동일 row 원본 대조와 배포 후 alpha 재방문은 root QA에서 별도로 기록한다.
- 회귀 데이터는 신고 표기와 일치하는 합성 ISO 값이며 실제 API 원본으로 주장하지 않는다. 새 Node 프로세스의 `TZ=UTC`, `America/Los_Angeles`, `Asia/Seoul` 및 `Intl.DateTimeFormat().resolvedOptions().timeZone`을 확인해 실제 목록·개요 함수에 같은 값을 적용한다. Vitest worker의 환경 변수만 바꾸는 테스트를 사용하지 않는다.

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
- Phase: A / Real RED confirmed; minimal formatter fix and Changeset written, root serial GREEN pending.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-27-admin-date-kst/matchup-sports-platform
- Branch: fix/mdqa-27-admin-date-kst
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: not created.
- Validation: root initial run had 3 harness failures (`import.meta.url` became jsdom HTTP URL; `ERR_UNSUPPORTED_ESM_URL_SCHEME`) and 4 input-contract passes; this was not formatter RED evidence. Corrected harness uses `pathToFileURL(resolve('src/...'))`. Root then confirmed actual formatter RED (`27-red.log`): UTC/LA 2 failures / 5 passes / 13 skipped, with LA list labels matching the report exactly. Production fix followed this confirmation. Root GREEN commands: `pnpm --filter v1_web exec vitest run src/lib/date-utils.test.ts src/app/admin/tournaments/[id]/overview-section.test.tsx src/app/admin/tournaments/[id]/tournament-detail-shared.test.tsx --maxWorkers=1 --no-file-parallelism`; `pnpm --filter v1_web lint`. Do not claim alpha QA from code/CI.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 3 files/36 cases GREEN. Logs: "27-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (27-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-26-27.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 별도 TZ 자식 프로세스의 Node MODULE_TYPELESS_PACKAGE_JSON 경고 3건을 기록했습니다.
- 동일 serializer와 실제 UTC/LA/KST 프로세스에서 같은 합성 ISO 값의 표시를 대조했습니다. 라이브 두 API 원본·DB 값과 배포 후 화면은 별도 확인이 필요합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.
