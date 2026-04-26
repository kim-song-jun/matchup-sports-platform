# SC-HOME-001 — Authenticated home feed and discovery deep-link shell

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/home/home-client.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/home |
| STEP-02 | wait | - |
| STEP-03 | screenshot | - |
| STEP-04 | assert_dom | - |
| STEP-05 | navigate | target=/matches?sport=futsal |
| STEP-06 | assert_dom | - |
| STEP-07 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
