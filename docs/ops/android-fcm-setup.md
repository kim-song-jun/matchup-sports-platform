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

The Android app initializes Firebase from public build identifiers, so `google-services.json` is intentionally not committed.

## GitHub variables for the Alpha APK

Add these repository variables under Settings → Secrets and variables → Actions → Variables:

- `ANDROID_ALPHA_FIREBASE_PROJECT_ID`
- `ANDROID_ALPHA_FIREBASE_APP_ID`
- `ANDROID_ALPHA_FIREBASE_API_KEY`
- `ANDROID_ALPHA_FIREBASE_SENDER_ID`

`.github/workflows/android-alpha.yml` uses them to build `app-alpha-debug.apk`. Missing values still allow compilation, but native FCM stays explicitly disabled and is not a successful delivery test.

## v1 API credentials

The API requires all three values together:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Store the private key as one line with literal `\n` separators. The API converts those separators back to newlines in memory. If all three values are absent, only FCM is disabled. Partial credentials or an invalid `V1_PUSH_ENVIRONMENT` fail startup.

Production uses the GitHub `production` environment secrets with the names above; `deploy.yml` transfers them through the existing SSM SecureString runtime-env path. Alpha currently keeps the same names in the operator-managed Alpha `deploy/.env`. Do not pass secret values through SSM Run Command arguments or commit an env file.

## CI artifact

The Android Alpha workflow runs Java 17, Gradle 9.1.0, Android API 36 unit tests, and an Alpha debug APK build. Download the `teameet-alpha-<sha>` artifact from the workflow run. This APK is for controlled device testing; Play signing/AAB release is a later release gate.

## Required real-device matrix

- Fresh install: allow and deny Android notification permission.
- Logged-in registration and logout revoke.
- Foreground, background, and terminated notification receipt.
- Notification tap to the exact root-relative deep link.
- Token refresh and two-device fan-out.
- Negative control: an Alpha token is never selected by a production sender.
