# SC-LOGIN-MERCENARY-HOST — Mercenary-host dev-login storageState bootstrap

| key | value |
|---|---|
| URL | /login -> /home |
| Personas | __bootstrap__ |
| Scope | minimal |
| Task refs | docs/scenarios/06-mercenary-flows.md; .github/tasks/61c-scenarios-lesson-market-mercenary-venue.md |
| Source | `apps/web/src/app/(auth)/login/page.tsx` |
| Landing route | /home |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /login | login shell renders | STEP-01 |
| STEP-02 | type | `[data-testid='dev-login-input'] = ${AUTOQA_MERCENARY_HOST_LABEL}` | persona label populated | STEP-02 |
| STEP-03 | click | `[data-testid='dev-login-submit']` | form submits | STEP-03 |
| STEP-04 | wait_url | `/home(?:\\?|$)` | authenticated redirect succeeds | STEP-04 |
| STEP-05 | export_storage_state | `.autoqa/cookies/mercenary-host.json` | storage state saved | STEP-05 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | __bootstrap__ | desktop.lg | light | dev-login-visible | bootstrap mercenary-host | storageState capture succeeds for `${AUTOQA_MERCENARY_HOST_LABEL}` |
| C02 | __bootstrap__ | desktop.lg | light | hidden-panel | fail-fast | operator restores the dev-login panel before rerun |

## DB truth

| key | value |
|---|---|
| write flow | no |
| db step | - |
| db_verify_level | not_required |
| tables | - |
| target query | - |

## Feature gap candidates

- Mercenary-host coverage later assumes this persona can access `/mercenary/new`.
- If only this persona fails, check seed nickname drift before touching auth code.
