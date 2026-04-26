# SC-ACCOUNT-001 — Profile shell, settings navigation, and notification preference persistence

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/settings/notifications/page.tsx |
| Landing route | - |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/profile |
| STEP-02 | screenshot | - |
| STEP-03 | navigate | target=/settings/notifications |
| STEP-04 | assert_dom | - |
| STEP-05 | click | selector=button[role='switch'][aria-label^='매치 알림'] |
| STEP-06 | db_checkpoint | db=target_row |
| STEP-07 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
