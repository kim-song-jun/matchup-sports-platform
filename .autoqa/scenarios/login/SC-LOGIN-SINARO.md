# SC-LOGIN-SINARO — Sinaro dev-login storageState bootstrap

| key | value |
|---|---|
| URL | /login -> /home |
| Personas | __bootstrap__ |
| Scope | minimal |
| Task refs | docs/scenarios/01-auth-and-session.md; .github/tasks/61a-scenarios-public-auth.md |
| Source | `apps/web/src/app/(auth)/login/page.tsx` |
| Landing route | /home |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /login | login shell renders | STEP-01 |
| STEP-02 | type | `[data-testid='dev-login-input'] = ${AUTOQA_SINARO_LABEL}` | persona label populated | STEP-02 |
| STEP-03 | click | `[data-testid='dev-login-submit']` | form submits | STEP-03 |
| STEP-04 | wait_url | `/home(?:\\?|$)` | authenticated redirect succeeds | STEP-04 |
| STEP-05 | export_storage_state | `.autoqa/cookies/sinaro.json` | storage state saved | STEP-05 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | __bootstrap__ | desktop.lg | light | dev-login-visible | bootstrap sinaro | storageState capture succeeds for `${AUTOQA_SINARO_LABEL}` |
| C02 | __bootstrap__ | desktop.lg | light | dev-login-hidden | fail-fast | operator exposes `NEXT_PUBLIC_SHOW_DEV_LOGIN=true` before rerun |

## DB truth

| key | value |
|---|---|
| write flow | no |
| db step | - |
| db_verify_level | not_required |
| tables | - |
| target query | - |

## Feature gap candidates

- Dev-login is feature-flagged, so a hidden panel is an environment issue first.
- If redirect stalls, confirm local seed data still matches `${AUTOQA_SINARO_LABEL}`.
