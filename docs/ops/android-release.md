# Android Release Runbook

## Safety boundary

- Feature work and PRs target `dev`; agents do not promote `dev` to `main`.
- `.github/workflows/android-production-bundle.yml` is manual, accepts only the `main` ref, and uses
  the protected GitHub `production` environment. Selecting any other ref fails visibly.
- The branch decision is implemented by `scripts/release/require-android-production-ref.sh`; Alpha PR
  CI runs both its positive `main` case and negative `dev` control.
- The workflow builds and retains a signed AAB plus SHA-256 checksum. It never uploads to Play.
- Firebase public app identifiers may be repository/environment variables. Keystores, passwords,
  service-account credentials, generated AABs, and APKs must never be committed.

## Version source of truth

`apps/v1_android/version.properties` is the only application version source:

- `versionCode` is a positive integer and must increase for every Play upload, including rollback builds.
- `versionName` uses `MAJOR.MINOR.PATCH`. Alpha automatically appends `-alpha`.
- A version bump and its release notes belong in the same reviewed change.

The Gradle configuration fails immediately when either value is missing or malformed. Command-line
overrides are intentionally not accepted, preventing the same commit from producing differently
versioned artifacts.

## Production inputs

Configure these public identifiers in the protected `production` environment:

- `ANDROID_PRODUCTION_FIREBASE_PROJECT_ID`
- `ANDROID_PRODUCTION_FIREBASE_APP_ID`
- `ANDROID_PRODUCTION_FIREBASE_API_KEY`
- `ANDROID_PRODUCTION_FIREBASE_SENDER_ID`
- `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS` (Play app-signing SHA-256; comma-separated
  when Play provides more than one active certificate)

Configure these secrets in the same environment:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

Keep the original keystore in two access-controlled backups outside GitHub. Record its alias and
certificate fingerprints separately from its passwords. Prefer Play App Signing: the locally held key
is the upload key, while `assetlinks.json` must use the Play app-signing certificate fingerprint shown
by Play Console after enrollment.

## Build and verification

1. Confirm the selected commit is on `main` and its production approval is intentional.
2. Run **Android Production Bundle** manually from `main`.
3. Confirm the Firebase identity and signing gates pass before accepting the artifact.
4. Download `teameet-production-aab-<sha>` and verify `app-production-release.aab` against the adjacent
   `.sha256` file on a trusted workstation.
5. Preserve the workflow URL, commit SHA, versionCode, versionName, checksum, and reviewer in the
   release record.
6. Upload to Play Internal Testing first. Production rollout remains a separate user-controlled action.

The runner materializes the keystore only under `RUNNER_TEMP`, assigns restrictive permissions, and
removes it in an `always()` cleanup step. Gradle also refuses `bundleProductionRelease` and
`assembleProductionRelease` when any signing input or production Firebase identifier is absent.

## App Links and store assets

Before the first Play test release:

1. Obtain the Play app-signing SHA-256 certificate fingerprint.
2. Set the protected production variable `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS`. The v1 Web
   route publishes `https://teameet.co.kr/.well-known/assetlinks.json` for `kr.co.teameet`; it returns
   `503` rather than publishing a placeholder while the fingerprint is missing. Do not use the CI debug
   or upload-key fingerprint unless it is also the Play signing key.
3. Validate the production domain response, content type, package name, and fingerprint.
4. Select and export the approved adaptive launcher icon, 512 px Play icon, feature graphic, screenshots,
   and splash treatment from the versioned Teameet design references.
5. Complete the notification-permission and data-safety disclosures before inviting testers.

## Rollback

Play does not accept a lower versionCode. A rollback is therefore a new release built from the last
known-good source with a versionCode greater than every previously uploaded artifact. Never reuse an old
AAB under a new label and never replace a signed artifact after its checksum is recorded.

For Alpha controlled installs, retain the workflow run and checksum for each APK. Reinstalling an older
debug APK may require uninstalling the newer build and will change the installation identity; record that
fact when interpreting token/revoke results.

## Remaining device-only gate

An AAB or passing JVM suite is not delivery proof. Fresh-install permission allow/deny, foreground,
background, terminated receipt, notification tap, token refresh, logout revoke, multi-device delivery,
authenticated file download/opening, Samsung/stock Android coverage, and Alpha-versus-production negative
control remain mandatory real-device verdicts.

## Play policy gates: items 2-6

This checklist covers Data safety/privacy, account deletion, permissions, WebView quality, and technical
release requirements. Reviewer-account setup and the closed-testing cohort are tracked separately and
are intentionally outside this follow-up.

1. Run `node scripts/qa/check-android-play-policy.mjs`. It checks the shipped manifest permission set,
   hardened WebView/file-picker rules, account-deletion cleanup hooks, public deletion route, and Data
   safety worksheet against the current source tree.
2. Reconcile every Play Console Data safety answer with
   `apps/v1_android/play/data-safety.md`, the exact release AAB, and the active processors. Product/legal
   must decide Play's “shared” classification and confirm retention periods; implementation evidence does
   not replace that approval.
3. Probe `https://teameet.co.kr/terms?document=privacy` and
   `https://teameet.co.kr/account-deletion` after the production web deployment. Exercise both the
   in-app withdrawal request and operator final-deletion path. A request immediately locks login and stops
   push delivery; final deletion performs the broader PII and identifier cleanup.
4. Inspect the merged release manifest. The application-owned permission set is limited to
   `INTERNET`, `ACCESS_COARSE_LOCATION`, and `POST_NOTIFICATIONS`; any SDK-added permission is a
   release blocker until the declaration and runtime behavior are reviewed.
5. Repeat the WebView matrix on the Play-distributed build: status/navigation insets, IME resize,
   centered feedback, renderer recovery, main-frame error UI, Kakao sign-in inside the reviewed origin
   allowlist, system file picker, download/open, external maps, and notification deep links.
6. Confirm `compileSdk`/`targetSdk` 36, monotonically increasing `versionCode`, production
   debuggability disabled, TLS-only origin, signing/Firebase fail-closed gates, and the AAB checksum.
   Current policy CI runs build-tools 36 `zipalign -c -P 16` against the AAB so the transitive DataStore
   native libraries keep the 16 KB ZIP alignment required by the existing release baseline.

Source gates and local JVM/UI checks reduce drift, but they do not replace Play Console declarations,
pre-launch reports, signed-distribution checks, or physical OEM/device evidence.
