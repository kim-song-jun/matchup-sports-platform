# SC-AUTH-001 — Login shell and guest protection redirects

| key | value |
|---|---|
| Scope | core |
| Personas | guest |
| Source | apps/web/src/app/(auth)/login/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/login |
| STEP-02 | assert_dom | - |
| STEP-03 | navigate | target=/profile |
| STEP-04 | wait_url | pattern=/login(?:\?|$) |
| STEP-05 | navigate | target=/admin/dashboard |
| STEP-06 | wait_url | pattern=/login(?:\?|$) |
| STEP-07 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
