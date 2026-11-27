# iOS Live Activity push client (PR-D)

Task [20261143](../../.github/tasks/20261143-ios-live-activity-push.md). Parent PR-C #2565. Server implementation is a separate user-owned PR; this document records the agreed draft client contract, not an already deployed endpoint.

## Scope and contract
- Foreground start of the first home live game remains PR-C policy. New cards request `pushType: .token`; observe current `pushToken` and `pushTokenUpdates`. No push-to-start token, background remote start, selection UI or server change.
- Widget Bearer PUT/DELETE `/api/v1/widget/live-activity-token`, exactly `{gameId, pushToken}` (lowercase hex). In-memory kind `activity` separates the concept from future push-to-start. No extra unagreed kind/gateway DTO field is sent.
- Token-rotation PUTs serialize, successful registrations deduplicate, failures notify and retry after60s during active reconciliation. Closing/ending/session change stops streams, cancels pending PUT and sends credential-bound DELETE; a late/cancelled PUT is followed by compensating DELETE. Failed DELETEs remain in memory for retry, no raw token enters logs/content/ledger.
- The existing WidgetStore is the sole persisted widget credential store. Reopening re-observes native per-card tokens and registers again. Session revision must match both before and after PUT. Revoke uses the original registration credential, not a new account's credential.

## endedAt and wire decoding
- REST `live[].endedAt` and push `content-state.endedAt`: optional ms. Missing/null preserves PR-C behavior. Server timestamp is used where present; otherwise use first local observation. Persist by game ID and never move an existing time forward, including a later server correction/fallback response. Earlier authoritative time can shorten it.
- Final deadline = stored endedAt+900000ms; expired → immediate end/remove even if home no longer lists the game or a new API request fails. Remote content/state streams are adopted before REST fallback and on process relaunch.
- Push content-state accepts the server widget live shape (gameId and extra widget fields ignored where static attributes already supply the ID), nullable names/score/venue/competition, ISO or ms period timestamps. Local old encoded state and absent endedAt continue decoding.
- Remote logo URLs map to the same SHA256 App Group filename as WidgetLogos. No image download runs from Activity UI; a new uncached logo remains an initial until app/timeline prefetch receives it.
- Server APNs `timestamp` / `dismissal-date` use seconds, endedAt uses ms. Server must send `event:end`, final content-state and `dismissal-date=(endedAt+900000)/1000`, or past date for immediate expiry. Apple: [push payload contract](https://developer.apple.com/documentation/ActivityKit/starting-and-updating-live-activities-with-activitykit-push-notifications).

## Validation evidence
- Alpha unsigned app+extension compile, selected24 unit tests PASS: push wire/request6 + lifecycle5 + WidgetTests10 + WidgetFollowupTests3.
- URLProtocol captures real URLSession PUT/DELETE requests: path, method, Bearer, no cookies, exactly two JSON keys, token hex. HTTP503 throws instead of reporting success. No real server request/token.
- Decode tests: nullable/absent fields, ISO/ms periods, local encoded round-trip, cached WidgetModel, logo-key consistency. Ledger tests: persisted fixed deadline, delayed/repeated END/fallback cannot extend, expired deadline, separate game IDs.
- Production unsigned app+extension build PASS. Logs `/private/tmp/teameet-widget-pr-d-{test,production,ui-skip}.log` (local only).
- Inherited synthetic ActivityKit UI test is opt-in via `TEAMEET_LIVE_ACTIVITY_SAMPLE_UITEST=1` build setting, forwarded by the UI scheme. Default full UI harness12/12 skipped with0 failures, observed on this device; do not call skips UI/APNs PASS. PR-C's actual system sample screenshots remain at #2565; this PR changes transport/decoding/lifecycle without a new layout.
- Dedicated device iPhone17 Pro iOS26.2 UDID6F68E52F-23C1-4040-8C1E-B372EE92B28B; no alpha account login or server mutation. No .env/real secret read.

## 확인 필요 / server handoff
- [ ] User-owned server PR link and deployed PUT/DELETE/home endedAt contract. End-to-end alpha0/APNs0 until that exists and credentials/signing are available.
- [ ] Server scopes registration to authenticated widget token/user/game and cascades token revoke/account loss; app cannot guarantee cleanup while offline/terminated. After relaunch a disappeared card may no longer expose a push token, so APNs410/invalid-token cleanup and expiry must exist server-side.
- [ ] PUT rotation should upsert within the same widget-token/game scope; DELETE must compare pushToken so an old cancellation/cleanup cannot erase a newer registration. This is an explicit dependency, not verified against a server implementation.
- [ ] Server topic/environment APNs sandbox vs TestFlight production gateway, tokenKind extension, expiry/retry/out-of-order push handling. Client intentionally sends the two agreed body fields only.
- [ ] Physical signed-device token issuance/rotation, app terminated remote update/end, swipe/logout/account-change races, final15min wall-clock cleanup and minimum iOS16.2 remain unverified. Existing PR-C cards created with pushType=nil cannot gain a token; new push-capable cards are used from this version. No automatic replacement of a user's card.
- [ ] iOS17.2+ push-to-start remains a separate future PR; no such stream or token is registered here.
