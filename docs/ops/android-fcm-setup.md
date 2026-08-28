# Android + FCM Setup

## Environment boundary

| Environment | Android application ID | Web origin | Server environment |
|---|---|---|---|
| Alpha | `kr.co.teameet.alpha` | `https://alpha.teameet.co.kr` | `V1_PUSH_ENVIRONMENT=alpha` |
| Production | `kr.co.teameet` | `https://teameet.co.kr` | `V1_PUSH_ENVIRONMENT=production` |

Alpha and production must be separate Firebase projects. Do not register both application IDs in one project and do not reuse a service account between them.

## Firebase Console

For each environment:

1. Create or select the environment-specific Firebase project.
2. Add an Android app using the exact application ID in the table.
3. Record the public project ID, app ID, Web API key, and sender ID.
4. Create a server service account key for the v1 API. Never commit the JSON file or put it in an Android build.

The Alpha Firebase project ID must contain an `alpha` segment (for example,
`teameet-alpha`). The API also verifies that the service-account email belongs to the configured
project. Production rejects an Alpha project ID. These checks fail startup/build instead of
silently crossing environment boundaries.

The Android app initializes Firebase from public build identifiers, so `google-services.json` is intentionally not committed.

## GitHub variables for the Alpha APK

Add these repository variables under Settings → Secrets and variables → Actions → Variables:

- `ANDROID_ALPHA_FIREBASE_PROJECT_ID`
- `ANDROID_ALPHA_FIREBASE_APP_ID`
- `ANDROID_ALPHA_FIREBASE_API_KEY`
- `ANDROID_ALPHA_FIREBASE_SENDER_ID`

`.github/workflows/android-alpha.yml` uses them to build `app-alpha-debug.apk`. On pull requests,
missing values permit compile/unit checks but suppress APK upload so an FCM-disabled artifact is
not presented as test-ready. On `dev` pushes and manual dispatches, missing values fail the job.
When present, the Gradle gate checks formats, sender/app ID consistency, the Alpha project name,
and separation from any supplied production project ID.

## v1 API credentials

The API requires all three values together:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Store the private key as one line with literal `\n` separators. The API converts those separators back to newlines in memory. If all three values are absent, only FCM is disabled. Partial credentials or an invalid `V1_PUSH_ENVIRONMENT` fail startup.

Production uses the GitHub `production` environment secrets with the names above; `deploy.yml` transfers them through the existing SSM SecureString runtime-env path. Alpha currently keeps the same names in the operator-managed Alpha `deploy/.env`. Do not pass secret values through SSM Run Command arguments or commit an env file.

## CI artifact

The Android Alpha workflow runs Java 17, Gradle 9.1.0, Android API 36, Alpha and production flavor
unit tests, and an Alpha debug APK build. With all Alpha Firebase variables configured, download
the `teameet-alpha-<sha>` artifact from the workflow run. This APK is for controlled device
testing; Play signing/AAB release is a later release gate.

## Delivery diagnostics

`V1PushDevice` keeps delivery metadata without exposing the registration token: `lastSuccessAt`,
`failureCount`, `lastFailureAt`, and `revokedAt`. A successful FCM response updates
`lastSuccessAt`. Invalid/unregistered tokens are revoked; transient and batch-level failures are
counted and later batches continue. FCM multicast is split into at most 500 tokens per request.

When investigating delivery, select only the metadata above plus environment/platform/user and
installation IDs. Never print or export the `token` column. Confirm in this order:

1. API and worker use the expected `V1_PUSH_ENVIRONMENT` and Firebase project.
2. The device is active (`revokedAt IS NULL`) and has a recent `lastSuccessAt` or traceable failure.
3. The notification row has the expected canonical root-relative `deepLink`.
4. Browser Web Push still succeeds independently if FCM is degraded.

## Store release gates

Before production store submission, create a release keystore outside Git, configure repeatable
`versionCode`/`versionName` and AAB signing, publish `/.well-known/assetlinks.json` for the release
certificate, replace/verify adaptive launcher and splash assets, and complete Play internal
testing. Alpha intentionally disables App Link auto-verification because CI debug signing is not a
stable trust root. File download behavior from WebView also needs a dedicated device test before
claiming full web-route parity.

## Required real-device matrix

- Fresh install: allow and deny Android notification permission.
- Logged-in registration and logout revoke.
- Foreground, background, and terminated notification receipt.
- Notification tap to the exact root-relative deep link.
- Token refresh and two-device fan-out.
- Negative control: an Alpha token is never selected by a production sender.

## Re-audit environment and CI gates

The Alpha Firebase project ID must contain an `alpha` segment (for example,
`teameet-alpha`). The API verifies that the service-account email belongs to the configured
project, while production rejects an Alpha project ID. These checks fail startup/build instead of
silently crossing environment boundaries.

On pull requests, missing Alpha Firebase repository variables permit compile/unit checks but
suppress APK upload so an FCM-disabled artifact is not presented as test-ready. On `dev` pushes
and manual dispatches, missing values fail the Android job. When present, the Gradle gate checks
formats, sender/app ID consistency, Alpha project naming, and separation from any supplied
production project ID. A downloadable `teameet-alpha-<sha>` artifact is therefore available only
when the public Firebase app configuration is complete.

## Delivery diagnostics

`V1PushDevice` keeps delivery metadata without exposing the registration token: `lastSuccessAt`,
`failureCount`, `lastFailureAt`, and `revokedAt`. A successful FCM response updates
`lastSuccessAt`. Invalid/unregistered tokens are revoked; transient and batch-level failures are
counted and later batches continue. FCM multicast is split into at most 500 tokens per request.

When investigating delivery, select only the metadata above plus environment/platform/user and
installation IDs. Never print or export the `token` column. Confirm in this order:

1. API and worker use the expected `V1_PUSH_ENVIRONMENT` and Firebase project.
2. The device is active (`revokedAt IS NULL`) and has a recent `lastSuccessAt` or traceable failure.
3. The notification row has the expected canonical root-relative `deepLink`.
4. Browser Web Push still succeeds independently if FCM is degraded.

## Store release gates

Before production store submission, create a release keystore outside Git, configure repeatable
`versionCode`/`versionName` and AAB signing, publish `/.well-known/assetlinks.json` for the release
certificate, replace/verify adaptive launcher and splash assets, and complete Play internal
testing. Alpha intentionally disables App Link auto-verification because CI debug signing is not a
stable trust root. File download behavior from WebView also needs a dedicated device test before
claiming full web-route parity.
