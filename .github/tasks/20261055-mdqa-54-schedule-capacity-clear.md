# Task 20261055: #54 팀 일정 선택 정원의 명시적 해제 저장

Status: In Progress
**Owner**: root → scoped implementation workers
**Created**: 2026-10-08

## Context
Report https://teameet.jmandu.kr/issues/54/. QA E2E/1188×760 UI capacity1→clear→save/reload/edit restores1; original empty fixture could not be restored and1 remains. No bypass/delete was attempted; date restored10:00–11:00. Root claim19:06 Kim/progress saved. Existing service uses undefined keep/null clear and uncapped promotion; determine actual serializer omission.

## Goal
Fix the real report with the smallest v1 change, genuine RED/GREEN, exact-head independent review and base-dev PR; alpha result is separate.

## Original Conditions
- [x] Read full live report and comments; no duplicate task/worktree/open PR or active owner.
- [x] Root UI claim Kim Seongjun / 확인 중 visibly saved; no reporter restriction.
- [ ] Existing edit capacity1→empty sends explicit capacity:null; full refresh/reload reads null and remains empty. Omitted capacity PATCH leaves old value, nonempty positive integer remains numeric; invalid negative/zero/fraction rejected by existing validation. Existing service waitlist promotion/null capacity contract preserved, API DTO+frontendtype consistent. Create omitted capacity remains optional; no silent success or fixture fake state.
- [ ] Same original report progress comment, accurate merge/alpha state.
- [ ] No irreversible Done/delete, main/dev direct merge, Slack or owner removal.

## User Scenarios
Existing authenticated team manager edits the same QA schedule and reloads the saved entity. Existing edit capacity1→empty sends explicit capacity:null; full refresh/reload reads null and remains empty. Omitted capacity PATCH leaves old value, nonempty positive integer remains numeric; invalid negative/zero/fraction rejected by existing validation. Existing service waitlist promotion/null capacity contract preserved, API DTO+frontendtype consistent. Create omitted capacity remains optional; no silent success or fixture fake state.

## Test Scenarios
Actual source-unchanged editor populated1→clear/save→GEThydrate RED; positive/omitted/explicitnull DTO plainToInstance+ValidationPipe contract; error no success navigation; smallest existing service null behavior read only proof. No DB/alpha writes by worker.
- Preserve existing fixtures, failure semantics, no tests that mirror implementation.
- Root committed-tree focused test/type/pattern after worker singleworker proof; preflight before heavy checks.

## Parallel Work Breakdown
Single contract owner: apps/v1_api/src/team-schedules/dto/team-schedule.dto.ts UpdateScheduleDto capacity only and dedicated DTO clear validation spec; apps/v1_web/src/types/api.ts V1UpdateScheduleDto.capacity only; team-schedules-client.tsx capacity PATCH mapping only and dedicated genuine clear consumer spec; own task/docs update only capacity section. Forbidden service date validation (#53), hooks/provider/MSW global/schema/migrations/other product/return spec.
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
- worktree C:/Users/kinso/.codex/worktrees/mdqa-54-schedule-capacity-clear/matchup-sports-platform, branch fix/mdqa-54-schedule-capacity-clear, origin/dev016847e.
- Implementation/RED/committed review/PR/comment/alpha pending; no worker Git writes.

### Capacity clear contract — root integration

- Actual cause: blank EDIT capacity was serialized as undefined, so JSON omitted it and the service correctly retained the previous number. Existing service explicit null already clears the limit and existing MSW follows that contract; no service/schema/handler change was needed.
- EDIT serializer now sends `capacityNum ?? null`; CREATE still omits blank capacity. Frontend update type and API UpdateScheduleDto now accept number|null, with unchanged decorators and Create contracts. Root removed the obsolete `as never` from the existing integration capacity-null fixture only. API capacity contract documentation and Changeset synchronized.
- Genuine source-unchanged form/hooks/HTTP RED: 1 failed / 5 passed, 6 total, 4.42 s; corrected input fixture explicitly checks numeric12 before serialization. Initial red.txt also had a userEvent number-input remount failure and is preserved as a harness issue, not a second product RED. Official evidence `tmp/qa/mdqa-54/red-corrected.txt`.
- Fixed-source same spec GREEN6/6,4.71s, one worker, `tmp/qa/mdqa-54/green.txt`. Clear asserts actual PATCH null, fresh QueryClient GET null and re-edit blank. Numeric1/12, title-only omitted capacity retains number, PATCH503 no navigation, and CREATE blank omission also pass. Existing shared TextField React action warning remains visible; no warning suppression or shared UI edits.
- Preflight GREEN CPU54/12cores, free10477MiB/32677MiB, pagefile472MiB, Node78/browser7, Docker absent and no3013/8121 listeners. Owned process exited; server/query/env fixtures cleaned up, slot returned.
- New11-case real class-transformer/class-validator DTO spec is prepared for root committed execution. Runtime null acceptance was already correct; this test is contract coverage, not claimed RED. No available database integration runtime; existing SQL-null/waitlist integration case retained and typed without assertion.
- Intended scope9 paths: EDIT form/spec, frontend type, API updateDTO/spec, API domain doc, exact integration fixture, this task and Changeset. Committed tests/types/surface/pattern, independent exact-head review, PR/base dev and saved original report comment pending. Alpha after dev merge is pending; report attachments and status remain.

### Root committed publication gate

- Latest dev f662fa2524523a3a9a7563d3917e8cf110e407ea safely merged into the feature branch; independent schedule focus changes retained. API DTO contract11/11 and real form HTTP6/6 passed on committed210a7dac3c078c66fc9202b7d76767b7fe02c445. Both TypeScript checks, API surface and Web pattern gates PASS. Receipt: root run0550/report54-committed-final-result.json; no available DB integration runtime and no alpha after claim.
- Independent full9/9 exact210a7 review Critical0 Warning0 OK/FindingsNone. Reviewer corrected a new inline fixture invalid-capacity response to400 VALIDATION_ERROR before this gate. Diff check, own9-path scope and touched markers/imports verified; no foreign staging or root dev/main merge.
- This later task-only checkpoint preserves the validated code/spec blobs; final checkpoint HEAD read-only review and publication follow. External Copilot/CI, dev merge and exact served-SHA alpha are separately pending. UI prototype was not executed on a local Next server.
