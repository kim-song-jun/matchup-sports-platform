# Native Operations Account Realtime Flow

Status: Verified
Task: 100 native platform expansion, Wave 7

## Scope

This scenario verifies native create/edit/management/account/realtime route-family data for `apps/v1_mobile`.

Covered route patterns:

- Match operations: `/matches/[id]/edit`, `/matches/joined`, `/matches/new`, `/matches/new/complete`, `/matches/new/confirm`, `/matches/new/place-time`, `/matches/new/sport`, `/matches/participants`
- Team match operations: `/team-matches/[id]/edit`, `/team-matches/new`, `/team-matches/new/complete`, `/team-matches/new/condition`, `/team-matches/new/confirm`, `/team-matches/new/info`, `/team-matches/new/place-time`, `/team-matches/new/sport`, `/team-matches/new/team`
- Team management: `/teams/[id]/edit`, `/teams/[id]/members`, `/teams/new`
- Account and settings: `/my`, `/my/matches/created`, `/my/matches/joined`, `/my/profile/edit`, `/my/settings`, `/my/settings/legal`, `/my/settings/location`, `/my/settings/notifications`, `/my/settings/sports`, `/my/settings/withdrawal`, `/my/teams`, `/my/teams/[id]`, `/my/teams/[id]/members`, `/my/teams/members`
- Reviews: `/my/reviews`, `/my/reviews/[sourceType]/[sourceId]`, `/my/reviews/received`
- Realtime: `/chat`, `/chat/[id]`, `/notifications`, `/notifications/read`

## Contract

- Native operations flow data must cover 41/41 route patterns with no extra or missing route rows.
- Dynamic route matching must resolve concrete edit/detail paths such as `/matches/match-1/edit`, `/team-matches/team-match-1/edit`, `/teams/team-1/members`, `/my/reviews/match/match-1`, `/my/teams/team-1`, and `/chat/room-1`.
- Native copy must keep server-owned permission checks explicit for match, team-match, team, review, profile, notification, and chat surfaces.
- Transactional screens must say pending, failed, or unavailable outcomes plainly; no create/edit/review/withdrawal screen may imply fake success.
- Realtime screens must expose reconnect and read-state backfill expectations without allowing optimistic read navigation to lose the route transition.

## Verification

```sh
node scripts/qa/native-operations-flow-contract.test.mjs
corepack pnpm --filter v1_mobile test
```

Browser channel:

```sh
NATIVE_MOBILE_WEB_URL=http://localhost:8101 \
NATIVE_MOBILE_SMOKE_ROUTES=/matches/match-1/edit,/matches/joined,/matches/new,/matches/new/complete,/matches/new/confirm,/matches/new/place-time,/matches/new/sport,/matches/participants,/team-matches/team-match-1/edit,/team-matches/new,/team-matches/new/complete,/team-matches/new/condition,/team-matches/new/confirm,/team-matches/new/info,/team-matches/new/place-time,/team-matches/new/sport,/team-matches/new/team,/teams/team-1/edit,/teams/team-1/members,/teams/new,/my,/my/matches/created,/my/matches/joined,/my/profile/edit,/my/reviews,/my/reviews/match/match-1,/my/reviews/received,/my/settings,/my/settings/legal,/my/settings/location,/my/settings/notifications,/my/settings/sports,/my/settings/withdrawal,/my/teams,/my/teams/team-1,/my/teams/team-1/members,/my/teams/members,/chat,/chat/room-1,/notifications,/notifications/read \
NATIVE_MOBILE_SMOKE_DIR=.omo/ulw-loop/evidence/native-operations-flow-smoke-wave7 \
node scripts/qa/native-mobile-web-smoke.mjs
```

Evidence:

- `.omo/ulw-loop/evidence/native-exec-wave7-operations-flow.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave7-operations-flow.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave7-operations-flow-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-operations-flow-smoke-wave7/`

## Result

- Operations contract: `operationsFlowRows=41`, `missingOperationRoutes=[]`, `extraOperationRoutes=[]`.
- Contract markers: API boundaries, permission honesty, transaction honesty, optimistic navigation, realtime reconnect, dynamic matcher, and `NativeScreen` operations flow binding are all present.
- Browser smoke: 41 screenshots, `failures=[]`, `consoleErrors=[]`.
- Malformed route RED: replacing `/team-matches/new/team` with `/team-matches/new/team-missing` fails with `missingOperationRoutes=["/team-matches/new/team"]`.
- Regression bundle: Wave 0-6 contracts, operations contract, `v1_mobile` typecheck/test, and scoped `git diff --check` passed.
