# Native Runtime Desktop Proof

Status: Verified
Task: 100 native platform expansion, Wave 8

## Scope

This scenario verifies the final native runtime readiness gate for `apps/v1_mobile` and records the macOS desktop proof path without overstating simulator support.

## Current Runtime Gate

- iOS Simulator native runtime: Blocked
- Android Emulator native runtime: Blocked
- macOS desktop proof: Verified via Expo Web
- No native simulator success is claimed in this environment.

Current local preflight on 2026-06-06:

- `xcodebuild -version` reports that the active developer directory is Command Line Tools, not full Xcode.
- `xcrun simctl list devices available` cannot find `simctl`.
- `ANDROID_HOME` and `ANDROID_SDK_ROOT` are empty.
- `adb` and `emulator` are not installed on `PATH`.
- Expo CLI is available through `corepack pnpm --filter v1_mobile exec expo --version`.

## Contract

- The app must keep Expo iOS and Android scripts available: `ios`, `android`, `expo:doctor`, and `test`.
- `app.config.ts` must keep explicit `ios` and `android` native config sections.
- If the local machine cannot run iOS Simulator or Android Emulator, documentation and final evidence must say `Blocked`, not `Verified`.
- macOS proof for this wave is the desktop Expo Web preview at `1280x800`; React Native macOS, Electron, and Tauri remain decision-gated implementation options.
- A future iOS proof requires full Xcode, selected developer directory, at least one bootable simulator, and a captured simulator screenshot.
- A future Android proof requires Android SDK, `adb`, at least one AVD or connected device, and a captured emulator/device screenshot.

## Verification

```sh
node scripts/qa/native-runtime-readiness.test.mjs
corepack pnpm --filter v1_mobile expo:doctor
corepack pnpm --filter v1_mobile test
```

Browser channel:

```sh
NATIVE_MOBILE_WEB_URL=http://localhost:8102 \
NATIVE_MOBILE_SMOKE_VIEWPORT=1280x800 \
NATIVE_MOBILE_SMOKE_ROUTES=/home,/landing,/matches,/matches/match-1,/team-matches,/team-matches/team-match-1,/teams,/teams/team-1,/search,/my,/chat,/notifications \
NATIVE_MOBILE_SMOKE_DIR=.omo/ulw-loop/evidence/native-runtime-desktop-smoke-wave8 \
node scripts/qa/native-mobile-web-smoke.mjs
```

Evidence:

- `.omo/ulw-loop/evidence/native-exec-wave8-runtime-desktop.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave8-runtime-readiness.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave8-final-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-runtime-desktop-smoke-wave8/`

## Result

- Runtime readiness guard blocks false native simulator success claims in the current local environment.
- iOS and Android remain release-readiness setup gates, not completed simulator QA.
- macOS desktop preview is verified through Expo Web desktop browser smoke for representative route families.
