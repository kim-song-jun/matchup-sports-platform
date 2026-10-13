# Native required update implementation plan

Status: In Progress
Created: 2026-10-13
Owner: root; Android/iOS implementation GPT-6 Luna; independent review GPT-6 Sol

## Context
The user selected B: every older app must update once a newer version is actually available from its store. Current native shells do not expose their version to the web. The web release watcher refreshes web assets only. Existing Android 0.1.2(3) and iOS 0.1.5(9) submissions remain untouched.

## Goal
Detect store-available updates on app launch/foreground and block the native web UI with a store link until updated; never offer a dismiss/later action.

## Original Conditions
- [x] User selected policy B on 2026-10-13; the prior A/C choices are superseded.
- [ ] Android and iOS return installed version/build and store availability to the trusted web origin.
- [ ] Newer available version requires update without a later option.
- [ ] Pending review/unavailable, Alpha and current/newer versions are not blocked.
- [ ] Existing store submissions, account data, Kakao configuration and unrelated dev changes remain untouched.

## Architecture and interface
Use the existing native request/result bridge. The platform supplies release availability (Google Play AppUpdateManager on Android, Apple public lookup for the user's supported Korean storefront on iOS), avoiding a manually maintained web release floor. This implements the approved availability guard without inventing a published version from a CI build number.

Request: `window.TeameetNative.postMessage(JSON.stringify({type:'check-app-update',requestId}))`.
Capability: `supports` contains `check-app-update`. Android capability installation dispatches `teameet:native-capabilities-ready` for old WebViews that install it after document load.
Response CustomEvent: `teameet:native-app-update-result` with detail:
`{requestId,platform:'android'|'ios',channel:'production'|'alpha',version:string,build:string,status:'update-required'|'up-to-date'|'unavailable',availableVersion?:string,availableBuild?:number,error?:string}`.
Only `update-required` from a production shell can block. Android compares Play's available version code against installed code. iOS validates trackId/bundleId/version/minimumOsVersion and compares numeric version components. Store URLs are fixed web constants; replies never supply an arbitrary navigation URL.
Failed checks do not assert up-to-date. Once a required result is known, a later transient error does not release the block. A successful up-to-date response can clear it. Checks run once on mount and on foreground/focus with single-flight throttling, timeouts and listener cleanup. Alpha returns unavailable and is never forced to a production store.

## User Scenarios
1. Old production app starts, store confirms a newer eligible release: show a full-screen accessible update dialog; only update/store and retry actions exist.
2. User returns without updating: the gate remains and checks again; ordinary app content stays inert.
3. Latest/pre-release app or normal browser: no gate. Missing capability in legacy apps is explicitly unsupported, not reported as current.
4. Store/network check fails: diagnostic error, no newly invented block; a previously confirmed required update remains required.

## Test Scenarios / Review Focus
- [ ] Request correlation, malformed reply, wrong platform/channel and unsupported old bridge.
- [ ] Android Play availability/code comparison and failure states.
- [ ] iOS numeric versions (0.1.10 > 0.1.9), malformed versions, wrong bundle/track, unavailable storefront and OS incompatibility.
- [ ] Web required gate/no dismiss, fixed store link, background/focus, retained gate after failure, listener/timer cleanup.
- [ ] Native compile/CI and deployed Alpha visual evidence; production store upgrade remains a separate distribution test.

## Parallel Work Breakdown
- Android owner: `apps/v1_android` only. Add Play update dependency, bridge capability/query/result, focused contract tests, version 0.1.3(4) and release note. No auth changes.
- iOS owner: `apps/v1_ios` only. Add store lookup/version policy, trusted bridge action/result, focused tests, version 0.1.6(10). No signing changes.
- Root: `apps/v1_web/src/lib/native-app-update*`, `components/providers/native-app-update-gate*`, existing provider integration, task/changeset/release documentation.
- Sol reviewer: read-only cross-platform contract, unavailable/store eligibility, security/origin, actual checks; no self-approval.

## Implementation steps
1. [ ] Native owners read current bridge origin validation and add the exact request/result contract above; serialize JSON with platform serializers, never interpolate requestId into code.
2. [ ] Android queries `AppUpdateManagerFactory.create(context).getAppUpdateInfo()`; `UPDATE_AVAILABLE` with a larger code (or developer-triggered update in progress) requires update. Failed/unknown checks return unavailable.
3. [ ] iOS checks `Storefront.current` and uses the Korean public lookup for KOR, currently the distribution country. Unknown/other storefronts return unavailable. A cancellable request validates identity and minimum OS before returning a newer public marketing version.
4. [ ] Web calls the capability with a random requestId and a 12-second timeout; parses response fields and drops mismatched events. Render the fixed platform store link in a non-dismissable modal using existing design tokens, lock background input and restore focus/scroll on removal.
5. [ ] Run focused tests once per platform when supported, minimum workers; run scoped type checking and CI for the committed artifact. Record any unavailable toolchain rather than claiming a build passed.
6. [ ] Commit only owned paths; create dev PR, run independent review and exact-head CI. Do not promote the unrelated dev delta to main. Preserve current store submissions.

## Acceptance Criteria
- [ ] Original conditions and scenarios pass.
- [ ] Critical/major review findings resolved; no new debt markers.
- [ ] Verification, release limits and cleanup are recorded below.

## Tech Debt Resolved
Native app binary update detection was absent; add one cross-platform capability rather than reuse the unrelated web-asset release watcher.

## Security Notes
Existing main-frame/origin checks remain mandatory. Store result identity and versions are validated. No secrets, database schema, authentication or personal data are added. Blocking is a client UX policy, not a security authorization boundary.

## Risks & Dependencies
Legacy binaries cannot retroactively gain this capability. A startup crash before the WebView cannot show any web gate. Android must be Play-installed for Play availability; internal/sideload and iOS non-Korean storefronts are unavailable, not treated as latest. Actual Play/App Store installation requires distribution testing after release. The pending crash fix review is not cancelled.

## Ambiguity Log
2026-10-13: B chosen explicitly. Availability is resolved by store responses, not CI/native source version. Do not block users from installing an OS-incompatible build.

## Progress Snapshot
2026-10-13: Existing task-owned worktree fast-forwarded to dev 2c9cee4b; root shared checkout and its unrelated tournament WIP remain untouched. No new worktree/local branch created.

- Android/iOS implementation completed by GPT-6 Luna. New versions are 0.1.3(4) and 0.1.6(10); current review submissions have not been changed.
- Web bridge 12 focused tests and mandatory-gate suite 9 tests passed (21 total), including older WebViews without crypto.randomUUID and repeated unavailable results. Web `tsc --noEmit` and Web CI passed before this focused follow-up; latest-head CI remains required.
- GPT-6 Sol independent review found Alpha version suffix and cancelled foreground request/loading ownership issues; all fixed with regression coverage. Final read-only review PASS for CI/PR.
- Android Alpha CI 38349801342 passed on 84905b56f after adding the real org.json JVM test runtime (the initial JVM JSONObject stub failed). iOS Alpha CI 38349801339 passed on the same head, including Alpha/Production tests and Production Release build. No Android runtime/Play install or iOS store update is claimed.
- GitHub Codex review found repeated unavailable warning requests and direct crypto.randomUUID usage; both were fixed and independently re-reviewed by GPT-6 Sol with no remaining P1/P2 finding. The hosted Advanced Security reviewer failed because its configured claude-opus-5 model is unavailable; that external failure is not a passing security scan.
- Initial web test invocation used pnpm's wrong argument form; corrected to `pnpm --filter v1_web exec vitest run ... --maxWorkers=1`. jsdom lacks dialog.showModal; a narrow browser-API test substitute fixes the harness without changing product behavior.
- Alpha browser baseline captured with ego task 391. Deployed changed UI verification pending. Store eligibility is tested separately from simulated bridge UI scenarios.
- Dev #1889 merged as f4e442d06; later Alpha 8104b688 carries the same feature. At 390/768/1440, layout, 50px actions, error retention, warning deduplication and current-version clearing passed. Fresh-mount first Escape exposed an unprevented native cancel event; 5024bcfa8 registers native cancellation before showModal, with focused 9-test pass. A fresh deployed first-Escape replay remains mandatory; jsdom synthetic cancel is not native browser proof.
- Scoped main #1891 consumes only main-side Changesets with the official CLI, preserves old changelog history and advances fixed package versions to 1.8.1 (production resolver 1.8.2). Main-target release gates must apply equally to the explicitly approved scoped branch; pending receipts or missing/unchanged version metadata must still fail. No unrelated dev league/DB changes are included.
