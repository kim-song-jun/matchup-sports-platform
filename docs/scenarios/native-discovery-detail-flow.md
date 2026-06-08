# Native Discovery Detail Flow

Status: Verified
Task: 100 native platform expansion, Wave 6

## Scope

This scenario verifies native discovery/search/detail route-family data for `apps/v1_mobile`.

Covered route patterns:

- Matches: `/matches`, `/matches/[id]`, `/matches/empty`, `/matches/error`, `/matches/filter`
- Team matches: `/team-matches`, `/team-matches/[id]`, `/team-matches/empty`, `/team-matches/error`, `/team-matches/filter`
- Teams: `/teams`, `/teams/[id]`, `/teams/filter`, `/teams/search`, `/teams/search/empty`, `/teams/search/error`
- Search: `/search`, `/search/empty`, `/search/error`, `/search/new`, `/search/stale`
- Notices: `/notices`, `/notices/[id]`

## Contract

- Native discovery flow data must cover 23/23 route patterns with no extra or missing route rows.
- Dynamic detail routes must match concrete paths such as `/matches/match-1`, `/team-matches/team-match-1`, `/teams/team-1`, and `/notices/notice-1`.
- Copy must keep API boundaries explicit: `/api/v1/matches`, `/api/v1/team-matches`, `/api/v1/teams`, `/api/v1/search/recent`, `/api/v1/notices`.
- Search results must remain honest: recent search persistence does not imply unified search; result pages use domain list APIs.
- Loading, empty, and error states must be named as real user-facing states.

## Verification

```sh
node scripts/qa/native-discovery-flow-contract.test.mjs
corepack pnpm --filter v1_mobile test
```

Browser channel:

```sh
NATIVE_MOBILE_WEB_URL=http://localhost:8100 \
NATIVE_MOBILE_SMOKE_ROUTES=/matches,/matches/match-1,/matches/empty,/matches/error,/matches/filter,/team-matches,/team-matches/team-match-1,/team-matches/empty,/team-matches/error,/team-matches/filter,/teams,/teams/team-1,/teams/filter,/teams/search,/teams/search/empty,/teams/search/error,/search,/search/empty,/search/error,/search/new,/search/stale,/notices,/notices/notice-1 \
NATIVE_MOBILE_SMOKE_DIR=.omo/ulw-loop/evidence/native-discovery-flow-smoke-wave6 \
node scripts/qa/native-mobile-web-smoke.mjs
```

Evidence:

- `.omo/ulw-loop/evidence/native-exec-wave6-discovery-flow.BROWSER.txt`
- `.omo/ulw-loop/evidence/native-exec-wave6-discovery-flow.RED.txt`
- `.omo/ulw-loop/evidence/native-exec-wave6-discovery-flow-regression.GREEN.txt`
- `.omo/ulw-loop/evidence/native-discovery-flow-smoke-wave6/`

## Result

- Discovery contract: `discoveryFlowRows=23`, `missingDiscoveryRoutes=[]`, `extraDiscoveryRoutes=[]`.
- Browser smoke: 23 screenshots, `failures=[]`, `consoleErrors=[]`.
- Malformed route RED: replacing `/matches/error` with `/matches/error-missing` fails with `missingDiscoveryRoutes=["/matches/error"]`.
- Regression bundle: Wave 0-5 contracts, discovery contract, `v1_mobile` typecheck/test, and scoped `git diff --check` passed.
