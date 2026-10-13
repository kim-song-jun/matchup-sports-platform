# Task 181 — 미충족 매치 보류와 주최자 후속 조치

Status: Completed — 2026-10-13 team policy follow-up deployed to dev/Alpha and live QA passed
Scope: v1 API/Web, migration, notification, API docs, scenarios

## Acceptance Criteria
- 모집 마감 또는 시작 시각에 개인 확정 인원 미달은 보류, 팀 상대팀 미확정은 마감(2026-10-13 팀 정책 개정). 신청 대기는 확정 인원으로 세지 않는다.
- 개인 확정 참가자가 주최자뿐이면 진행 불가. 정원 미달이지만 다른 확정 참가자가 있으면 주최자가 진행 확인 가능. 응답 없으면 보류 유지.
- 보류 매치를 미래 일정으로 수정하고 재모집 가능. 참가 이력 없는 매치는 soft delete, 이력 있으면 취소 및 알림.
- 개인 일정/장소 변경 시 기존 승인 참가자에게 재신청 안내, 승인 초기화. 진행 결정 초기화.
- 권한·동시성 검증, 실제 실패 노출, 목록/상세/내 매치 상태 일치.

## Ownership
Root agent only. 기존 shared-tree WIP 보존. 2026-10-01 사용자 dev 배포 요청으로 commit/PR/dev merge/alpha 배포 승인. main 승격 금지.

## Progress Snapshot
- 2026-09-30: 현재 recruiting + startAt 경과 = expired, update/cancel 차단 확인. 보류는 read-derived 상태로 기존 데이터에 적용, 개인 진행 선택은 nullable timestamp로 저장.

## Validation
- [x] API lifecycle focused tests
- [x] Web focused tests and typecheck (final output below)
- [x] Team policy follow-up: Alpha mobile 390 / tablet 768 / desktop 1440, console/network and cleanup (final evidence below)
- [x] Diff/debt inspection; own/new file dependencies present, unrelated WIP preserved


## Validation Evidence / Remaining Gates

- API: matches/team-matches focused suites 62 tests PASS; final follow-up strengthens persistence/deletion assertions. API tsc --noEmit PASS.
- Web: existing related match mode/view-model/client/team-client 21 tests PASS; new HTTP-backed lifecycle panel 4 tests PASS. Web final tsc and pattern checker recorded after edits.
- Initial RED: old team expired/edit-lock assertions failed with new on_hold behavior; updated expected contracts and passed. New UI error case initially used an incorrect error envelope; corrected to v1 `statusCode/code/message` and verified real server failure remains visible. WSL cold test startup needed --testTimeout=15000; mutation logic was unchanged.
- Headed browser component preview: `node scripts/qa/capture-match-on-hold-panel.mjs`, fixture props (host/no participants, host/3 of 10 confirmed, team/no opponent). 390/768/1440: 3/3 PASS, horizontal overflow 0, console/page/network errors 0. Screenshots and PID/PPID tree under `output/playwright/visual-audit/match-on-hold/`. This is **component-only**, not live route/permission/API/DB verification.
- New surface has no before baseline. Full detail/list/edit/mobile sticky-shell before/after evidence remains pending.
- Browser startup required sandbox escalation for localhost listen and /tmp-extracted libnspr4/libnss3/libasound2t64; no OS installation. Chromium and Vite closed in finally; temporary preview directory removed. Main browser PID 18032, parent Node 18009 (full tree in processes.json).
- Runtime blocker: localhost 3013/8121 unavailable; Docker reports WSL `UtilBindVsockAnyPort: socket failed 1`. No real DB integration, migration replay, or full authenticated route QA performed.
- Added `20260930150000_v1_match_proceed_confirmation` for nullable v1_matches.proceed_confirmed_at; Prisma Client generation PASS. No DB reset/seed/migration apply, commit, push, or alpha deployment performed.
- API/permission/state decisions documented in docs/api/domains/matches.md and team-matches.md; scenarios and index updated.
- Shared tree includes existing schema/types/team lineup/deploy WIP. Current branch fix/tournament-lineup-flow, not a new clean dev-based task branch. No PR-ready/committed-tree claim.

- Final follow-up: API 62/62 PASS with persisted proceed/deletion assertions; UI lifecycle 4/4 PASS includes deletion avoiding a refetch of the removed detail. Prior related UI tests 21/21 PASS. Pattern checker PASS. Final API typecheck PASS.
- Cleanup verified: owned Node 18009/Chromium 18032 no longer present; TCP 3033 not listening. No external messages or live match mutations.

- Final Web tsc --noEmit PASS (after all source edits); git diff --check PASS; touched-path debt grep found no TODO/FIXME/HACK/XXX markers. New runtime panel and migration files present; no committed-tree readiness claim.
- Temporary downloaded browser libraries removed from /tmp. Screenshots/verdict/process tree preserved in standard output directory.


## Shipping Snapshot
- 최신 origin/dev 3e38c75ef 기반 `/tmp/teameet-match-on-hold-ship`, fix/match-on-hold-lifecycle에서 관련 변경만 선별. 기존 대회/라인업/infra WIP 제외.
- 최신 dev의 hostParticipates, completion_pending, 신청 원장 중복 방지, 리그/대회 스케줄 계약과 Game → TeamMatch 잠금 순서 유지. 최신 dev 기반 검증 및 PR/배포 진행 중.

- 최신 dev에 archive/151-profile-tournament-awards.md가 있어 이전 로컬 Task151을 canonical Task181로 재번호.
- 최신 dev 기준 API 138/138, Web 관련 102/102 PASS. 양 앱 tsc PASS, API surface PASS. guest eligibility 401은 공개 상세에서 불필요한 인증 API 호출을 제거해 닫음.

- 공개 alpha 실제 상세 before 390/768/1440: 모두 종료 확인 중, overflow 0. guest eligibility 401 2건을 확인하고 조건부 query로 수정. 최신 dev component-only after 3/3 PASS, 오류/overflow 0. 이 증거는 인증 주최자의 실제 mutation을 증명하지 않음.
- PR 참조 증거: docs/screenshots/task181-match-on-hold/{alpha-before,panel}-{390,768,1440}.png. 배포 후 전체 실제 route after 추가 예정.

- 최종 API 139/139 PASS(보류 complete 우회 차단 포함). 최종 Web client/panel 34/34 PASS, 앞선 관련 102/102 PASS. 웹 타입 PASS 및 radius token 수정 후 pattern PASS. 최신 dev API surface PASS.

- 최종 후속: 실제 신고 매치와 같은 0/1 모집의 보류·진행 차단·삭제와 주최자 불참 + 확정 참가자 1명의 진행 선택을 회귀 테스트로 추가. API 141/141 PASS. 리그/대회 매치 주최팀 삭제 우회 차단. PR #1388(base dev), CI 및 Copilot 검토 진행 중.

## CI reconciliation
- 첫 CI RED: final schema binding, game-schema snapshot, personal completion integration 및 2개 Web expectation. 신규 nullable 컬럼의 현재 digest만 정확히 재바인딩하고 과거 alpha manifest digest 허용을 보존. schema binding 7/7 PASS.
- 실제 HTTP/DB 참여 이력 시나리오는 시간 fixture 후 주최자 confirm-proceed HTTP를 수행하도록 수정. 0/1 보류 조회/완료 차단/권한/soft delete 및 일정 변경·승인 초기화·이력 삭제 차단 시나리오 추가. CI 실제 Postgres 재검증 대기.
- 진행 확정 뒤 불참(no_show) 처리로 보류에 역전하지 않도록 기존 완료 흐름 보존. 참가 집계에서는 불참을 계속 제외.
- Web 가입 대기 상태는 진행중보다 우선 유지하고 보류만 공통 우선. 관리 링크 fixture는 실제 manageHref를 명시. 관련 Web 98/98 PASS; 개인 API 67/67 PASS(팀 API 74/74 이전 PASS).

- 두 번째 CI: Gates/Web 전체 PASS. API 참여 이력 한 건만 RED(철회 후 미완료 매치 후기의 SOURCE_NOT_COMPLETED 409 계약). 기존 403 기대를 실제 409 + code 검증으로 갱신. 나머지 참여/권한/삭제/일정변경 HTTP 시나리오 PASS.

## 2026-10-01 latest dev merge preparation
- PR #1388의 이전 CI는 통과했지만 최신 dev와 7개 파일에서 충돌했다. 별도 worktree에서 최신 dev의 팀매치 다음 행동 UI를 유지하고 보류 패널을 결합했다.
- 리뷰 Major 3건: 진행 확정 후 마지막 참가자 이탈 시 보류 복귀, 내용만 수정할 때 closed/진행 확정 보존, 진행 중·종료 확인 중 취소 차단을 수정했다. 팀매치 내용 수정 시 closed 보존과 내 매치 진행 건수, 영문 409 안내도 반영했다.
- 개인·팀 API 145/145, Web 관련 191/191 및 추가 영문 오류 테스트 5/5 통과. 양 앱 tsc --noEmit, v1 DB guardrails 통과. 최신 dev를 재병합했고 PR CI 재검증 대기.
- release schema binding은 병합된 Prisma schema의 Git index LF SHA-256 `bb42ef9a40757b6877989b8cd883d461a714aebbcbd4591753acf0db757aba1a`로 고정했다. M11 기존 Git blob SHA-256 `08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323`는 그대로다. Windows checkout의 CRLF 때문에 작업 파일 직접 해시는 CI의 Git blob 해시와 다르다.
- 실제 alpha 배포 후 인증 주최자 동작 및 전체 route 3폭 검증은 아직 미완료다.

## 2026-10-01 Alpha UI follow-up
- PR #1388 merged to dev. Alpha returned on_hold for zero-participant personal and zero-opponent team matches after deployment.
- Headed browser QA at 390/768/1440 found team hold notice before the match hero and mobile back action.
- Moved the existing notice immediately after the hero; added a DOM-order regression test (RED before, GREEN after).
- Related team detail suite: 112/112 PASS. Alpha before screenshots: output/playwright/visual-audit/match-on-hold/alpha-after-windows-team/.

## 2026-10-13 Team-match policy override (active follow-up)

Status: In Progress — isolated worktree `fix/team-match-status-policy`, base origin/dev `9e9a01925384`.

### Context / Goal
Production team matches show a read-derived hold despite raw recruiting. Remove team-match hold, hide cancelled matches from every user match surface, and make admin status changes effective. Personal match hold policy stays intact.

### Original Conditions / Acceptance Criteria
- [x] Team matches with an elapsed deadline or kickoff and no opponent show closed, never on_hold.
- [x] Cancelled matches remain in admin records; public lists/facets, personal team-match lists and user detail/eligibility no longer expose them, even with an explicit cancelled filter.
- [x] Admin recruiting reopens a future, unmatched match and atomically clears an elapsed deadline, with audit evidence. Past kickoff, official results and competition ownership cannot be bypassed.
- [x] Admin cancellation cascades pending requests/game/schedules, preserving history.
- [x] Public/admin-detail/my-match caches refresh after admin changes; team-match hold panel and labels are removed.
- [ ] Execute HTTP/DB integration and deployed Alpha user/admin scenarios at 390/768/1440; screenshots, console/network and cleanup required before runtime completion.

### User / Test Scenarios
Future kickoff + elapsed deadline: closed -> admin recruiting -> public recruiting. Past unmatched kickoff: closed. Cancelled entity: public and my-list absence, user detail 404, admin retained. Illegal reopen/result/competition write: conflict. Tests cover API state, query visibility and active query refetch; no destructive seed/reset.

### Parallel Work Breakdown / Ownership
Root only, sequential API -> Web -> focused tests -> docs/review. Owned: team-matches service/tests, admin status service/tests, Web team-match consumers/types/status cache hook/tests, API domain docs, this task and changeset. Forbidden: other shared-root WIP, personal-match lifecycle logic, main promotion, production mutations.

### Tech Debt / Security / Risks / Ambiguity
Remove team-only hold and stale status cache behavior. Keep admin role/service authorization and transaction audit. No schema migration is required. User explicitly chose cancellation absence in all user match surfaces, including my-list/direct detail. Existing UI controls are retained; changes implement the selected state policy rather than introduce a new design. Alpha visual verification needs deployed changes and a functioning headed browser. No merge/push/main deployment is claimed.

### Progress Snapshot
- Latest dev fetched and isolated worktree created; unrelated root WIP preserved.
- Implementation and regression verification in progress.
## 2026-10-13 Production on-hold / admin status investigation

- Scope: read-only v1 code, deployed commit, production/Alpha HTTP API and audit-log inspection. No runtime code or production data changes.
- Production release `1.8.1`, commit `9660386025e61806c8955e7238002b7fc14d6e76`; deployed TeamMatchesService.getApiStatus and AdminService.changeTeamMatchStatus checked via Git objects, rather than assuming the shared checkout matches production.
- All 8 production 경기대 케이풋살파크 10/18 team matches: admin stored status `recruiting`, public status/displayState `on_hold`, no approved opponent, deadline `2026-10-11T14:59:00.000Z` (KST 10/11 23:59). All startsAt values are still in the future. Investigation coverage: 8/8, including the extra 22:00 row not included in the user excerpt.
- Reported entity `0360197f-4732-4c1f-997e-f28e3cc9dfb5`: public startsAt `2026-10-18T01:00:00.000Z` (KST 10/18 10:00). Authenticated admin detail confirms raw `recruiting`; public detail confirms `on_hold` and lifecycle reason `NO_OPPONENT`.
- Cause: standalone raw recruiting/closed + no approved opponent + deadline OR start elapsed yields read-derived on_hold. Admin status API updates only raw status, not deadline/start. Setting recruiting cannot reopen an elapsed deadline; closed is also overridden by this display calculation. matched/cancelled/archived are not overridden by that condition; completed is rejected by the generic admin endpoint in favor of result-official workflow.
- Raw status is displayed by admin detail/list; public card mapping uses displayState/status and lifecycle panel uses API onHoldReason. Thus this discrepancy already exists in server responses and is not explained by browser stale cache.
- Production entity audit logs contain recruitment.create (2026-10-06 08:29:12Z) and recruitment.update (08:31:02Z), with no team_match.status.update record returned. Status-change log contains creation only. A successful recent status-change request for this particular entity is not proven.
- Alpha login succeeds; production entity is absent on Alpha (404). Existing Alpha QA entity `6c3748b9-d6fb-4522-a22a-50088eb6ea53` has historical closed -> recruiting and recruiting -> closed audit records. A fresh two-way state mutation was denied by automatic approval review because fixture changes were not explicitly authorized; the command never ran. No fresh mutation/restore or browser click verification is claimed.
- Operational reopening for these still-recruiting future matches requires admin recruitment edit to move deadline into the future (before kickoff), or clear the optional deadline if that is the intended recruitment policy. Not applied during investigation.
- Product follow-up: admin should expose effective public state and elapsed-deadline cause, and generic status-change success should not imply reopening when deadline/start gates still block applications. Existing status mutation invalidates admin lists/overview only, leaving public list/detail caches and admin detail outside that hook's invalidation scope. This is a separate code finding; the production response discrepancy persists without cache.
- Validation: real authenticated admin/read-only public HTTP responses, production audit records, deployed-source condition and mutation cross-check. No tests/build run for this read-only diagnosis. Browser connector remained unavailable. Credentials/tokens were held only in process memory, never written into repository evidence; sessions/process variables cleared when commands completed. A broad listing inspection was interrupted and replaced by a targeted 10/18 query.

### Follow-up implementation snapshot
- Team-only hold removed; legacy cache values normalize to closed. Cancelled entities are excluded from public filters/facets, my-team-match queries and public/manageable/application reads; user-facing lists also discard stale cancelled cache entries.
- Admin recruiting clears elapsed deadline with ISO/null audit snapshots, rejects past kickoff/confirmed/cancelled/official-result/competition bypasses, and refreshes public/admin/my/schedule cache families.
- Closed platform recruitment can use the existing admin edit route. Editing preserves its raw closed state and syncs connected SCHEDULED team schedules. State changes remain in the existing list moderation control; matching uses applicant approval.
- Cancellation stamps cancelledAt, rejects pending requests, cascades schedules/SCHEDULED games and notifies assigned-team managers. Schedule queries hide related cancelled/archived/deleted matches while keeping ordinary team schedules intact.
- Initial API run exposed outdated hold/filter expectations and audit JSON typing; fixed. Initial frontend run was blocked by shared stale dependencies. Owned dependency junctions were removed without deleting targets; offline install + Prisma generation isolated dependencies inside this worktree. No shared dependencies were changed.
- API focused suites 168/168 PASS; latest detail-only regression 36/36 PASS (108 unrelated cases skipped); admin recruitment/edit suite 16/16 PASS. Earlier Web scope 135/135 PASS, expanded Web and final types underway.
- Backend typecheck passed before the closed-editor follow-up; final editor types are being rechecked. First Web typecheck found two remaining team hold branches in my-matches; replaced with shared team status normalization without altering personal hold.
- HTTP/DB cancellation/reopening regression added to test/lists/list-facets-team-matches.integration-spec.ts, including positive calendar visibility before cancellation and absence after, raw cancelledAt/schedule persistence and admin detail retention. Not executed: Docker daemon and local PostgreSQL binaries are unavailable.
- Alpha browser connection failed with trusted Node process/kernel reset. New changes are not deployed; actual 390/768/1440 before/after and authenticated click/network QA remain pending. No production or Alpha match data mutated during this implementation. No commit/push/merge/main promotion performed.

### Final local verification (2026-10-13)
- Latest user lineup/opponent-lineup guards hide cancelled/archived/deleted matches. Record read/mutation hides cancelled/archived matches from guests/team managers; active admins with active accounts retain historical record read. Shared-record integration expectation updated to user 404; database data is retained.
- Admin status validation also reads the locked backing Game state/current official revision, preventing a raw match-status flip from bypassing a live game or official result.
- Corrected V1TeamMatch's inherited personal status/displayState types via Omit, made shared status normalization accept the fields used by my matches, fixed invalid open team-match fixtures, and updated shared JSON-LD input typing / the personal home-date test fixture.
- Final unique related unit cases: API 297/297 (team service 144, admin status 26, platform recruitment 16, cancellation notification link 1, lineup/record 110). Web 225/225 (main consumer/admin/My/cache scope 165; admin list/API hooks/home dates/JSON-LD 60). Earlier detail-only 36 cases overlap and are not double-counted.
- Final API lint (typecheck + surface check) PASS. Final Web lint (typecheck + pattern check) PASS. diff --check PASS; touched runtime paths have no new debt markers. Only the intended patch plus owned changeset/test files is required; no untracked runtime imports.
- UI/real-DB gates remain pending, not passed: isolated PostgreSQL unavailable; Docker daemon off; new changes not deployed to Alpha; browser connector fails at startup. No local Next server, fake screenshots, live test state flips, production changes, commit/push/merge or main promotion.
- Source review/diff is local to fix/team-match-status-policy in _worktrees/fix-team-match-status-policy. No PR-ready/committed-tree or full runtime-completion claim. Root shared WIP remains intact.

### Shared-root documentation safety
Automatic approval review rejected appending a resume pointer to the shared root task document, citing an unapproved cross-session side effect. That command did not run. The safe alternative is this isolated worktree's canonical task document and branch; no retry or indirect root mutation was performed. Final source/code evidence remains here.

### Dev deployment cursor (2026-10-13)
- User explicitly requested dev/Alpha deployment only. PR #1892 targets dev; owned code commit 38df9785e, latest-dev merge beb009313. No main promotion.
- GitHub CI run 38353133555 completed successfully: API 13m25s (includes actual PostgreSQL integration), Web 10m29s, Gates 5m54s. PR MERGEABLE/CLEAN, review threads 0.
- Copilot request CLI returned success repeatedly, but no review request/event/review was registered after more than 15 minutes. Direct requestReviewsByLogin with botLogins also returned an empty request list. This is NOT a clean-review result. Asked user whether to waive this unavailable Copilot gate for this dev deployment; approval pending. No merge/deployment yet.
- CUA still kernel-reset blocked. WSL headed browser failed on missing libnspr4; Windows headed Chrome worked using isolated Playwright module paths. Real read-only Alpha public list, historical team match 6c3748b9-d6fb-4522-a22a-50088eb6ea53 and authenticated admin list captured at 390/768/1440. Historical detail has on_hold/visible hold; no console/network errors, no horizontal overflow. No data mutation.
- Before images and read-only QA helper currently untracked in this owned worktree: docs/screenshots/team-match-status-policy and scripts/qa/team-match-status-alpha.cjs. After images/gallery await deployment. Owned native browser parents 39836/28796/9052/38956 and recorded Chrome child 44256 exited; no browser remains from this QA.
- Root is local/dev-clean-20261001 with unrelated WIP: do not switch or overwrite it. Local dev is clean in WSL worktree _worktrees/synced-dev-20261012; perform fetch + merge --ff-only there after the dev PR merge.
### Authorized deployment / live test progress
- User approved proceeding without unavailable Copilot and requested tests. Approval recorded in PR #1892 comment; dev merge 1841cdbcb741039cb934cf2bbaf2666e4f53e43c completed. Local dev FF synced in its existing WSL worktree, preserving root WIP.
- Later dev merges superseded two deployment candidates (their CI was cancelled, so no older runtime was deployed). Latest candidate 403e33980cbe6d207177c6c83f80ec24c30aa56b contains #1892; CI 38358454381 SUCCESS. Alpha deploy 38358454346 is building immutable images.
- User-authorized mutation QA helper creates one new labelled Alpha fixture and cancels only that fixture. Tests planned: expired deadline effective closed; actual admin UI reopening clears deadline; close/edit retains closed; unapproved matching rejected; test captain applies and sees My match before cancellation; cancellation removes public/direct/eligibility/lineup/record/My access while admin retains it; cancelled reopening rejected. No existing match state mutation planned. Both QA scripts parse with node --check.
### Final deployed / live verification (2026-10-13)
- PR #1892 merged to dev (1841cdbcb); deployed Alpha web/API both report 403e33980cbe6d207177c6c83f80ec24c30aa56b, a descendant containing this change. CI 38358454381 and Deploy Alpha 38358454346 SUCCESS. Both public web and API health HTTP 200. No main promotion or production data mutation.
- Existing historical fixture 6c3748b9-d6fb-4522-a22a-50088eb6ea53: before UI on_hold/보류, after API closed/UI 신청 마감. Existing cancelled fixture admin HTTP 200/public HTTP 404. Public list/detail and authenticated admin captured at 390/768/1440; zero browser/related API errors and horizontal overflow.
- Actual headed admin UI and test-captain flow: 25/25 contract checks PASS. New fixture deadline elapsed -> closed; admin UI recruiting clears deadline -> public recruiting; unapproved matching 409; admin UI closed -> closed editor hydrates exact entity -> PATCH persists description without reopening; recruit -> test-captain application -> My list/UI visible; cancel -> admin retained, user detail/eligibility/lineup/record 404, explicit cancelled public filter empty, My list/UI absent, direct browser URL is 404/not-found; cancelled reopen 409.
- Standalone cancellation calendar absence and underlying schedule cancellation are proved by CI PostgreSQL HTTP/DB regression; the live Alpha fixture used a pending application, without claiming an approved-team calendar scenario.
- Mutation harness initially failed before creating a fixture because login hydration was not proved. Added stateful password-toggle hydration check. First lifecycle run passed through user 404 checks but used invalid public q instead of query; corrected harness, retained failed-attempt evidence, reran with another owned fixture. No product-code change was needed. Final pass is recorded separately; earlier partial checks are not double-counted.
- Created only two labelled Alpha QA fixtures: cb32da5e-f2b9-42aa-aa12-ad4346e8f6e3 and 82810c31-01c6-451c-8a33-74e969bd5cc0. Both cleanup cancellation HTTP 201; users cannot access them. Admin records remain intentionally, including the rejected test applications/audit trail. Existing match states untouched.
- Visual verdict PASS for 390/768/1440: public list/detail, admin list, closed edit, My before/after cancellation, cancelled detail. Actual screenshots inspected; hold-panel removal leaves balanced title/body spacing, controls readable and available; no horizontal overflow. Gallery uses immutable evidence commit URLs in the merged PR.
- Owned headed browser parent/Chrome pairs: 17832/44440, 30136/35416, 26476/45188, 45828/36688, 42940/42224 all exited after browser.close; process checks found no survivors. Credentials only process environment, cleared after each command; no storage state or tokens saved. No local Next server.
- Runtime source is the merged/CI-tested tree. Post-deployment screenshots, QA helpers and final cursor are evidence-only on the original feature branch; they do not trigger another runtime deployment. Both helpers pass node --check; diff --check PASS. Shared root WIP preserved; local dev FF sync uses its existing WSL worktree.
