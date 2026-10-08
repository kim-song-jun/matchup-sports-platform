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
- [ ] Restore only demo account `8aede431-cc5d-4176-a8cf-e0153fe83a6b` from withdrawal_pending for replay, then record its withdrawal again.
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
- [ ] Real alpha and native production before/after UI, network, and admin state evidence.
- No schema, DTO, fixture, or retention-policy change is planned.

## Parallel Work Breakdown
- API worker owns `apps/v1_api/src/profile/profile.controller.ts`, relevant profile HTTP tests, and canonical `docs/api/domains/users.md`.
- Web worker owns `apps/v1_web/src/components/my/my-api-clients.tsx`, its withdrawal test, and only `useV1WithdrawalRequest` in `use-v1-api.ts`; independent review found the hook's post-success invalidation race and root approved this scoped expansion.
- Root owns this task, Changeset, process tracking, git/CI/deployment, exact-account restoration, native recordings, store submission, and local STATUS.md.
- Sol reviewer is read-only and independently verifies the final diff and evidence. Workers must not commit, push, deploy, mutate remote data, or touch one another's files.

## Acceptance Criteria
- [x] Both success and rejection contracts are proven by meaningful narrow tests.
- [x] Critical review findings = 0; no new hidden fallback or dead code. Independent GPT-6 Sol source review: C0/W0.
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
- Latest local dev fast-forwarded cleanly to `b84a2288cab0449c173fee9ef29fe2d740f86d4e`; root made no code change yet.
- Exit proof: fresh exact-commit CI + alpha/production release headers, narrow regression results, native post-withdrawal login and admin pending state, redaction review, actual Apple final receipt, and owned-process cleanup.
- Root observed actual RED for missing API cookie expiration and missing document navigation; harness errors were fixed before counting RED. API GREEN: 14/14 profile controller tests.
- Sol identified an active-auth query invalidation race. Real RequireAuth test observed 3 auth requests instead of 1; after scoped hook removal, all four withdrawal tests passed (initial auth count 1, no post-withdrawal refetch).
- A fresh dev dependency link was restored using frozen/offline pnpm install without manifest or lock changes. API typecheck initially found stale generated Prisma types; existing schema fields were absent from the generated client. Prisma generate completed without any schema/database change; API lint/typecheck + surface check then passed.
- Web test selectors were corrected to the supported anchored accessible-name matcher. Web lint/typecheck + pattern checks passed. Independent final source review is C0/W0; runtime verification remains pending.
