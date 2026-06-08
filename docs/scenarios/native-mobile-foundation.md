# Native Mobile Foundation

Status: Task 100 Wave 2 execution contract.

This scenario verifies that `apps/v1_mobile` exists as an Expo SDK 56 development-build foundation before native route implementation starts. It does not claim full native feature parity. Full route implementation remains under later Task 100 waves.

## Contract

- Package: `apps/v1_mobile`
- Framework: Expo SDK 56 + Expo Router
- Primary platforms: iOS and Android
- Route source: [native-route-parity-contract.md](./native-route-parity-contract.md)
- Backend source: [native-backend-contract-audit.md](./native-backend-contract-audit.md)

## Required Properties

- `v1_mobile` is included by the existing `apps/*` pnpm workspace pattern.
- The package has `dev`, `ios`, `android`, `typecheck`, and `test` scripts.
- No WebView dependency is present.
- `src/navigation/native-route-manifest.ts` covers all 87 current v1 web routes.
- `src/api/client.ts` reads the `/api/v1` envelope and v1 development auth headers.
- `src/auth/session-store.ts` uses native secure storage.
- `src/design/tokens.ts` separates iOS chrome glass language from Android solid chrome.

## Verification

Run:

```bash
node scripts/qa/native-mobile-foundation.test.mjs
corepack pnpm --filter v1_mobile test
corepack pnpm --filter v1_mobile exec expo config --type public --json
```

Expected:

- `expoSdk: 56`
- `routeContractRows: 87`
- `routeManifestRows: 87`
- `missingRoutes: []`
- `extraRoutes: []`
- `hasWebViewDependency: false`
- Expo config reports `sdkVersion: "56.0.0"` and platforms include `ios` and `android`.
