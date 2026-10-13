# Android Play release first-launch crash — Windows

Canonical task: `.github/tasks/156-android-app-fcm-foundation.md`.
Status: Windows reproduction and optimized source fix verified; dev/main/Play rollout pending.

## Scope and artifact identity

- User symptom: installed from Play Store; app closes on first access.
- At reproduction, freshly fetched dev `9e9a019253`, main `966038602`; their Android source trees are identical.
- Original AAB: production workflow [38271649807](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38271649807), commit `c22fd5da975101fb41fef2794dbbde3a235261ac`, Android `0.1.1` / code `2`.
- Verified SHA-256: `f054d3640468d075f56fc11aa1b412237af50eff9762ebe4d2ea786569d31d0b`.
- Windows 11, JDK 17.0.13, Google bundletool 1.18.2; dedicated `wm_test` AVD, Google APIs Android 14 / API 34, x86_64, 1536 MB RAM, 2 cores, read-only/no-snapshot mode.
- Persona: unauthenticated fresh installation. Original screen 1080×2340/density 440; after-state override 720×1560/density 320 (360 dp window width) reduced emulator load. No existing user account, backend fixture or production data changed.
- APK regenerated from the optimized AAB with debug signing solely for emulator testing. This is not a pulled Play APK and does not establish store-signing or physical-device parity.

## RED evidence

The original artifact crashes on first launch and relaunch before login. Its R8 map confirms
`retrofit2.Call -> h7.c`, matching the thrown adapter error.

```text
FATAL EXCEPTION: main
Process: kr.co.teameet
java.lang.IllegalArgumentException: Unable to create call adapter for interface h7.c
    for method UserApi.checkAccessToken
    at com.kakao.sdk.user.AppLifecycleObserver.onStateChanged(...)
Caused by: java.lang.IllegalArgumentException:
    Call return type must be parameterized as Call<Foo> or Call<? extends Foo>
```

The executable regression command `scripts/qa/test-android-release-startup.ps1` fails with
`Release startup crashed` for the original non-debuggable APK; it does not accept a live PID or
visible crash dialog as success. Local evidence: `output/android-play-launch-20261013/smoke-red/`,
`before-crash.log`, `before-second-launch-crash.log`, `before-crash.png`, `production-mapping.txt`.

## Fix and GREEN gates

- Retain generic signatures and the Retrofit interface/type endpoints needed by Kakao under R8 full mode.
- Keep code shrinking, Kakao startup and production WebView diagnostics settings intact; no exception suppression.
- Android hotfix source version `0.1.2`, code `3`, so a later Play upload can exceed code `2`.
- [x] Production unit tests 42/42 PASS; optimized `assembleProductionRelease` PASS (74 tasks, 5m23s, Gradle 9.1.0, one worker). Generated release BuildConfig confirms all five Firebase/Kakao public inputs present and DEBUG=false without printing their values.
- [x] Smoke GREEN after clearing only the task-created emulator app's data: `PASS: kr.co.teameet release MainActivity stayed resumed without a crash for 15 seconds.` The actual production home, announcement and content render; the announcement closes normally.
- [x] Relaunch COLD PASS (2033 ms). Completed HOME transition followed by HOT resume PASS, resumed MainActivity and no app fatal log after 15 seconds. Initial back-to-back HOME/start needed a settled transition before checking foreground state; the final verdict uses the settled sequence.
- [x] Play source-policy PASS (three application permissions, targetSdk 36); PowerShell syntax PASS; diff check PASS; no new debt markers (existing unrelated documentation references remain).
- [x] PR review found that Alpha's application ID suffix does not change the Activity namespace. This production-release script now rejects `kr.co.teameet.alpha` before APK/device access. Actual script invocation verifies the guard RED → GREEN; no Alpha runtime coverage is claimed.
- [x] Additional review: SDK aapt2 verifies the supplied APK's application ID before installation, and app-data clearing must return Success on the dedicated emulator. A real CI Alpha APK is rejected before installation/device changes. The updated script again records the original release crash RED and fixed release native-startup GREEN after a fresh data reset (`review-smoke-red/`, `review-smoke-green/`). Android 0.1.2 Play release notes match the hotfix.
- [x] Owned emulator launcher PID36464/child35900 stopped. No devices remained; task-started ADB daemon stopped. Single-use Gradle processes exited. Session-only size/density/animation overrides are discarded by read-only/no-snapshot shutdown; no unrelated process was stopped.

## Screenshots, logs and residual warnings

- Local evidence root: `output/android-play-launch-20261013/` in the primary Windows checkout, outside versioned source.
- First corrected launch: `smoke-green/startup.png`; resumed announcement: `after-resume.png`; home after dismissing it: `fixed-home.png`. These were visually inspected, with real page content and MainActivity resumed.
- Original application fatal UI baseline is unavailable because the process terminates. `before-crash.png` shows the launcher and a separate SystemUI ANR under host load; it is a diagnostic screenshot, not a Teameet error-screen comparison. Before-fix proof is the two fatal logs and smoke RED output.
- The review rerun's `review-smoke-green/startup.png` shows a separate SystemUI ANR overlay above the home. Its native-startup verdict is based on the empty crash buffer, live process and resumed MainActivity; this rerun does not establish an unobstructed/fully loaded home. The earlier inspected `fixed-home.png` remains the home-rendering evidence. Rerun launcher PID40564, qemu32712, crash handler30032, console14240 and task-started ADB31452 were stopped after no devices remained.
- `webview-errors.txt` records three Chromium WASM code-cache creation errors in the emulator on relaunch. The page renders and no native fatal exception follows; this is not a console-clean verdict. Production WebView remote debugging remains disabled, so no complete browser DevTools/network audit is claimed.
- No authenticated action, backend data mutation, signing-key retrieval, publishing or promotion occurred.
- `qa-summary.json` records the verdicts and fixed-APK SHA-256 `1a578eef75174e55dc8e3657a1e122a309363d5b87e3a21b2495d9561592b268`. Downloaded AAB, QA APK, build/cache inputs and useful logs/screenshots remain locally under the evidence root; binaries and credentials are not in the source diff.

## Coverage limits

This scenario covers the release startup regression on one API 34 emulator. It does not cover the
user's exact physical phone, authenticated Kakao login, FCM, all routes, Play signing/upgrade or
publication. Release source remains on a feature branch; main promotion and Play upload are user operations.
