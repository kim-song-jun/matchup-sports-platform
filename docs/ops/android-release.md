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
