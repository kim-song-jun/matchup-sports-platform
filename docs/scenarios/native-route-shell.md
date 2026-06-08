# Native Route Shell

Status: Task 100 Wave 4 execution contract.

This scenario verifies that every current native parity route can render an Expo Router native shell. It intentionally does not claim full business-flow parity for every route. Domain-specific API integration, create/edit transactions, realtime behavior, and simulator/device QA remain in later Task 100 waves.

## Contract

- Route source: [native-route-parity-contract.md](./native-route-parity-contract.md)
- App manifest: `apps/v1_mobile/src/navigation/native-route-manifest.ts`
- Explicit core routes: `apps/v1_mobile/app/(tabs)/*`, `apps/v1_mobile/app/login.tsx`, `apps/v1_mobile/app/signup.tsx`, `apps/v1_mobile/app/onboarding/*`
- Fallback shell: `apps/v1_mobile/app/[...route].tsx`
- Shared renderer: `apps/v1_mobile/src/features/shell/NativeScreen.tsx`

## Required Properties

- Manifest route count remains 87.
- Every manifest route is handled by either an explicit Expo route file or the catch-all shell.
- Dynamic manifest entries such as `/matches/[id]` and `/my/reviews/[sourceType]/[sourceId]` match concrete native paths.
- The fallback shell names the native contract and states that business-specific flows still need native data integration.
- Package-level `test` runs foundation, core-flow, route-shell, and TypeScript checks together.

## Verification

Run:

```bash
node scripts/qa/native-route-shell-contract.test.mjs
corepack pnpm --filter v1_mobile test
NATIVE_MOBILE_SMOKE_ROUTES="/admin,/admin/audit,/auth/blocked,/callback/kakao,/chat,/chat/room-1,/landing,/login/email,/matches/match-1,/matches/match-1/edit,/matches/new/place-time,/my/reviews/match/match-1,/notices/notice-1,/notifications/read,/team-matches/team-match-1,/team-matches/new/team,/teams/team-1/members,/teams/search/empty,/terms" node scripts/qa/native-mobile-web-smoke.mjs
```

Expected:

- `manifestRoutes: 87`
- `handledRoutes: 87`
- `missingHandledRoutes: []`
- `catchAllExists: true`
- Browser smoke reports `failures: []` and `consoleErrors: []`.

## Evidence

- `.omo/ulw-loop/evidence/native-exec-wave4-route-shell.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave4-route-shell.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave4-route-shell-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-route-shell-smoke-wave4/`
