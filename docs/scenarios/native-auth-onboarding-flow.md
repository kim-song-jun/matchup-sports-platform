# Native Auth Onboarding Flow

Status: Verified
Task: 100 native platform expansion, Wave 5

## Scope

This scenario verifies the native Expo auth, public entry, Kakao callback, blocked/error, and onboarding route surfaces for `apps/v1_mobile`.

Covered routes:

- `/landing`, `/login`, `/login/email`
- `/signup`, `/signup/social`, `/signup/complete`
- `/auth/account-conflict`, `/auth/blocked`, `/auth/location-denied`, `/auth/missing-email`, `/auth/password-reset`, `/auth/provider-denied`
- `/callback/kakao`
- `/onboarding/sport`, `/onboarding/level`, `/onboarding/region`, `/onboarding/resume`, `/onboarding/confirm`

## Contract

- Native auth flow data must cover 18/18 routes with no extra or missing route rows.
- Native copy must expose SecureStore session boundaries, Kakao deep link callback handling, DTO-compatible onboarding payloads, and honest blocked/error states.
- `NativeScreen` must prefer `findAuthFlowScreen(route)` before core-flow fallback data.
- No WebView wrapper is used as the primary native implementation.

## Verification

```sh
node scripts/qa/native-auth-flow-contract.test.mjs
corepack pnpm --filter v1_mobile test
```

Browser channel:

```sh
NATIVE_MOBILE_WEB_URL=http://localhost:8099 \
NATIVE_MOBILE_SMOKE_ROUTES=/landing,/login,/login/email,/signup,/signup/social,/signup/complete,/auth/blocked,/auth/missing-email,/auth/provider-denied,/auth/account-conflict,/auth/location-denied,/auth/password-reset,/callback/kakao,/onboarding/sport,/onboarding/level,/onboarding/region,/onboarding/resume,/onboarding/confirm \
NATIVE_MOBILE_SMOKE_DIR=.omo/ulw-loop/evidence/native-auth-flow-smoke-wave5 \
node scripts/qa/native-mobile-web-smoke.mjs
```

Evidence:

- `.omo/ulw-loop/evidence/native-exec-wave5-auth-flow.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave5-auth-flow.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave5-auth-flow-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-auth-flow-smoke-wave5/`

## Result

- Auth contract: `authFlowRows=18`, `missingAuthRoutes=[]`, `extraAuthRoutes=[]`.
- Browser smoke: 18 screenshots, `failures=[]`, `consoleErrors=[]`.
- Malformed route RED: replacing `/auth/blocked` with `/auth/blocked-missing` fails with `missingAuthRoutes=["/auth/blocked"]`.
- Regression bundle: Wave 0-4 contracts, auth contract, `v1_mobile` typecheck/test, and scoped `git diff --check` passed.
