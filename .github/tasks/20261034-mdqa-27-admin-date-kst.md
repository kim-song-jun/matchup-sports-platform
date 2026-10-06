# Task 20261034: 관리자 대회 목록·개요 날짜 KST 통일 (MD-QA #27)

Status: Review
**Owner**: root → mdqa_27_builder
**Created**: 2026-10-06

## Context
- Report: https://teameet.jmandu.kr/issues/27/
- Root actually read the report/reproduction and accepted it through MD-QA UI. Assignee 김성준 / 확인 중 verified.
- Exact report and intake evidence: F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-intake/intake-audit.json (entry id=27). Read this entry before analysis.
- Intake 시 기존 tasks/worktrees·dev PR를 대조했고 선행 MD-QA #27 구현은 없었다. 현재 PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1631 (base dev, initial head `a6db56c08a78a37b0de7f6fed65eb28239dc9889`). Root cursor의 tracker 진행 comment40은 유지하며 완료로 처리하지 않는다.

## Goal
Fix the reported current-v1 behavior with the smallest correct change and a real regression, then independent review and dev PR.

## Original Conditions (must all be satisfied)
- [ ] 같은 scheduledAt/scheduledEndAt/registrationDeadline을 관리자 목록·개요에서 제품 Asia/Seoul 정책으로 일관되게 표시한다. UTC 등 host TZ 회귀와 invalid/null 값 계약을 실제 테스트한다. API 원본 불일치는 별도로 대조한다.
- [ ] Preserve unrelated route/API/permission and user selection contracts. Phase C에서 기존 local 관리자 formatter family의 목록·상세 일치 회귀를 수정한다.
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
- Phase C: 실제 PR #1631 Copilot 2 finding을 source와 교차 검증 → local family 보존 RED → 전용 KST short를 대회 목록에만 연결 → root 직렬 GREEN·후속 리뷰.
- Owned files: apps/v1_web/src/lib/date-utils.ts and date-utils.test.ts (single owner); admin tournaments list/overview formatter use and their local tests only if required; this task; .changeset/mdqa-27-admin-date-kst.md.
- Forbidden: all other modules, shared hooks/types/MSW/DTO/schema/navigation helpers, other tasks/state, dev/main, browser/tracker actions, commit/push. Date utility exception belongs only to #27.
- You are not alone. Preserve others' changes and coordinate scope expansion with root.
- Do not run tests/typecheck/build yet: report exact commands to root for serial validation scheduling. No local Next server.

## Acceptance Criteria
- [x] Reported contract fixed with real regression evidence.
- [ ] Narrow tests and required types/patterns pass. Phase B passed; Phase C updated source needs root GREEN/type/pattern confirmation.
- [ ] Independent review Critical=0 / Warning=0; scope and committed tree verified.
- [x] Changeset and relevant contracts synchronized.
- [ ] dev PR / latest-head review / tracker comment linked; actual browser QA recorded separately after merge.

## Tech Debt Resolved
- 관리자 대회 목록의 날짜·시각과 KST 개요가 달라지는 결함을 확인했다. Phase C 최종 수정은 기존 `getTournamentKstParts`를 재사용하는 전용 `formatAdminKstDateTimeShort`를 대회 목록의 일정·마감에만 연결한다. 공용 `formatAdminDateTimeShort`는 원래 local 계약으로 복원해 다른 관리자 목록·상세를 보존했다. 출력 `M.D HH:MM`, 빈 값 `—`, invalid 원문 계약은 유지한다.
- 화면 마크업·레이아웃·새 디자인 상태를 변경하지 않는 로직 전용 수정이다. `CLAUDE.md` UI 착수 규칙의 로직 전용 예외가 적용된다.

## Investigation Evidence
- 재현 대상: `/admin/tournaments`에서 `12팀` 검색 → 기존 진행 중 대회 행 일정·접수 마감 확인 → `/admin/tournaments/ad120000-0000-4000-8000-000000000001/overview` 비교 → 목록과 개요 재방문.
- 신고 표기: 목록 `10.11 09:24 ~ 10.11 17:24` / 개요 `2026. 10. 12. 오전 01:24 ~ 2026. 10. 12. 오전 09:24`; 마감 목록 `10.4 08:24` / 개요 `2026. 10. 5. 오전 12:24`.
- v1 생산 경로 대조: `TournamentsAdminController.list/get` → `TournamentsAdminService.list/get` 모두 동일 `serialize` 사용. `scheduledAt`, `scheduledEndAt`, `registrationDeadlineAt`은 해당 `V1Tournament` row 날짜의 `toISOString()` 또는 `null`. 목록 status query는 row 선택만 바꾸며 시각을 변환하지 않는다. 두 경로 모두 `V1AuthGuard`와 `getActiveAdmin` 보호를 유지한다.
- v1 소비 경로 대조: `useV1AdminTournaments`는 `/admin/tournaments`, `useV1AdminTournament`는 `/admin/tournaments/:id` 응답을 그대로 사용한다. 원래 목록은 `formatAdminDateTimeShort`의 로컬 getter, 개요는 `tournament-admin-shared.formatDate/formatDateRange`의 `Asia/Seoul` formatter를 사용했다. Phase C 최종 목록 caller는 전용 `formatAdminKstDateTimeShort`를 사용한다.
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
- Phase: C / Actual Copilot findings confirmed, root true RED recorded, dedicated KST short/local restore/tournament-only caller implemented; root serial GREEN pending.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-27-admin-date-kst/matchup-sports-platform
- Branch: fix/mdqa-27-admin-date-kst
- Tracker: 확인 중 / 김성준; actual intake saved 2026-10-06.
- PR/head/merge: PR #1631 / `a6db56c08a78a37b0de7f6fed65eb28239dc9889` / open, not merged. Root tracker cursor: comment40, 확인 중.
- Validation: root initial run had 3 harness failures (`import.meta.url` became jsdom HTTP URL; `ERR_UNSUPPORTED_ESM_URL_SCHEME`) and 4 input-contract passes; this was not formatter RED evidence. Corrected harness uses `pathToFileURL(resolve('src/...'))`. Root then confirmed actual formatter RED (`27-red.log`): UTC/LA 2 failures / 5 passes / 13 skipped, with LA list labels matching the report exactly. Production fix followed this confirmation. Root GREEN commands: `pnpm --filter v1_web exec vitest run src/lib/date-utils.test.ts src/app/admin/tournaments/[id]/overview-section.test.tsx src/app/admin/tournaments/[id]/tournament-detail-shared.test.tsx --maxWorkers=1 --no-file-parallelism`; `pnpm --filter v1_web lint`. Do not claim alpha QA from code/CI.

## Root Validation — 2026-10-06
- Phase B: real RED -> minimal source fix -> related 3 files/36 cases GREEN. Logs: "27-green.log" (root ignored intake directory).
- Final TypeScript PASS; initial combined lint reached pattern script except #24 test-only fixture/options errors, corrected and rerun not applicable to this report. Initial Windows find.exe pattern execution failed; process-local ComSpec=existing Git Bash retry PASS (27-patterns.log), unchanged checker/product environment policy. No repeated full suite/build or local Next server.
- Independent review 4/4 PASS, Critical0/Warning0 (review-26-27.md). Touched marker0, diff --check clean, exact pathspec approved; no untracked production import.
- 별도 TZ 자식 프로세스의 Node MODULE_TYPELESS_PACKAGE_JSON 경고 3건을 기록했습니다.
- 동일 serializer와 실제 UTC/LA/KST 프로세스에서 같은 합성 ISO 값의 표시를 대조했습니다. 라이브 두 API 원본·DB 값과 배포 후 화면은 별도 확인이 필요합니다.
- Latest cursor overrides earlier pending implementation/validation notes: implementation and code validation complete; root commit/PR/latest-head review/merge/tracker cursor follows. Tracker remains 김성준 / 확인 중; no close or alpha success claim.

## Phase C — Copilot Findings (2026-10-06)
- Actual review evidence: root intake `pr-latest-audit.json`, PR #1631 review body + 2 unresolved threads at head `a6db56c08a78a37b0de7f6fed65eb28239dc9889`.
- Additional direct review at 04:50:34Z raised the same two findings (discussion4191638170/4191638175); they are covered by the same Phase C fix, without a duplicate branch/PR.
- High [shared short formatter regression](https://github.com/kim-song-jun/matchup-sports-platform/pull/1631#discussion_r4191574022) is real: matches/team-matches/inquiries lists use `formatAdminDateTimeShort`; corresponding details use local `formatAdminDateTime`. Initial KST change causes UTC/LA list/detail drift outside tournaments. Existing `formatAdminKstDateTime` supplies the dedicated KST convention. Root accepted a short sibling, local shared formatter restoration, and a tournament-only caller change.
- Medium [Node flag compatibility](https://github.com/kim-song-jun/matchup-sports-platform/pull/1631#discussion_r4191574074) is real: `engines.node >=22` includes 22.0–22.5, which do not have native `--experimental-strip-types`. The optional claim that host-TZ regression adds no coverage is rejected: tests must fail if local getters return, and changing `process.env.TZ` in a worker does not guarantee V8 switched on Windows.
- New harness reads the actual date-utils/overview TS files and uses installed TypeScript `transpileModule` with ESNext/ES2022 to produce ordinary ESM data modules. Fresh Node children use only stable `--input-type=module`/`--eval`, set TZ before startup, and assert actual resolved zone + native offset. No formatter is mocked or copied into the harness.
- New regression pins all three existing local formatter outputs in UTC/LA/Seoul alongside KST tournament/overview values. Current Phase B code must fail local-short UTC/LA expectations. Added `admin/tournaments/page.test.tsx` renders actual page + actual shared table columns; hooks provide synthetic ISO fixtures and the local Date getter clock seam uses UTC values so caller regression is caught on KST workstations too. The actual TZ claim is covered by the child test, not that clock seam.
- RED-ready command: `pnpm --filter v1_web exec vitest run src/lib/date-utils.test.ts src/app/admin/tournaments/page.test.tsx --maxWorkers=1 --no-file-parallelism -t 'MD-QA #27'`. No Phase C product modification before root RED.
- Root actual RED: `27-review-red.log` has 2 UTC/LA localFamily-short failures / 6 passes / 13 skipped. The new plain ESM harness passed real TZ/offset checks; actual page columns still passed the Phase B KST call. Product changes were made only after root confirmed this RED.
- Implemented: added `formatAdminKstDateTimeShort`, restored shared local short implementation, rewired only `admin/tournaments/page.tsx` import + schedule start/end + deadline. Changeset wording now explicitly scopes the KST fix to tournaments and preserves other admin local displays.
- GREEN-ready command: `pnpm --filter v1_web exec vitest run src/lib/date-utils.test.ts src/app/admin/tournaments/page.test.tsx src/app/admin/tournaments/[id]/overview-section.test.tsx src/app/admin/tournaments/[id]/tournament-detail-shared.test.tsx src/app/admin/league-matches/[leagueId]/videos/league-videos-client.test.tsx --maxWorkers=1 --no-file-parallelism`; root then applies required type/pattern checks once.
- Intended Phase C diff is exactly 6 files: this task, existing Changeset, date-utils.ts/test.ts, tournament list page.tsx/new page.test.tsx. `git diff --check` has no errors (Git CRLF normalization warnings only); touched debt markers 0. Date utility 206 pure LOC and page 225 are warning band; no next expansion planned, and page's size is unchanged. New tests are 154/56 pure LOC.
- Root retains tests/lint/Git/PR/browser/tracker ownership. Live API/DB/serving-SHA limitations above remain.

## Root Phase C Validation — 2026-10-06
- Final dedicated KST/local-family fix: 5 related files / 64 tests PASS, serial maxWorkers=1; log 27-review-green.log. Actual local-family RED: UTC/LA 2 failures before this fix (27-review-red.log).
- Final TypeScript and v1 pattern checks PASS (27-review-type-pattern.log). No new full suite/build or local Next server.
- Independent final delta review 4/4 PASS, Critical0/Warning0; exact production/test blobs recorded in review-27-kst-scope-delta.md. Root verified the six-file scope including the new real tournament page regression, diff --check, no untracked production imports, touched markers0.
- Old native flag warnings remain historical evidence. Final subprocess transpiles actual TS with the existing TypeScript dependency, starts plain ESM under real UTC/LA/Seoul, checks native offsets and local/KST contracts. Node22.0 binary execution and live raw API/DB/alpha remain unverified.
- Phase C implementation, code regression and independent review complete. Same PR #1631 receives the followup commit; latest head/CI/Copilot/tracker cursor follows publication, and dev merge is pending.
