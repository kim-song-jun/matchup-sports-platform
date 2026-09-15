# Android Play Console Launch Checklist

Updated: 2026-08-31
Canonical task: `.github/tasks/156-android-app-fcm-foundation.md`
Production package: `kr.co.teameet`

This checklist covers the operator-controlled work between a green production AAB and a Google Play
release. It does not authorize merging `dev` to `main`, creating a production rollout, or changing live
Play Console state without the account owner.

## Current policy baseline

- Teameet targets API 36. Starting 2026-08-31, Google Play requires new phone/tablet apps and updates
  to target Android 16 / API 36 or higher.
- If the Play developer account is a personal account created after 2023-11-13, production access
  requires a closed test with at least 12 opted-in testers continuously for 14 days. Confirm the account
  type and creation date before promising a production date.
- Internal-only testing is exempt from the Data safety form, but closed, open, and production tracks are
  not. The form and privacy-policy URL must be ready before moving beyond internal testing.
- Because Teameet supports account creation, Play requires both an in-app deletion path and a public web
  resource. Use:
  - in app: `/my/settings/withdrawal`
  - public Play Console URL: `https://teameet.co.kr/account-deletion`

Official references:

- [Target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [New personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Store preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151)
- [App review preparation](https://support.google.com/googleplay/android-developer/answer/9859455)

## Gate 1 — Account and application identity

- [ ] Record whether the Play account is an organization or personal account and its creation date.
- [ ] Confirm developer identity, legal name, address, support email, and support phone are verified and
      current in Play Console.
- [ ] Create or select the Play app with exact package name `kr.co.teameet`; record whether the package is
      available before generating the first production artifact.
- [ ] Enroll in Play App Signing and record the app-signing certificate SHA-256 separately from the upload
      key SHA-256.
- [ ] Configure the protected `production` environment inputs listed in `docs/ops/android-release.md`.
- [ ] Keep two access-controlled backups of the upload keystore outside GitHub and record recovery owners.

Evidence: Play app URL, account type/date, app-signing SHA-256, upload-key SHA-256, backup owners.

## Gate 2 — Production App Links and AAB

- [ ] Publish `https://teameet.co.kr/.well-known/assetlinks.json` for `kr.co.teameet` using the Play
      app-signing certificate SHA-256, not a CI debug or upload-key fingerprint.
- [ ] Verify HTTPS 200, `application/json`, exact package name, exact fingerprint, and no redirects that
      break Android verification.
- [ ] Increment `apps/v1_android/version.properties` once for the release candidate. Never reuse a
      versionCode that has reached Play, including a discarded or rollback upload.
- [ ] From the intended `main` commit, run the protected **Android Production Bundle** workflow and retain
      workflow URL, full commit SHA, versionCode, versionName, AAB SHA-256, and reviewer.
- [ ] Inspect the signed AAB with bundletool/Play pre-launch report. Confirm min SDK 26, target SDK 36,
      package name, signing certificate, requested permissions, and supported device set.
- [x] The current Alpha APK includes AndroidX DataStore's `libdatastore_shared_counter.so` for arm64-v8a,
      armeabi-v7a, x86, and x86_64. Build-tools 36 `zipalign -c -P 16 -v 4` passed all four ABIs.
- [ ] Repeat the 16 KB alignment check against the final signed production APK set generated from the AAB
      (or use Play/bundletool inspection); Alpha APK evidence does not replace final artifact inspection.

Evidence: assetlinks receipt, workflow receipt, checksum receipt, bundle inspection, pre-launch report.

## Gate 3 — Store listing assets and copy

The 2026-08-31 implementation direction selected `docs/reference/app-icons-v4/06-orbit-match-blue.png`
as the launcher/Play icon source. Final Play Console submission still needs the account owner's visual
acceptance against the device masks and listing preview.

- [x] App label: `Teameet`; Korean listing title is 27 characters and within the 30-character limit.
- [x] Play icon exported to `apps/v1_android/play/listing/graphics/play-icon-512.png`: 512x512,
      32-bit PNG with alpha, under 1024 KB.
- [x] Feature graphic exported to `apps/v1_android/play/listing/graphics/feature-graphic-1024x500.png`:
      1024x500, opaque 24-bit PNG. Checksums are versioned beside the assets.
- [ ] At least two real app screenshots. Preferred phone set: at least four 1080x1920 portrait screenshots
      showing current in-app UI, without personal notifications, carrier details, or stale sample claims.
- [ ] Adaptive launcher foreground/background and Android 12 splash resources are exported; verify circular,
      rounded-square, squircle, and Samsung masks on a physical device.
- [x] Write Korean app name, short description, and full description without rankings, awards, fake usage
      numbers, pricing promotions, keyword stuffing, or unsupported capabilities.
- [ ] Add accurate alt text for each screenshot and keep the first three focused on actual product UI.

Suggested screenshot coverage after the final signed build is available:

1. Home and recommended match discovery.
2. Match or tournament detail with a clear application path.
3. Team/community flow.
4. Chat and notification settings, with no real private content.

Evidence: approved source asset, export checksums, locale copy review, screenshot route/persona/build SHA.

## Gate 4 — App content and policy declarations

- [ ] Privacy-policy URL: `https://teameet.co.kr/terms?document=privacy`; verify it loads without login and
      explicitly covers the Android app, Firebase Cloud Messaging, cookies/session data, analytics in use,
      uploads, payments/refunds, retention, processors, and contact details.
- [ ] Account-deletion URL: `https://teameet.co.kr/account-deletion`; verify it loads without login and lets
      a user initiate deletion without reinstalling the app.
- [ ] Complete Data safety from the shipped runtime, not from assumptions. Re-audit every SDK and web
      surface. Candidate data categories include account/contact data, user content, photos/uploads,
      coarse activity region, payment/refund information, app activity, device identifiers, diagnostics,
      and FCM installation tokens. Legal/product owners must confirm collection, sharing, purpose,
      optionality, retention, encryption in transit, and deletion for each category.
- [ ] Complete target audience/age declaration. Teameet currently states that users under 14 are not
      allowed; confirm signup enforcement and store declaration agree.
- [ ] Complete content rating questionnaire, ads declaration, news declaration, government affiliation,
      financial-features declaration, and any other Play Console items shown under **App content**.
- [ ] Provide App access review instructions and a stable reviewer account or approved access method for
      login-gated functionality. Do not put secrets in this repository or store-listing copy.
- [ ] Explain `POST_NOTIFICATIONS` in the reviewer notes: permission is requested only after explicit user
      opt-in, denial leaves the rest of the app usable, and settings provide a recovery path.

Evidence: exported/de-identified declaration receipt, reviewer-access owner, privacy/legal approval.

## Gate 5 — Internal and closed testing

- [ ] Upload the first signed AAB to Internal Testing. Do not use Alpha CI debug APK evidence as Play
      signing or upgrade evidence.
- [ ] Install from Play on Samsung and stock Android devices. Confirm Play-signed upgrades preserve app
      data, installation identity, notification consent, and token refresh.
- [ ] Complete the Task 156 physical-device matrix: permission allow/deny, foreground/background/terminated
      FCM, inquiry deep link, token refresh, logout revoke, multi-device fan-out, file upload/download,
      IME portrait/landscape, map app installed/missing behavior, back/resume/process recreation, and
      Alpha-versus-production isolation.
- [ ] Review Play pre-launch report crashes, ANRs, accessibility, security, and device compatibility.
- [ ] If the account is subject to the personal-account rule, start the 12-tester/14-day closed-test clock
      only after app setup is complete and continuously track opt-in count. Internal testing does not count.

Evidence: track/build ID, tester cohort, start/end timestamps, device matrix M/N, pre-launch report.

## Gate 6 — Production decision and rollback

- [ ] Product, legal/privacy, security, QA, and account owner approve the same release record.
- [ ] Confirm there are no blocking Play policy items, rejected declarations, unresolved pre-launch crashes,
      or missing reviewer credentials.
- [ ] Choose rollout percentage and monitoring owner. Production rollout is user-controlled.
- [ ] Prepare rollback as a new AAB from the last known-good source with a higher versionCode. Play cannot
      roll back by uploading an older versionCode.
- [ ] Monitor crash/ANR rate, FCM delivery failure, invalid token revocation, authentication failures,
      WebView navigation failures, and support contact volume after rollout.

## Current blockers

- Play account type/creation date and package-name availability are unknown.
- Production Firebase app/project and release signing inputs are not proven in the protected environment.
- Play App Signing is not enrolled, so the production certificate and final `assetlinks.json` cannot exist.
- 2026-08-31 live probes returned 404 for production and Alpha `/.well-known/assetlinks.json` and
  `/account-deletion`; the implemented v1 Web routes are not yet deployed. Production privacy returned 200.
- API 33 automatic App Links verification listed `alpha.teameet.co.kr` as `Disabled`; explicit-package
  intent delivery passed but is not evidence of verified-link routing.
- Launcher/store icon, feature graphic, Korean copy, release notes, data-safety worksheet, and reviewer
  instructions are versioned under `apps/v1_android/play/`; physical-mask and final listing acceptance remain.
- A signed Play-distributed build and complete physical-device matrix do not yet exist.
- Existing GitHub-hosted Alpha debug APKs use unstable debug signing and cannot prove upgrade/token
  preservation. Treat them as clean-install QA artifacts only.

Additional official compatibility references:

- [Android 16 orientation, aspect ratio, and resizability](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability)
- [Edge-to-edge enforcement for target SDK 35+](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [16 KB page-size support](https://developer.android.com/guide/practices/page-sizes)
- [Notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Permissions and sensitive APIs declaration](https://support.google.com/googleplay/android-developer/answer/9214102)
