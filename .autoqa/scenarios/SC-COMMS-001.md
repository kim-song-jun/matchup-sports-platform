# SC-COMMS-001 — Notification center, mark-all-read, and feed grouping

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/notifications/page.tsx |
| Landing route | - |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/notifications |
| STEP-02 | assert_dom | - |
| STEP-03 | click | selector=button[aria-label='모든 알림 읽음 처리'] |
| STEP-04 | db_checkpoint | db=target_row |
| STEP-05 | navigate | target=/feed |
| STEP-06 | screenshot | - |
| STEP-07 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
