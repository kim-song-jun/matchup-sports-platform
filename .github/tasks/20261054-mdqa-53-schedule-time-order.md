# Task 20261054: #53 팀 일정 저장의 종료 시각 순서 검증

Status: In Progress
**Owner**: root → scoped implementation workers
**Created**: 2026-10-08

## Context
Report https://teameet.jmandu.kr/issues/53/. QA E2E/1188×760 restored existing same-day10:00–09:00 schedule after reload/edit; restored11:00 by reporter. Root claim19:06 Kim/progress saved. API/DB internal cause originally unverified, source now dates write unchecked.

## Goal
Fix the real report with the smallest v1 change, genuine RED/GREEN, exact-head independent review and base-dev PR; alpha result is separate.

## Original Conditions
- [x] Read full live report and comments; no duplicate task/worktree/open PR or active owner.
- [x] Root UI claim Kim Seongjun / 확인 중 visibly saved; no reporter restriction.
- [ ] Create and PATCH reject endAt <= startAt after effective supplied+persisted dates are combined, including single-field PATCH and equal timestamp. Valid next-day end remains allowed. Active account/manageable team/state/version/idempotency precedence preserved. Invalid input writes no schedule/notices/idempotency result. Actual edit UI blocks reversed/equal end and exposes existing field/error pattern without success navigation. #54 capacity behavior untouched.
- [ ] Same original report progress comment, accurate merge/alpha state.
- [ ] No irreversible Done/delete, main/dev direct merge, Slack or owner removal.

## User Scenarios
Existing authenticated team manager edits the same QA schedule and reloads the saved entity. Create and PATCH reject endAt <= startAt after effective supplied+persisted dates are combined, including single-field PATCH and equal timestamp. Valid next-day end remains allowed. Active account/manageable team/state/version/idempotency precedence preserved. Invalid input writes no schedule/notices/idempotency result. Actual edit UI blocks reversed/equal end and exposes existing field/error pattern without success navigation. #54 capacity behavior untouched.

## Test Scenarios
Actual source-unchanged service create/partial PATCH RED and real consumer HTTP noPATCH/noNAV RED; valid next-day, permission/version/idempotency no-write behavior; GREEN narrow serial singleworker. DB integration only if existing service available; no destructive seed or secret reads.
- Preserve existing fixtures, failure semantics, no tests that mirror implementation.
- Root committed-tree focused test/type/pattern after worker singleworker proof; preflight before heavy checks.

## Parallel Work Breakdown
Backend owner: apps/v1_api/src/team-schedules/team-schedules.service.ts and dedicated service date-order spec, docs/api/domains/team-schedules.md error contract. Frontend owner: team-schedules-client.tsx date guard and dedicated genuine edit consumer spec. No capacity DTO/types, shared hooks/provider, existing return spec, schema/migrations.
- Implementation async independent files; shared contract owner single, root integration/Git/publication.
- Root serial validation and exact pathspec commit, independent review before publish.
- Peer dev-pr-5/user merge; actual served SHA alpha separately.

## Acceptance Criteria
- [ ] Report contract and valid/error boundaries hold.
- [ ] Narrow genuine RED → GREEN; intended/committed diff and tracked imports checked.
- [ ] Required docs/fixture/contracts/Changeset aligned.
- [ ] Critical=0 Warning=0 exact current HEAD review.
- [ ] PR base dev, latest review/CI audited, original report comment save verified.
- [ ] Alpha actual evidence after merge; no premature PASS.

## Tech Debt Resolved
Only defect and directly related contract/test drift; no unrelated markers or redesign.

## Security Notes
Existing account/member/manage/state/version/idempotency guards remain. No .env/secret read, destructive seeds, DB bypass, extra permissions.

## Risks & Dependencies
Latest origin/dev base016847e; root fetch before worktree done. #50 shared hooks and #53/#54 sibling scopes kept separate. Source and payload prove actual cause; alpha original serving SHA not verified. #54 QA fixture1 persists pending actual fix and authorized cleanup. Pending merges/alpha external.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-08 | root | Existing report vs new task | Live original full detail plus actual Git/PR/task evidence, dedicated bug worktree, no duplicate. |

## Progress Snapshot
- Root run0550 continues, report read+claim19:06 saved screenshot/text under main tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550.
- worktree C:/Users/kinso/.codex/worktrees/mdqa-53-schedule-time-order/matchup-sports-platform, branch fix/mdqa-53-schedule-time-order, origin/dev016847e.
- Implementation/RED/committed review/PR/comment/alpha pending; no worker Git writes.

### BackendSnapshot — #53 effective date order

- Backend implementation complete in `apps/v1_api/src/team-schedules/team-schedules.service.ts`, dedicated `team-schedules.date-order.service.spec.ts`, and `docs/api/domains/team-schedules.md` date/error section. No DTO/capacity/schema/migration changes or Git mutations.
- Cause confirmed by the actual service: create and PATCH previously accepted reversed/equal effective dates. PATCH had no validation after combining supplied and persisted dates. A shared Date-epoch guard now rejects non-increasing/unparseable ranges with `422 SCHEDULE_INVALID_TIME_RANGE` before schedule, attendance, notice or idempotency-result writes; parsed effective dates are reused in Prisma/parameterized SQL. Existing account/create-MATCH/replay/manage/version/state precedence is preserved.
- Source-unchanged RED: **10 failed / 15 passed / 25 total**, `Received promise resolved instead of rejected` for the invalid create/PATCH cases. Fixed-source GREEN: **25 passed / 25 total**, same dedicated spec, unit project, serial `--runInBand`, 12.652 seconds. Bound SQL parameters prove valid partial/omitted/overnight dates; rejected commands assert no data mutation calls. Public service methods and primary management/account checks are exercised, with no private gate bypass.
- Exact command from `apps/v1_api`: `& 'C:/Users/kinso/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/jest/bin/jest.js --selectProjects unit --runInBand --testMatch '**/team-schedules.date-order.service.spec.ts' --runTestsByPath 'C:/Users/kinso/.codex/worktrees/mdqa-53-schedule-time-order/matchup-sports-platform/apps/v1_api/src/team-schedules/team-schedules.date-order.service.spec.ts'`.
- Harness note: the first relative-path invocation exited `No tests found`, not RED. `--showConfig` exposed a mixed-separator Windows absolute glob containing `kinso\\.codex`; the exact testMatch override plus absolute test path restored discovery without changing Jest configuration. Existing Jest TypeScript-config ES-module warning did not prevent either real run.
- Preflight: CPU 48%, 12 logical cores, 10,612 MiB free of 32,677 MiB; 78 Node / 7 browser processes; no Docker or local 8121/5432 listeners. `DATABASE_URL` presence false; its value and `.env*` were not read. No DB integration run; CI/root own committed-tree checks, type/surface validation and alpha verification.
- No touched-path TODO/FIXME/HACK/XXX markers found. New spec is 233 lines / 182 nonblank noncomment lines. No new dependencies, debug artifacts, background helpers, destructive operations or permission bypass. Jest processes exited normally after the recorded runs; serial slot released to root.

### FrontendSnapshot — #53 actual form contract

- Shared create/edit submit now blocks endAt <= startAt before mutations through the existing error banner. Only four production lines were added; valid next-day timestamps, version/idempotency and capacity handling remain unchanged.
- Source-unchanged real form/hooks/HTTP RED: 4 failed / 5 passed (9), 19:24:14 KST, 9.18 s. Same focused spec GREEN: 9/9, 19:25:45, 4.69 s, one worker. Cases cover reversed/equal create/edit no HTTP write or navigation, dirty draft retention, valid next-day wire payload, VERSION_CONFLICT/refetch preserving dirty draft and member permission gates.
- Evidence: own worktree `tmp/qa/mdqa-53-frontend/red.txt` and `green.txt`. Command from apps/v1_web: bundled Node `node_modules/vitest/vitest.mjs run src/components/team-schedules/team-schedules-date-order.test.tsx --maxWorkers=1 --fileParallelism=false`.
- Preflight RED CPU68/free10.24GiB/Node79/browser7; GREEN CPU56/free10.29GiB/Node78/browser7; Docker off, alpha health200. Test process exited and fixtures, queries, environment mocks and HTTP handlers cleaned up. Slot released to root.
- Root intended scope: backend service/spec, frontend form/spec, API domain documentation, this canonical task and Changeset (7 paths). Committed-tree checks, independent exact-head review, publication and alpha after dev merge remain pending.
