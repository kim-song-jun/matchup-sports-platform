# SC-LOGIN-TEAM-MANAGER — Bootstrap team-manager Playwright storage state via dev-login persona label

| key | value |
|---|---|
| Scope | minimal |
| Personas | __bootstrap__ |
| Source | apps/web/src/app/(auth)/login/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/login |
| STEP-02 | type | selector=[data-testid='dev-login-input']<br />value=${AUTOQA_TEAM_MANAGER_LABEL} |
| STEP-03 | click | selector=[data-testid='dev-login-submit'] |
| STEP-04 | wait_url | pattern=/home(?:\?|$) |
| STEP-05 | export_storage_state | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
