# Task 20261059: Store demo withdrawal session termination

Status: In Progress
**Owner**: Root orchestration; GPT-6 Luna implementation; GPT-6 Sol independent review
**Created**: 2026-10-08

## Context
Actual iOS Simulator and Android Emulator production recordings showed a successful withdrawal request followed by “로그인 상태를 확인하지 못했어요”. The exact demo account is withdrawal_pending. Existing logout clears the server cookie and client identity/cache; withdrawal does not apply the same termination contract.

## Goal
After a successful withdrawal request, terminate the session and show a usable guest login screen on both native shells; retain the account's 30-day withdrawal state and authorization gates.

## Original Conditions
- [x] Fix only the relevant v1 API/web session termination behavior.
- [ ] Independently review and verify the change, then deploy the scoped fix to alpha and production.
- [ ] Restore only the owner-approved store demo account from withdrawal_pending for replay, then record its withdrawal again. Its exact identifier is kept in repository-external private STATUS.md.
- [ ] Update Apple supplemental draft with truthful corrected evidence and submit the response/final review request.
- [ ] Keep Google review in progress unchanged; report actual links and state.

## User Scenarios
An authenticated ordinary user confirms account withdrawal. The request succeeds, session cookies and client identity are removed, live sockets stop, and the login screen remains usable after reload. The admin still sees withdrawal_pending. Failed withdrawal keeps the current session and exposes the error.

## Test Scenarios
- [x] API success expires the session cookie through the actual HTTP route/interceptor pipeline.
- [x] API failure does not clear a valid session cookie.
- [x] Frontend success removes identity-bound cached data and session hints, disconnects the socket, and replaces the document with /login.
- [x] Frontend failure leaves the account/session intact and shows the real failure.
- [x] Actual RequireAuth observer does not refetch the disabled account after successful withdrawal.
- [x] Successful cleanup survives route unmount while the real withdrawal response is pending.
- [x] Success unsubscribes the browser device push subscription; rejection preserves it and cleanup continues after a reported unsubscribe failure.
- [x] Stalled browser cleanup cannot delay identity removal or navigation beyond 1.5 seconds; the withdrawal action remains locked.
- [x] Storage cleanup failure cannot convert a successful server withdrawal into a mutation error or prevent login navigation.
- [x] The actual login gate still shows its guest form after an expired cookie when persistent storage cleanup throws.
- [ ] Real alpha and native production before/after UI, network, and admin state evidence.
- No schema, DTO, fixture, or retention-policy change is planned.

## Parallel Work Breakdown
- API worker owns `apps/v1_api/src/profile/profile.controller.ts`, relevant profile HTTP tests, and canonical `docs/api/domains/users.md`.
- Web worker owns `apps/v1_web/src/components/my/my-api-clients.tsx`, its withdrawal test, only `useV1WithdrawalRequest` in `use-v1-api.ts`, the withdrawal-only server-row-already-removed option in `use-v1-push-registration.ts`, and unauthenticated-session cleanup in `components/auth/session-entry-gate.tsx` with its existing test; other callers retain their behavior.
- Root owns this task, Changeset, process tracking, git/CI/deployment, exact-account restoration, native recordings, store submission, and local STATUS.md.
- Sol reviewer is read-only and independently verifies the final diff and evidence. Workers must not commit, push, deploy, mutate remote data, or touch one another's files.

## Acceptance Criteria
- [x] Both success and rejection contracts are proven by meaningful narrow tests.
- [x] Critical review findings = 0 on the final revision; no new hidden fallback or dead code. GPT-6 Sol final9-file source verdict C0/W0; tests and CI are separate evidence.
- [ ] Exact shipped commit and healthy service are verified before account restoration.
- [ ] Both native platforms show usable login after withdrawal; no credential/OTP disclosure in uploaded media.
- [ ] Apple final reply/submission receipt is observed, or an explicit external blocker is recorded without claiming completion.
- [ ] Owned processes/task space are cleaned up with receipts.

## Tech Debt Resolved
Withdrawal now follows the established session/socket/cache termination path; unnecessary post-withdrawal authenticated query invalidations were removed. No unrelated hook change was copied.

## Security Notes
Cookie expiration must run only after successful withdrawal. Keep active-admin, active-match, team-authority, and pending-account restrictions. No password, OTP, .env, signing key, or session token may enter logs or store evidence.

## Risks & Dependencies
Production CI/deployment gates; concurrent dev changes must not be silently promoted outside this fix. The user chose simulators/emulators; physical-device evidence remains unavailable and must be disclosed. Existing Apple reviewer credentials must remain unchanged and must not be read or printed.

## Ambiguity Log
| Date | Question | Resolution |
| --- | --- | --- |
| 2026-10-08 | Code/deploy/account restoration previously outside store-only scope | User explicitly approved A, including this fix's dev-to-main promotion and exact-account replay. General store submission approval remains valid. |
| 2026-10-08 | Shared working tree branch/worktree restrictions | Root stays on existing dev checkout, uses explicit pathspecs, and preserves concurrent changes. |

## Progress Snapshot
- Approved A; initial listing-media folder opened at `/Users/sungjun/Dev/projects/teameet-videos/app-store-v2/deliver`.
- Existing Apple supplemental draft: 14 attachments, 3810-character response and 3757-character Notes; no final reply/resubmission yet.
- Google publishing overview remains under review; no new rejection observed.
- Initial eight-file fix committed as `72c991a4458c27113c04ec15d5838d120f8e98f9`; PR #1688 passed exact-head Gates/API/Web and merged to dev at `c1fbb55d3d12d85fc56e32872b51f6d85ce374af`. Shared dev was fast-forwarded cleanly without branch switching.
- Exit proof: fresh exact-commit CI + alpha/production release headers, narrow regression results, native post-withdrawal login and admin pending state, redaction review, actual Apple final receipt, and owned-process cleanup.
- Root observed actual RED for missing API cookie expiration and missing document navigation; harness errors were fixed before counting RED. API GREEN: 14/14 profile controller tests.
- Sol identified an active-auth query invalidation race. Real RequireAuth test observed 3 auth requests instead of 1; after scoped hook removal, all four withdrawal tests passed (initial auth count 1, no post-withdrawal refetch).
- A fresh dev dependency link was restored using frozen/offline pnpm install without manifest or lock changes. API typecheck initially found stale generated Prisma types; existing schema fields were absent from the generated client. Prisma generate completed without any schema/database change; API lint/typecheck + surface check then passed.
- Web test selectors were corrected to the supported anchored accessible-name matcher. Web lint/typecheck + pattern checks passed. Independent final source review is C0/W0; runtime verification remains pending.
- Scoped production PR #1689 excludes unrelated dev changes. Its version metadata was corrected to compute1.3.7 above the separately deployed baseline1.3.6. New head CI is running; no production merge/deployment of this fix yet.
- External review then found per-call mutation cleanup may be skipped on route unmount, browser push cleanup is incomplete, and the public task contained an operational account identifier. Root removed the identifier from tracked task content; worker adds delayed-response and browser PushManager regression coverage before fixing the lifecycle/push edges. Exact account facts remain outside Git.
- Follow-up RED: three new real regressions failed while the original four tests passed. After lifecycle/push correction, all seven passed. A focused two-case rerun then passed with the actual inactive-account403 guard fixture. Test response typing was corrected without unsafe casts. Final independent source/doc/Changeset review is C0/W0. Current task content is redacted; earlier Git history was not rewritten.
- PR #1691 then received actual P1/P2 findings: awaited push cleanup could stall session teardown and duplicate rejection telemetry. It remains unmerged while these are corrected. The production PR #1689 stays draft.
- Third correction RED proved redundant server Push DELETE, retained identity during stalled browser cleanup, and duplicate failure telemetry. GREEN selected 13 cases: eight real withdrawal regressions plus five existing unsubscribe cases. Sol identified a separate localStorage-removal failure edge; its focused RED and guarded correction are pending. Final typecheck and exact-head CI must be renewed after that correction.
- Final guarded withdrawal revision passed14 selected cases (nine withdrawal and five existing unsubscribe;15 unrelated tests skipped) without React act warnings. The storage fixture now intercepts the actual Storage prototype and proves a throw; its earlier ineffective instance-spy failure is not storage-behavior RED evidence. Sol then found the same cleanup exception could propagate in the real login gate after401. That narrow guest-entry edge is being corrected before commit; no unrelated authentication flow or native change is planned.
- Actual guest-entry RED: real MSW401 plus persistent Storage removal failure caused a SecurityError and React unmounted the login child. After the narrow gate guard, four gate cases passed (the new real-hook regression and three existing401/transient/retry contracts). MSW interception is closed at test-suite teardown. No native or unrelated authentication source was changed. Final web lint/typecheck and exact-head CI remain required.
- Final source review C0/W0. Web typecheck found test-only implicit-this and MSW request-body types; explicit Storage/ClientErrorPayload annotations corrected them without casts or production-source changes. The single lint/typecheck rerun passed, including v1 pattern checks. No new debt marker was added. New exact-head CI and runtime deployment/replay remain pending.
