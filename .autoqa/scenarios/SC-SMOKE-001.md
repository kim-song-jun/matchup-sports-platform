# SC-SMOKE-001 — Smoke — landing shell resolves without critical console errors

| key | value |
|---|---|
| Scope | minimal |
| Personas | guest |
| Source | apps/web/src/app/landing/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/landing |
| STEP-02 | wait_url | pattern=/landing(?:\?|$) |
| STEP-03 | screenshot | - |
| STEP-04 | assert_dom | - |
| STEP-05 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
