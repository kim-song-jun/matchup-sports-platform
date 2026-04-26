# SC-SMOKE-003 — Smoke — root route redirects guest to landing

| key | value |
|---|---|
| Scope | minimal |
| Personas | guest |
| Source | apps/web/src/app/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/ |
| STEP-02 | wait_url | pattern=/landing(?:\?|$) |
| STEP-03 | screenshot | - |
| STEP-04 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
