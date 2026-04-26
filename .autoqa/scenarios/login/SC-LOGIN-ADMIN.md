# SC-LOGIN-ADMIN — Admin dev-login storageState bootstrap

| key | value |
|---|---|
| URL | /login -> /home |
| Personas | __bootstrap__ |
| Scope | minimal |
| Task refs | docs/scenarios/10-profile-settings-admin.md; .github/tasks/61e-scenarios-admin-navigation.md |
| Source | `apps/web/src/app/(auth)/login/page.tsx` |
| Landing route | /home |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /login | login shell renders | STEP-01 |
| STEP-02 | type | `[data-testid='dev-login-input'] = ${AUTOQA_ADMIN_LABEL}` | persona label populated | STEP-02 |
| STEP-03 | click | `[data-testid='dev-login-submit']` | form submits | STEP-03 |
| STEP-04 | wait_url | `/home(?:\\?|$)` | authenticated redirect succeeds | STEP-04 |
| STEP-05 | export_storage_state | `.autoqa/cookies/admin.json` | storage state saved | STEP-05 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | __bootstrap__ | desktop.lg | light | dev-login-visible | bootstrap admin | storageState capture succeeds for `${AUTOQA_ADMIN_LABEL}` |
| C02 | __bootstrap__ | desktop.lg | light | no-db-role-promotion | post-login limitation | storage state exists but `/admin/*` can still reject without DB role promotion |

## DB truth

| key | value |
|---|---|
| write flow | no |
| db step | - |
| db_verify_level | not_required |
| tables | - |
| target query | - |

## Feature gap candidates

- This scenario only captures an authenticated storage state; true admin access still needs DB role promotion.
- If `/home` works but `/admin/*` shows an auth wall, treat that as expected environment setup drift.
