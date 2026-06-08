# Native Core Flow

Status: Task 100 Wave 3 execution contract.

This scenario verifies the first native app shell and core flow routes in `apps/v1_mobile`. It proves that the Expo app renders real React Native surfaces for the first auth, onboarding, discovery, and account routes. It does not claim full 87-route feature parity; the remaining route implementation belongs to later Task 100 waves.

## Contract

- App package: `apps/v1_mobile`
- Route source: [native-route-parity-contract.md](./native-route-parity-contract.md)
- Backend source: [native-backend-contract-audit.md](./native-backend-contract-audit.md)
- Foundation source: [native-mobile-foundation.md](./native-mobile-foundation.md)
- Core routes:
  - `/login`
  - `/onboarding/sport`
  - `/onboarding/region`
  - `/onboarding/confirm`
  - `/home`
  - `/matches`
  - `/teams`
  - `/search`
  - `/my`

## Required Properties

- `src/features/core/core-flow-data.ts` includes every core route exactly once.
- Every core route has an Expo Router file.
- `NativeScreen` exposes `testID="native-screen"` for browser and simulator smoke.
- Content surfaces remain solid cards while iOS/Android chrome styling is separated in `src/design/tokens.ts`.
- Package-level `test` runs foundation, core-flow, and TypeScript checks together.

## Verification

Run:

```bash
corepack pnpm --filter v1_mobile test
node scripts/qa/native-core-flow-contract.test.mjs
NATIVE_MOBILE_WEB_URL=http://localhost:8097 NATIVE_MOBILE_SMOKE_DIR=.omo/ulw-loop/evidence/native-mobile-web-smoke-wave3 node scripts/qa/native-mobile-web-smoke.mjs
```

Expected:

- `coreFlowRows: 9`
- `missingCoreRoutes: []`
- `extraCoreRoutes: []`
- `missingRouteFiles: []`
- Browser smoke reports `failures: []` and `consoleErrors: []`.
- Screenshots are captured for `/home`, `/matches`, `/teams`, `/search`, `/my`, `/login`, and `/onboarding/sport`.

## Evidence

- `.omo/ulw-loop/evidence/native-exec-wave3-core-flow.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave3-core-flow.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave3-core-flow-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-mobile-web-smoke-wave3/`
