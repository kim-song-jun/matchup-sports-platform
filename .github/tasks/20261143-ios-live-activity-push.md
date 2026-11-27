# Task 20261143: PR-D iOS Live Activity push client
Status: Locally verified; PR/CI pending

## Scope and branch
- PR-C `7111361bb` → `codex/ios-widget-pr-d`, worktree `/private/tmp/teameet-ios-widget-pr-d`.
- PR base `codex/ios-widget-pr-c`, body first line `PR-C 머지 후 머지`. Never merge.
- iOS + related docs only. Server is owned by user in a separate PR. No Android/API/Prisma/config changes.

## Confirmed contract
- Existing activity update/end only, no push-to-start or remote-start observation.
- Widget Bearer auth, PUT/DELETE `/api/v1/widget/live-activity-token`, JSON `{gameId, pushToken}`. Token kind `activity` internally; no unagreed extra DTO fields.
- Server widget live and push content-state use the same shape. Optional `endedAt` milliseconds. App must decode absent/null compatibly.
- Prefer server/push endedAt, persist per game ID. Missing timestamp only → first app observation. Never extend existing deadline; expired → immediate. APNs dismissal-date (seconds) is server responsibility, endedAt+15min.
- Token rotation/relaunch reconciliation; revoke on close/end/logout/account switch, retry/report failures, no token logging or Activity content credentials.

## Phases / Acceptance
- [x] Restore PR-C and confirm server ownership/remote-start exclusion/deadline contract.
- [x] Decode wire content-state and API endedAt, preserve old cache/model compatibility.
- [x] Request per-activity push token and register/revoke with session fencing and retry.
- [x] Narrow tests: wire JSON/null/date/logo/expired and persistent deadline + real URLRequest contract/failure.
- [x] Alpha app+extension and Production unsigned build; sample/system verification separate from alpha/APNs.
- [ ] Korean ready PR, fixed base + body merge order, blockers documented. No review polling per user.

## Ambiguity / dependency log
- Server API is a draft, server PR not yet linked. No live contract or APNs delivery verification possible before it exists.
- Server should bind registrations to widget-token revocation and match DELETE pushToken to avoid deleting a rotated token. APNs gateway selection and future tokenKind DTO are server-side confirmation items.
- No inject.sh/auth path supplied; no Apple signing on this host. Simulator/local payload evidence must not be called real APNs success.

## Progress Snapshot
Read handoff end to end. Read applicable .codex API/db rules during scope discovery; no server edits after user clarified ownership. Working tree was clean when branching from PR-C. Implementing client against explicit draft contract.

## Verification snapshot
- Alpha selected24 unit tests PASS (push6 / lifecycle5 / widget10 / followup3), app+extension compiled unsigned. Production app+extension unsigned build PASS.
- Default UI harness12/12 explicitly skipped, failures0. The inherited native synthetic sample is now opt-in to respect the existing CI skip gate; skip is not APNs/UI delivery success.
- Initial Swift6 compiler private CodingKeys cross-file linkage crash fixed by colocating the Period decoder with its model; test request capture mutable-sendable error fixed using an immutable snapshot. Final runs PASS.
- No layout changes/new gallery; PR-C system synthetic screenshots remain reference only. No actual alpha/API/APNs call. No server files changed.
- User requested no review check; do not request/wait for review during PR-D wrap-up.
